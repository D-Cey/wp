const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const waService = require('../services/whatsappService');
const db = require('../db/database');

// GET /api/wa/numbers - tüm numaralar
router.get('/numbers', auth, async (req, res) => {
  const numbers = await db.getNumbers();
  const numbersWithStatus = numbers.map(n => ({
    ...n,
    currentStatus: waService.getClientStatus(n.id),
  }));
  res.json(numbersWithStatus);
});

// POST /api/wa/numbers - yeni numara ekle ve bağlan
router.post('/numbers', auth, async (req, res) => {
  const { id, label } = req.body;
  if (!id || !label) return res.status(400).json({ error: 'id ve label gerekli' });

  try {
    const result = await waService.createClient(id, label);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/wa/numbers/:id - numara sil
router.delete('/numbers/:id', auth, async (req, res) => {
  try {
    await waService.disconnectClient(req.params.id);
    await db.deleteNumber(req.params.id);
    const numbers = await db.getNumbers();
    res.json({ success: true, numbers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/wa/conversations - tüm konuşmalar
router.get('/conversations', auth, async (req, res) => {
  const conversations = await db.getConversations();
  res.json(conversations);
});

// GET /api/wa/conversations/:id/messages - belirli konuşmanın mesajları
router.get('/conversations/:id/messages', auth, async (req, res) => {
  const messages = await db.getMessages(req.params.id);
  res.json(messages);
});

// DELETE /api/wa/conversations/:id - konuşmayı sil
router.delete('/conversations/:id', auth, async (req, res) => {
  try {
    await db.deleteConversation(req.params.id);
    const conversations = await db.getConversations();
    res.json({ success: true, conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post('/conversations/:id/read', auth, (req, res) => {
  db.markConversationRead(req.params.id);
  res.json({ success: true });
});

// POST /api/wa/send - mesaj gönder
router.post('/send', auth, async (req, res) => {
  const { numberId, to, body } = req.body;
  if (!numberId || !to || !body) {
    return res.status(400).json({ error: 'numberId, to ve body gerekli' });
  }

  try {
    const result = await waService.sendMessage(numberId, to, body);
    const conversations = await db.getConversations();
    res.json({ success: true, ...result, conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/wa/contacts/:waId/name - iletişim ismi güncelle
router.patch('/contacts/:waId/name', auth, async (req, res) => {
  const { name } = req.body;
  const waId = decodeURIComponent(req.params.waId);
  if (!name) return res.status(400).json({ error: 'name gerekli' });

  await db.updateContactName(waId, name);
  const conversations = await db.getConversations();
  res.json({ success: true, conversations });
});

module.exports = router;
