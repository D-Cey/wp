const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/panel.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

// Promisify helpers
const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve({ lastID: this.lastID, changes: this.changes });
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

// Init tables
const initDB = async () => {
  await run('PRAGMA journal_mode = WAL');
  await run(`CREATE TABLE IF NOT EXISTS numbers (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    phone TEXT,
    status TEXT DEFAULT 'disconnected',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_id TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number_id TEXT NOT NULL,
    contact_wa_id TEXT NOT NULL,
    last_message TEXT,
    last_message_at DATETIME,
    unread_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(number_id, contact_wa_id)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_message_id TEXT UNIQUE,
    conversation_id INTEGER NOT NULL,
    number_id TEXT NOT NULL,
    contact_wa_id TEXT NOT NULL,
    body TEXT NOT NULL,
    from_me INTEGER DEFAULT 0,
    timestamp DATETIME NOT NULL,
    status TEXT DEFAULT 'sent',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
};

module.exports = {
  initDB,
  // Numbers
  getNumbers: () => all('SELECT * FROM numbers ORDER BY label'),
  getNumber: (id) => get('SELECT * FROM numbers WHERE id = ?', [id]),
  upsertNumber: (id, label) => run(
    'INSERT INTO numbers (id, label) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET label = ?',
    [id, label, label]
  ),
  clearNumberStatuses: async () => {
    await run("UPDATE numbers SET status = 'disconnected'");
  },
  deleteNumber: async (id) => {
    await run('DELETE FROM numbers WHERE id = ?', [id]);
  },
  updateNumberStatus: (id, status, phone) => run(
    'UPDATE numbers SET status = ?, phone = ? WHERE id = ?',
    [status, phone || null, id]
  ),

  // Contacts
  getContact: (waId) => get('SELECT * FROM contacts WHERE wa_id = ?', [waId]),
  upsertContact: async (waId, phone, name) => {
    const existing = await get('SELECT * FROM contacts WHERE wa_id = ?', [waId]);
    if (existing) {
      if (!existing.name && name) {
        await run('UPDATE contacts SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE wa_id = ?', [name, waId]);
      }
      return get('SELECT * FROM contacts WHERE wa_id = ?', [waId]);
    }
    await run('INSERT INTO contacts (wa_id, phone, name) VALUES (?, ?, ?)', [waId, phone, name || null]);
    return get('SELECT * FROM contacts WHERE wa_id = ?', [waId]);
  },
  updateContactName: (waId, name) => run(
    'UPDATE contacts SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE wa_id = ?',
    [name, waId]
  ),

  // Conversations
  getConversations: () => all(`
    SELECT c.*, 
           co.name as contact_name, co.phone as contact_phone,
           n.label as number_label
    FROM conversations c
    JOIN contacts co ON c.contact_wa_id = co.wa_id
    JOIN numbers n ON c.number_id = n.id
    ORDER BY c.last_message_at DESC
  `),
  getConversationsByNumber: (numberId) => all(
    'SELECT * FROM conversations WHERE number_id = ?',
    [numberId]
  ),
    'SELECT * FROM conversations WHERE number_id = ? AND contact_wa_id = ?',
    [numberId, contactWaId]
  ),
  upsertConversation: async (numberId, contactWaId, lastMessage, timestamp) => {
    const existing = await get(
      'SELECT * FROM conversations WHERE number_id = ? AND contact_wa_id = ?',
      [numberId, contactWaId]
    );
    if (existing) {
      await run(
        'UPDATE conversations SET last_message = ?, last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?',
        [lastMessage, timestamp, existing.id]
      );
      return existing.id;
    }
    const result = await run(
      'INSERT INTO conversations (number_id, contact_wa_id, last_message, last_message_at, unread_count) VALUES (?, ?, ?, ?, 1)',
      [numberId, contactWaId, lastMessage, timestamp]
    );
    return result.lastID;
  },
  markConversationRead: (id) => run('UPDATE conversations SET unread_count = 0 WHERE id = ?', [id]),
  updateConversationAfterSend: (numberId, contactWaId, lastMessage, timestamp) => run(
    'UPDATE conversations SET last_message = ?, last_message_at = ?, unread_count = 0 WHERE number_id = ? AND contact_wa_id = ?',
    [lastMessage, timestamp, numberId, contactWaId]
  ),

  deleteConversation: async (id) => {
    await run('DELETE FROM messages WHERE conversation_id = ?', [id]);
    await run('DELETE FROM conversations WHERE id = ?', [id]);
  },
  getMessages: (conversationId) => all(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC',
    [conversationId]
  ),
  insertMessage: async (waMessageId, conversationId, numberId, contactWaId, body, fromMe, timestamp) => {
    try {
      const result = await run(
        'INSERT INTO messages (wa_message_id, conversation_id, number_id, contact_wa_id, body, from_me, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [waMessageId || null, conversationId, numberId, contactWaId, body, fromMe ? 1 : 0, timestamp]
      );
      return result.lastID;
    } catch (e) {
      return null;
    }
  },
};
