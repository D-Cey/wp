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
      protocolTimeout: 120000,
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
    lastQRs.delete(numberId);
    await db.updateNumberStatus(numberId, 'connected', phone);
    emit('wa:status', { numberId, status: 'connected', phone });

    // Geçmiş mesajları 15 sn sonra arka planda çek - sadece ilk kez
    setTimeout(async () => {
      try {
        // Bu numara için zaten mesaj varsa geçmiş çekme
        const existing = await db.getConversationsByNumber(numberId);
        if (existing && existing.length > 0) {
          console.log(`[${numberId}] Zaten ${existing.length} konuşma var, geçmiş atlanıyor.`);
          return;
        }
        console.log(`[${numberId}] Geçmiş mesajlar çekiliyor...`);
        const chats = await client.getChats();
        let totalImported = 0;
        // Sadece son 10 sohbet
        const recent = chats.filter(c => !c.isGroup).slice(0, 10);
        for (const chat of recent) {
          try {
            const contactWaId = `${chat.id.user}@c.us`;
            const phone2 = chat.id.user;
            await db.upsertContact(contactWaId, phone2, chat.name || null);
            const messages = await chat.fetchMessages({ limit: 20 });
            if (!messages || messages.length === 0) continue;
            const sorted = messages.sort((a, b) => a.timestamp - b.timestamp);
            const lastMsg = sorted[sorted.length - 1];
            const lastTimestamp = new Date(lastMsg.timestamp * 1000).toISOString();
            await db.upsertConversation(numberId, contactWaId, lastMsg.body || '', lastTimestamp);
            for (const msg of sorted) {
              if (!msg.body) continue;
              const ts = new Date(msg.timestamp * 1000).toISOString();
              const conv = await db.getConversation(numberId, contactWaId);
              if (conv) {
                await db.insertMessage(msg.id._serialized, conv.id, numberId, contactWaId, msg.body, msg.fromMe, ts);
                totalImported++;
              }
            }
            // Sohbetler arası 1 sn bekle
            await new Promise(r => setTimeout(r, 1000));
          } catch (e) {}
        }
        console.log(`[${numberId}] ${totalImported} geçmiş mesaj içe aktarıldı`);
        const conversations = await db.getConversations();
        emit('wa:conversations_updated', conversations);
      } catch (e) {
        console.error(`[${numberId}] Geçmiş mesaj hatası:`, e.message);
      }
    }, 15000);
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
      console.log(`[${numberId}] Gelen mesaj: from=${msg.from} body=${msg.body?.slice(0,30)}`);

      let contactWaId = msg.from;
      let phone = '';

      // @lid formatını @c.us'a çevir
      if (contactWaId.includes('@lid')) {
        try {
          const contact = await msg.getContact();
          const num = contact.number || contact.id?.user;
          console.log(`[${numberId}] Contact resolution: lid=${contactWaId} number=${num} id=${contact.id?._serialized}`);
          if (num) {
            phone = num;
            contactWaId = `${num}@c.us`;
          } else {
            phone = contactWaId.replace(/@.*/, '');
            contactWaId = `${phone}@c.us`;
          }
        } catch (e) {
          console.log(`[${numberId}] getContact failed: ${e.message}`);
          phone = contactWaId.replace(/@.*/, '');
          contactWaId = `${phone}@c.us`;
        }
      } else {
        phone = contactWaId.replace(/@.*/, '');
        if (!contactWaId.includes('@c.us')) contactWaId = `${phone}@c.us`;
      }
      console.log(`[${numberId}] Final contactWaId: ${contactWaId}`);

      const mediaLabel = {
        image: '[📷 Resim]', video: '[🎥 Video]', audio: '[🎵 Ses]',
        voice: '[🎤 Sesli Mesaj]', document: '[📄 Dosya]', sticker: '[🎭 Çıkartma]',
        location: '[📍 Konum]', contact_card: '[👤 Kişi]',
      };
      const body = msg.body || mediaLabel[msg.type] || (msg.hasMedia ? '[📎 Medya]' : '');
      if (!body) return;
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

  // message_create - diğer cihazlardan gönderilen mesajları yakala
  client.on('message_create', async (msg) => {
    try {
      if (!msg.fromMe) return;
      if (msg.from === 'status@broadcast') return;
      console.log(`[${numberId}] Gönderilen mesaj (message_create): to=${msg.to} body=${msg.body?.slice(0,30)}`);

      let contactWaId = msg.to;
      let phone = '';
      const mediaLabel = {
        image: '[📷 Resim]', video: '[🎥 Video]', audio: '[🎵 Ses]',
        voice: '[🎤 Sesli Mesaj]', document: '[📄 Dosya]', sticker: '[🎭 Çıkartma]',
        location: '[📍 Konum]', contact_card: '[👤 Kişi]',
      };

      if (contactWaId.includes('@lid') || contactWaId.includes('@s.whatsapp')) {
        try {
          const contact = await msg.getContact();
          const num = contact.number || contact.id?.user;
          if (num) {
            phone = num;
            contactWaId = `${num}@c.us`;
          } else {
            phone = contactWaId.replace(/@.*/, '');
            contactWaId = `${phone}@c.us`;
          }
        } catch (e) {
          console.log(`[${numberId}] message_create getContact failed: ${e.message}`);
          phone = contactWaId.replace(/@.*/, '');
          contactWaId = `${phone}@c.us`;
        }
      } else {
        phone = contactWaId.replace(/@.*/, '');
        if (!contactWaId.includes('@c.us')) contactWaId = `${phone}@c.us`;
      }
      console.log(`[${numberId}] message_create Final contactWaId: ${contactWaId}`);

      const body = msg.body || mediaLabel[msg.type] || (msg.hasMedia ? '[📎 Medya]' : '');
      if (!body) return;
      const timestamp = new Date(msg.timestamp * 1000).toISOString();
      const convId = await db.upsertConversation(numberId, contactWaId, body, timestamp, true);
      await db.updateConversationAfterSend(numberId, contactWaId, body, timestamp);
      await db.insertMessage(
        msg.id._serialized, convId, numberId, contactWaId, body, true, timestamp
      );

      const conversations = await db.getConversations();
      emit('wa:conversations_updated', conversations);
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

  let phone = to.replace(/\D/g, '');
  let chatId = `${phone}@c.us`;
  let msg;

  try {
    msg = await client.sendMessage(chatId, body);
  } catch (e) {
    if (e.message && (e.message.includes('lid') || e.message.includes('anonymous'))) {
      try {
        // Mevcut sohbetlerden doğru ID'yi bul
        const chats = await client.getChats();
        const chat = chats.find(c => !c.isGroup && c.id.user === phone);
        if (chat) {
          chatId = chat.id._serialized;
          msg = await client.sendMessage(chatId, body);
        } else {
          throw new Error('Bu numara ile daha önce mesajlaşılmamış. Önce WhatsApp\'tan mesaj başlatın.');
        }
      } catch (e2) {
        throw new Error(e2.message);
      }
    } else {
      throw new Error('Mesaj gönderilemedi: ' + e.message);
    }
  }
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
