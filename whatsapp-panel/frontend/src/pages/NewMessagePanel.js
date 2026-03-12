import React, { useState } from 'react';
import { sendMessage } from '../api';

export default function NewMessagePanel({ numbers, onMessageSent }) {
  const [form, setForm] = useState({ numberId: '', to: '', body: '' });
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const connectedNumbers = numbers.filter(n =>
    n.currentStatus === 'connected' || n.status === 'connected'
  );

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.numberId || !form.to || !form.body.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await sendMessage(form.numberId, form.to, form.body.trim());
      setSuccess(true);
      setForm({ numberId: form.numberId, to: '', body: '' });
      if (res.data.conversations) {
        onMessageSent(res.data.conversations, res.data.conversationId);
      }
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Mesaj gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h2 style={styles.title}>📤 Yeni Mesaj Gönder</h2>
        <p style={styles.subtitle}>
          Numaranızı seçin ve göndermek istediğiniz kişiye mesaj atın.
          Mesaj gönderildikten sonra konuşma Gelen Kutusu'nda görünecek.
        </p>

        {connectedNumbers.length === 0 && (
          <div style={styles.warning}>
            ⚠️ Bağlı numara bulunamadı. Ayarlar'dan numara ekleyin.
          </div>
        )}

        <form onSubmit={handleSend} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Gönderen Numara</label>
            <select
              style={styles.select}
              value={form.numberId}
              onChange={e => setForm({ ...form, numberId: e.target.value })}
              required
            >
              <option value="">Numara seçin...</option>
              {connectedNumbers.map(n => (
                <option key={n.id} value={n.id}>
                  {n.label} {n.phone ? `(${n.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Alıcı Numara</label>
            <input
              style={styles.input}
              type="tel"
              placeholder="905321234567 (başında + olmadan)"
              value={form.to}
              onChange={e => setForm({ ...form, to: e.target.value.replace(/\D/g, '') })}
              required
            />
            <span style={styles.fieldHint}>Ülke koduyla birlikte, + ve boşluk olmadan</span>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Mesaj</label>
            <textarea
              style={styles.textarea}
              placeholder="Mesajınızı yazın..."
              value={form.body}
              onChange={e => setForm({ ...form, body: e.target.value })}
              rows={5}
              required
            />
          </div>

          {error && <div style={styles.error}>❌ {error}</div>}
          {success && <div style={styles.successMsg}>✅ Mesaj başarıyla gönderildi!</div>}

          <button
            style={{ ...styles.sendBtn, opacity: (sending || connectedNumbers.length === 0) ? 0.5 : 1 }}
            type="submit"
            disabled={sending || connectedNumbers.length === 0}
          >
            {sending ? '⏳ Gönderiliyor...' : '📤 Mesaj Gönder'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    flex: 1, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '40px 24px',
    background: '#0a0a0f', fontFamily: "'DM Sans', sans-serif",
    overflowY: 'auto',
  },
  card: {
    background: '#0d0d14', border: '1px solid #1e1e2e',
    borderRadius: '16px', padding: '36px', width: '100%', maxWidth: '520px',
  },
  title: { color: '#fff', margin: '0 0 8px', fontSize: '20px', fontWeight: '600' },
  subtitle: { color: '#555', fontSize: '13px', margin: '0 0 28px', lineHeight: '1.6' },
  warning: {
    background: '#1a1200', border: '1px solid #3a2800',
    color: '#ffa502', borderRadius: '10px', padding: '12px 16px',
    fontSize: '13px', marginBottom: '20px',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  field: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { color: '#888', fontSize: '13px', fontWeight: '500' },
  select: {
    background: '#111118', border: '1px solid #2a2a3a', borderRadius: '10px',
    padding: '12px 16px', color: '#fff', fontSize: '14px', outline: 'none',
    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
  },
  input: {
    background: '#111118', border: '1px solid #2a2a3a', borderRadius: '10px',
    padding: '12px 16px', color: '#fff', fontSize: '14px', outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
  },
  fieldHint: { color: '#444', fontSize: '12px' },
  textarea: {
    background: '#111118', border: '1px solid #2a2a3a', borderRadius: '10px',
    padding: '12px 16px', color: '#fff', fontSize: '14px', outline: 'none',
    fontFamily: "'DM Sans', sans-serif", resize: 'vertical',
  },
  error: {
    background: '#1a0000', border: '1px solid #3a0000',
    color: '#ff4757', borderRadius: '8px', padding: '10px 14px', fontSize: '13px',
  },
  successMsg: {
    background: '#001a0a', border: '1px solid #003a14',
    color: '#25d366', borderRadius: '8px', padding: '10px 14px', fontSize: '13px',
  },
  sendBtn: {
    background: '#25d366', color: '#000', border: 'none',
    borderRadius: '10px', padding: '14px', fontSize: '15px',
    fontWeight: '600', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
};
