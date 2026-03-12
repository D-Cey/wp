const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');

const SESSION_PATH = process.env.WA_SESSION_PATH || './sessions';
if (!fs.existsSync(SESSION_PATH)) fs.mkdirSync(SESSION_PATH, { recursive: true });

// Active WA clients map: { numberId: Client }
const clients = new Map();
let io = null;

function setIO(socketIO) {
  io = socketIO;
}

function emit(event, data) {
  if (io) io.emit(event, data);
}

async function createClient(numberId, label) {
  // Already exists?
  if (clients.has(numberId)) {
    const existing = clients.get(numberId);
    if (existing.info) return { status: 'already_connected' };
  }

  // Save to DB
  db.upsertNumber(numberId, label);

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: numberId,
      dataPath: SESSION_PATH,
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
      ],
    },
  });

  clients.set(numberId, client);

  client.on('qr', async (qr) => {
    console.log(`[${numberId}] QR received`);
    const qrDataUrl = await qrcode.toDataURL(qr);
    db.updateNumberStatus(numberId, 'qr_pending', null);
    emit('wa:qr', { numberId, qr: qrDataUrl });
    emit('wa:status', { numberId, status: 'qr_pending' });
  });

  client.on('ready', () => {
    const phone = client.info?.wid?.user || '';
    console.log(`[${numberId}] Ready! Phone: ${phone}`);
    db.updateNumberStatus(numberId, 'connected', phone);
    emit('wa:status', { numberId, status: 'connected', phone });
  });

  client.on('authenticated', () => {
    console.log(`[${numberId}] Authenticated`);
    db.updateNumberStatus(numberId, 'authenticated', null);
    emit('wa:status', { numberId, status: 'authenticated' });
  });

  client.on('auth_failure', (msg) => {
    console.error(`[${numberId}] Auth failure:`, msg);
    db.updateNumberStatus(numberId, 'auth_failed', null);
    emit('wa:status', { numberId, status: 'auth_failed' });
    clients.delete(numberId);
  });

  client.on('disconnected', (reason) => {
    console.log(`[${numberId}] Disconnected:`, reason);
    db.updateNumberStatus(numberId, 'disconnected', null);
    emit('wa:status', { numberId, status: 'disconnected' });
    clients.delete(numberId);
  });

  client.on('message', async (msg) => {
    try {
      if (msg.from === 'status@broadcast') return;
      
      const contactWaId = msg.from; // e.g. "905321234567@c.us"
      const phone = contactWaId.replace('@c.us', '');
      const body = msg.body || '';
      const timestamp = new Date(msg.timestamp * 1000).toISOString();

      // Get or create contact
      let contactName = null;
      try {
        const contact = await msg.getContact();
        contactName = contact.pushname || contact.name || null;
      } catch (e) {}

      db.upsertContact(contactWaId, phone, contactName);

      // Upsert conversation
      const convId = db.upsertConversation(numberId, contactWaId, body, timestamp);

      // Insert message
      const msgId = db.insertMessage(
        msg.id._serialized,
        convId,
        numberId,
        contactWaId,
        body,
        false,
        timestamp
      );

      // Get full conversation data for UI
      const conversations = db.getConversations();
      const contact = db.getContact(contactWaId);
      const number = db.getNumber(numberId);

      emit('wa:message', {
        numberId,
        conversationId: convId,
        messageId: msgId,
        contactWaId,
        phone,
        contactName: contact?.name || contactName,
        numberLabel: number?.label,
        body,
        fromMe: false,
        timestamp,
      });

      emit('wa:conversations_updated', conversations);
    } catch (err) {
      console.error(`[${numberId}] Message processing error:`, err);
    }
  });

  client.on('message_create', async (msg) => {
    // Outgoing messages sent from this client
    if (!msg.fromMe) return;
    try {
      const contactWaId = msg.to;
      const phone = contactWaId.replace('@c.us', '');
      const body = msg.body || '';
      const timestamp = new Date(msg.timestamp * 1000).toISOString();

      db.upsertContact(contactWaId, phone, null);
      db.upsertConversation(numberId, contactWaId, body, timestamp);
      db.updateConversationAfterSend(numberId, contactWaId, body, timestamp);

      const conv = db.getConversation(numberId, contactWaId);
      if (conv) {
        const msgId = db.insertMessage(
          msg.id._serialized,
          conv.id,
          numberId,
          contactWaId,
          body,
          true,
          timestamp
        );

        emit('wa:message', {
          numberId,
          conversationId: conv.id,
          messageId: msgId,
          contactWaId,
          phone,
          body,
          fromMe: true,
          timestamp,
        });

        const conversations = db.getConversations();
        emit('wa:conversations_updated', conversations);
      }
    } catch (err) {
      console.error(`[${numberId}] message_create error:`, err);
    }
  });

  client.initialize();
  return { status: 'initializing' };
}

async function sendMessage(numberId, to, body) {
  const client = clients.get(numberId);
  if (!client) throw new Error('Client not found or not connected');
  if (!client.info) throw new Error('Client not ready yet');

  // Format number
  let chatId = to.replace(/\D/g, '');
  if (!chatId.endsWith('@c.us')) chatId = `${chatId}@c.us`;

  const msg = await client.sendMessage(chatId, body);
  const phone = chatId.replace('@c.us', '');
  const timestamp = new Date(msg.timestamp * 1000).toISOString();

  // Ensure conversation exists
  db.upsertContact(chatId, phone, null);
  const convId = db.upsertConversation(numberId, chatId, body, timestamp);
  db.updateConversationAfterSend(numberId, chatId, body, timestamp);

  const conv = db.getConversation(numberId, chatId);
  const msgId = db.insertMessage(
    msg.id._serialized,
    conv?.id || convId,
    numberId,
    chatId,
    body,
    true,
    timestamp
  );

  return {
    conversationId: conv?.id || convId,
    messageId: msgId,
    timestamp,
  };
}

async function disconnectClient(numberId) {
  const client = clients.get(numberId);
  if (client) {
    await client.destroy();
    clients.delete(numberId);
  }
  db.updateNumberStatus(numberId, 'disconnected', null);
}

function getClientStatus(numberId) {
  const client = clients.get(numberId);
  if (!client) return 'disconnected';
  if (client.info) return 'connected';
  return 'connecting';
}

// Auto-reconnect saved numbers on startup
async function initializeSavedNumbers() {
  const numbers = db.getNumbers();
  for (const num of numbers) {
    if (num.status === 'connected' || num.status === 'authenticated') {
      console.log(`[startup] Re-initializing ${num.id} (${num.label})`);
      await createClient(num.id, num.label);
      // Small delay between clients
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

module.exports = {
  setIO,
  createClient,
  sendMessage,
  disconnectClient,
  getClientStatus,
  initializeSavedNumbers,
  clients,
};
