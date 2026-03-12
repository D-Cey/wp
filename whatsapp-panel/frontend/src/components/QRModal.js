import React from 'react';

export default function QRModal({ qrData, numberStatuses, onClose }) {
  const pendingQRs = Object.entries(qrData).filter(([id]) =>
    numberStatuses[id] === 'qr_pending'
  );

  if (pendingQRs.length === 0) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>📲 WhatsApp Bağlantısı</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        {pendingQRs.map(([id, qr]) => (
          <div key={id} style={styles.qrSection}>
            <p style={styles.label}>
              <span style={styles.badge}>{id}</span> için QR kodu tara
            </p>
            <img src={qr} alt="QR Code" style={styles.qr} />
            <p style={styles.hint}>
              WhatsApp → ⋮ Menü → Bağlı Cihazlar → Cihaz Ekle
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
  },
  modal: {
    background: '#111118', border: '1px solid #1e1e2e',
    borderRadius: '16px', padding: '0', fontFamily: "'DM Sans', sans-serif",
    minWidth: '320px',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px', borderBottom: '1px solid #1e1e2e',
  },
  title: { color: '#fff', margin: 0, fontSize: '17px', fontWeight: '600' },
  closeBtn: {
    background: 'none', border: 'none', color: '#666',
    fontSize: '18px', cursor: 'pointer',
  },
  qrSection: { padding: '24px', textAlign: 'center' },
  label: { color: '#aaa', marginBottom: '16px', fontSize: '14px' },
  badge: {
    background: '#25d366', color: '#000', padding: '2px 8px',
    borderRadius: '4px', fontWeight: '700', fontSize: '12px',
  },
  qr: { width: '220px', height: '220px', borderRadius: '12px', border: '4px solid #fff' },
  hint: { color: '#555', fontSize: '12px', marginTop: '12px', lineHeight: '1.6' },
};
