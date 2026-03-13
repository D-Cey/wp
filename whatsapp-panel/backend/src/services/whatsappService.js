const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');

const SESSION_PATH = process.env.WA_SESSION_PATH || './sessions';
if (!fs.existsSync(SESSION_PATH)) fs.mkdirSync(SESSION_PATH, { recursive: true });

// Active WA clients map: { numberId: Client }
const clients = new Map();
const lastQRs = new Map(); // Son QR'ları sakla
let io = null;

function setIO(socketIO) {
  io = socketIO;
  // Yeni socket bağlandığında bekleyen QR'ları gönder
  io.on('connection', (socket) => {
    lastQRs.forEach((qr, numberId) => {
      socket.emit('wa:qr', { numberId, qr });
    });
  });
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
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
    lastQRs.set(numberId, qrDataUrl); // Sakla
    db.updateNumberStatus(numberId, 'qr_pending', null);
    emit('wa:qr', { numberId, qr: qrDataUrl });
    emit('wa:status', { numberId, status: 'qr_pending' });
  });

  client.on('ready', async () => {
    const phone = client.info?.wid?.user || '';
    console.log(`[${numberId}] Ready! Phone: ${phone}`);
    lastQRs.delete(numberId); // QR'ı temizle
    await db.updateNumberStatus(numberId, 'connected', phone);
    emit('wa:status', { numberId, status: 'connected', phone });

    // Geçmiş mesajları çek
    try {
      console.log(`[${numberId}] Geçmiş mesajlar çekiliyor...`);
      const chats = await client.getChats();
      let totalImported = 0;

      for (const chat of chats) {
        try {
          // Grup sohbetlerini atla
          if (chat.isGroup) continue;

          const contactWaId = `${chat.id.user}@c.us`;
          const phone2 = chat.id.user;

          // Kişi adını al
          let contactName = chat.name || null;

          await db.upsertContact(contactWaId, phone2, contactName);

          // Son 50 mesajı çek
          const messages = await chat.fetchMessages({ limit: 50 });
          if (!messages || messages.length === 0) continue;

          // En eski mesajdan en yeniye sırala
          const sorted = messages.sort((a, b) => a.timestamp - b.timestamp);
          const lastMsg = sorted[sorted.length - 1];
          const lastTimestamp = new Date(lastMsg.timestamp * 1000).toISOString();

          // Konuşmayı oluştur
          await db.upsertConversation(numberId, contactWaId, lastMsg.body || '', lastTimestamp);

          // Her mesajı kaydet
          for (const msg of sorted) {
            if (!msg.body) continue;
            const ts = new Date(msg.timestamp * 1000).toISOString();
            const conv = await db.getConversation(numberId, contactWaId);
            if (conv) {
              await db.insertMessage(
                msg.id._serialized,
                conv.id,
                numberId,
                contactWaId,
                msg.body,
                msg.fromMe,
                ts
              );
              totalImported++;
            }
          }
        } catch (e) {
          // Tek sohbet hata verirse devam et
        }
      }

      console.log(`[${numberId}] ${totalImported} geçmiş mesaj içe aktarıldı`);
      const conversations = await db.getConversations();
      emit('wa:conversations_updated', conversations);
    } catch (e) {
      console.error(`[${numberId}] Geçmiş mesaj hatası:`, e.message);
    }
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
      
      // Normalize @lid to @c.us
      let contactWaId = msg.from;
      let phone = '';
      try {
        const contact = await msg.getContact();
        const num = contact.number || contact.id?.user || contactWaId.replace(/@.*/, '');
        phone = num;
        contactWaId = `${num}@c.us`;
      } catch (e) {
        phone = contactWaId.replace(/@.*/, '');
        contactWaId = `${phone}@c.us`;
      }

      const body = msg.body || '';
      const timestamp = new Date(msg.timestamp * 1000).toISOString();

      let contactName = null;
      try {
        const contact = await msg.getContact();
        contactName = contact.pushname || contact.name || null;
      } catch (e) {}

      await db.upsertContact(contactWaId, phone, contactName);
      const convId = await db.upsertConversation(numberId, contactWaId, body, timestamp);
      const msgId = await db.insertMessage(
        msg.id._serialized, convId, numberId, contactWaId, body, false, timestamp
      );

      const conversations = await db.getConversations();
      const contact = await db.getContact(contactWaId);
      const number = await db.getNumber(numberId);

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

  // message_create is handled by sendMessage route directly
  // No need to handle it here to avoid duplicates

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

  await db.upsertContact(chatId, phone, null);
  const convId = await db.upsertConversation(numberId, chatId, body, timestamp);
  await db.updateConversationAfterSend(numberId, chatId, body, timestamp);

  const conv = await db.getConversation(numberId, chatId);
  const msgId = await db.insertMessage(
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
  const numbers = await db.getNumbers();
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
