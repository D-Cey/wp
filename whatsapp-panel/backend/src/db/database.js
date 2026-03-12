const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/panel.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS numbers (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    phone TEXT,
    status TEXT DEFAULT 'disconnected',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_id TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number_id TEXT NOT NULL,
    contact_wa_id TEXT NOT NULL,
    last_message TEXT,
    last_message_at DATETIME,
    unread_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(number_id, contact_wa_id),
    FOREIGN KEY (number_id) REFERENCES numbers(id),
    FOREIGN KEY (contact_wa_id) REFERENCES contacts(wa_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_message_id TEXT UNIQUE,
    conversation_id INTEGER NOT NULL,
    number_id TEXT NOT NULL,
    contact_wa_id TEXT NOT NULL,
    body TEXT NOT NULL,
    from_me INTEGER DEFAULT 0,
    timestamp DATETIME NOT NULL,
    status TEXT DEFAULT 'sent',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );
`);

module.exports = {
  db,

  // Numbers
  getNumbers: () => db.prepare('SELECT * FROM numbers ORDER BY label').all(),
  getNumber: (id) => db.prepare('SELECT * FROM numbers WHERE id = ?').get(id),
  upsertNumber: (id, label) => db.prepare(
    'INSERT INTO numbers (id, label) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET label = ?'
  ).run(id, label, label),
  updateNumberStatus: (id, status, phone) => db.prepare(
    'UPDATE numbers SET status = ?, phone = ? WHERE id = ?'
  ).run(status, phone || null, id),

  // Contacts
  getContact: (waId) => db.prepare('SELECT * FROM contacts WHERE wa_id = ?').get(waId),
  upsertContact: (waId, phone, name) => {
    const existing = db.prepare('SELECT * FROM contacts WHERE wa_id = ?').get(waId);
    if (existing) {
      if (!existing.name && name) {
        db.prepare('UPDATE contacts SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE wa_id = ?').run(name, waId);
      }
      return db.prepare('SELECT * FROM contacts WHERE wa_id = ?').get(waId);
    }
    db.prepare('INSERT INTO contacts (wa_id, phone, name) VALUES (?, ?, ?)').run(waId, phone, name || null);
    return db.prepare('SELECT * FROM contacts WHERE wa_id = ?').get(waId);
  },
  updateContactName: (waId, name) => db.prepare(
    'UPDATE contacts SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE wa_id = ?'
  ).run(name, waId),

  // Conversations
  getConversations: () => db.prepare(`
    SELECT c.*, 
           co.name as contact_name, co.phone as contact_phone,
           n.label as number_label
    FROM conversations c
    JOIN contacts co ON c.contact_wa_id = co.wa_id
    JOIN numbers n ON c.number_id = n.id
    ORDER BY c.last_message_at DESC
  `).all(),
  getConversation: (numberId, contactWaId) => db.prepare(
    'SELECT * FROM conversations WHERE number_id = ? AND contact_wa_id = ?'
  ).get(numberId, contactWaId),
  upsertConversation: (numberId, contactWaId, lastMessage, timestamp) => {
    const existing = db.prepare(
      'SELECT * FROM conversations WHERE number_id = ? AND contact_wa_id = ?'
    ).get(numberId, contactWaId);
    if (existing) {
      db.prepare(
        'UPDATE conversations SET last_message = ?, last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?'
      ).run(lastMessage, timestamp, existing.id);
      return existing.id;
    }
    const result = db.prepare(
      'INSERT INTO conversations (number_id, contact_wa_id, last_message, last_message_at, unread_count) VALUES (?, ?, ?, ?, 1)'
    ).run(numberId, contactWaId, lastMessage, timestamp);
    return result.lastInsertRowid;
  },
  markConversationRead: (id) => db.prepare(
    'UPDATE conversations SET unread_count = 0 WHERE id = ?'
  ).run(id),
  updateConversationAfterSend: (numberId, contactWaId, lastMessage, timestamp) => db.prepare(
    'UPDATE conversations SET last_message = ?, last_message_at = ?, unread_count = 0 WHERE number_id = ? AND contact_wa_id = ?'
  ).run(lastMessage, timestamp, numberId, contactWaId),

  // Messages
  getMessages: (conversationId) => db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC'
  ).all(conversationId),
  insertMessage: (waMessageId, conversationId, numberId, contactWaId, body, fromMe, timestamp) => {
    try {
      const result = db.prepare(
        'INSERT INTO messages (wa_message_id, conversation_id, number_id, contact_wa_id, body, from_me, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(waMessageId || null, conversationId, numberId, contactWaId, body, fromMe ? 1 : 0, timestamp);
      return result.lastInsertRowid;
    } catch (e) {
      return null;
    }
  },
};
