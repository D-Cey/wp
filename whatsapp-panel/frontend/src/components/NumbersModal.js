import React, { useState, useEffect } from 'react';
import { getNumbers, addNumber, deleteNumber } from '../api';

export default function NumbersModal({ onClose, numberStatuses }) {
  const [numbers, setNumbers] = useState([]);
  const [qrData, setQrData] = useState({});
  const [form, setForm] = useState({ id: '', label: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadNumbers();
  }, []);

  // Update statuses from socket events
  useEffect(() => {
    if (numberStatuses && Object.keys(numberStatuses).length > 0) {
      setNumbers(prev => prev.map(n => ({
        ...n,
        currentStatus: numberStatuses[n.id] || n.currentStatus,
      })));
    }
  }, [numberStatuses]);

  const loadNumbers = async () => {
    try {
      const res = await getNumbers();
      setNumbers(res.data);
    } catch (e) {}
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.id || !form.label) return;
    setLoading(true);
    setError('');
    try {
      await addNumber(form.id, form.label);
      setForm({ id: '', label: '' });
      await loadNumbers();
    } catch (err) {
      setError(err.response?.data?.error || 'Hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bu numarayı kaldırmak istediğinize emin misiniz?')) return;
    try {
      await deleteNumber(id);
      await loadNumbers();
    } catch (e) {}
  };

  const statusColor = (status) => {
    if (status === 'connected') return '#25d366';
    if (status === 'qr_pending' || status === 'authenticated') return '#ffa502';
    return '#ff4757';
  };

  const statusLabel = (status) => {
    const map = {
      connected: 'Bağlı',
      qr_pending: 'QR Bekliyor',
      authenticated: 'Doğrulandı',
      disconnected: 'Bağlı Değil',
      auth_failed: 'Hata',
      connecting: 'Bağlanıyor...',
    };
    return map[status] || status;
  };

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>📱 WhatsApp Numaraları</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Numara Listesi */}
        <div style={styles.list}>
          {numbers.length === 0 && (
            <p style={styles.empty}>Henüz numara eklenmedi</p>
          )}
          {numbers.map(n => (
            <div key={n.id} style={styles.numberRow}>
              <div style={styles.numberInfo}>
                <div style={styles.numberLabel}>{n.label}</div>
                <div style={styles.numberMeta}>
                  <code style={styles.numberId}>{n.id}</code>
                  {n.phone && <span style={styles.numberPhone}> · {n.phone}</span>}
                </div>
              </div>
              <div style={styles.numberRight}>
                <span style={{ ...styles.statusBadge, background: statusColor(n.currentStatus || n.status) }}>
                  {statusLabel(n.currentStatus || n.status)}
                </span>
                <button
                  style={styles.deleteBtn}
                  onClick={() => handleDelete(n.id)}
                  title="Kaldır"
                >✕</button>
              </div>
            </div>
          ))}
        </div>

        {/* QR Kodları */}
        {Object.entries(qrData).map(([id, qr]) => (
          <div key={id} style={styles.qrContainer}>
            <p style={styles.qrLabel}><b>{id}</b> için QR Kodu Tara</p>
            <img src={qr} alt="QR" style={styles.qrImage} />
            <p style={styles.qrHint}>WhatsApp → Bağlı Cihazlar → Cihaz Ekle</p>
          </div>
        ))}

        {/* Yeni Numara Ekle */}
        <div style={styles.addSection}>
          <h3 style={styles.addTitle}>Yeni Numara Bağla</h3>
          <form onSubmit={handleAdd} style={styles.addForm}>
            <input
              style={styles.input}
              placeholder="ID (örn: numara_a)"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase().replace(/\s/g, '_') })}
            />
            <input
              style={styles.input}
              placeholder="Etiket (örn: Numara A)"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.addBtn} type="submit" disabled={loading}>
              {loading ? 'Bağlanıyor...' : '+ Ekle & QR Oluştur'}
            </button>
          </form>
          <p style={styles.hint}>
            Numara ekledikten sonra otomatik QR kodu oluşacak. <br />
            QR kodunu WhatsApp ile tarat.
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#111118', border: '1px solid #1e1e2e', borderRadius: '16px',
    width: '500px', maxHeight: '80vh', overflowY: 'auto',
    fontFamily: "'DM Sans', sans-serif",
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '24px 24px 16px',
    borderBottom: '1px solid #1e1e2e',
  },
  title: { color: '#fff', margin: 0, fontSize: '18px', fontWeight: '600' },
  closeBtn: {
    background: 'none', border: 'none', color: '#666',
    fontSize: '18px', cursor: 'pointer', padding: '4px 8px',
  },
  list: { padding: '16px 24px' },
  empty: { color: '#555', textAlign: 'center', padding: '16px 0' },
  numberRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 0', borderBottom: '1px solid #1a1a24',
  },
  numberInfo: {},
  numberLabel: { color: '#fff', fontWeight: '500', marginBottom: '4px' },
  numberMeta: { display: 'flex', alignItems: 'center', gap: '4px' },
  numberId: { color: '#555', fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" },
  numberPhone: { color: '#555', fontSize: '12px' },
  numberRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  statusBadge: {
    color: '#000', fontSize: '11px', fontWeight: '700',
    padding: '3px 8px', borderRadius: '20px',
  },
  deleteBtn: {
    background: 'none', border: '1px solid #2a2a3a', color: '#666',
    borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px',
  },
  qrContainer: {
    textAlign: 'center', padding: '16px 24px',
    background: '#0d0d14', margin: '0 24px', borderRadius: '12px', marginBottom: '16px',
  },
  qrLabel: { color: '#aaa', marginBottom: '12px', fontSize: '14px' },
  qrImage: { width: '200px', height: '200px', borderRadius: '8px' },
  qrHint: { color: '#555', fontSize: '12px', marginTop: '8px' },
  addSection: {
    padding: '20px 24px 24px',
    borderTop: '1px solid #1e1e2e',
  },
  addTitle: { color: '#fff', fontSize: '15px', fontWeight: '500', margin: '0 0 16px' },
  addForm: { display: 'flex', flexDirection: 'column', gap: '10px' },
  input: {
    background: '#0d0d14', border: '1px solid #2a2a3a', borderRadius: '8px',
    padding: '10px 14px', color: '#fff', fontSize: '14px', outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
  },
  error: { color: '#ff4757', fontSize: '13px', margin: '0' },
  addBtn: {
    background: '#25d366', color: '#000', border: 'none', borderRadius: '8px',
    padding: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },
  hint: { color: '#444', fontSize: '12px', marginTop: '12px', lineHeight: '1.6' },
};
