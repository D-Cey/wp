import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import { useSocket } from './hooks/useSocket';
import LoginPage from './pages/LoginPage';
import InboxPanel from './pages/InboxPanel';
import NewMessagePanel from './pages/NewMessagePanel';
import NumbersModal from './components/NumbersModal';
import QRModal from './components/QRModal';
import { getConversations, getNumbers } from './api';

function Dashboard() {
  const { token, logout } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('inbox');
  const [conversations, setConversations] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [numberStatuses, setNumberStatuses] = useState({});
  const [qrData, setQrData] = useState({});
  const [showNumbers, setShowNumbers] = useState(false);
  const [notification, setNotification] = useState(null);
  const readSetRef = React.useRef(new Set());

  useEffect(() => { loadInitialData(); }, []);

  const loadInitialData = async () => {
    try {
      const [convRes, numRes] = await Promise.all([getConversations(), getNumbers()]);
      setConversations(Array.isArray(convRes.data) ? convRes.data : []);
      setNumbers(Array.isArray(numRes.data) ? numRes.data : []);
      const statuses = {};
      (Array.isArray(numRes.data) ? numRes.data : []).forEach(n => { statuses[n.id] = n.currentStatus || n.status; });
      setNumberStatuses(statuses);
    } catch (e) { console.error(e); }
  };

  const showNotif = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useSocket(token, {
    onQR: ({ numberId, qr }) => {
      setQrData(prev => ({ ...prev, [numberId]: qr }));
      setNumberStatuses(prev => ({ ...prev, [numberId]: 'qr_pending' }));
    },
    onStatus: ({ numberId, status, phone }) => {
      setNumberStatuses(prev => ({ ...prev, [numberId]: status }));
      setNumbers(prev => prev.map(n =>
        n.id === numberId ? { ...n, status, currentStatus: status, phone: phone || n.phone } : n
      ));
      if (status === 'connected') {
        setQrData(prev => { const d = { ...prev }; delete d[numberId]; return d; });
        showNotif(`✅ Numara bağlandı!`);
      }
    },
    onMessage: (data) => {
      if (!data.fromMe) {
        readSetRef.current.delete(data.conversationId);
        showNotif(`💬 ${data.numberLabel}: ${data.contactName || data.phone} → ${data.body?.slice(0, 40)}`);
      }
    },
    onConversationsUpdated: (convs) => {
      if (!Array.isArray(convs)) return;
      setConversations(convs.map(c =>
        readSetRef.current.has(c.id) ? { ...c, unread_count: 0 } : c
      ));
    },
  });

  const handleConversationsUpdate = (convs) => {
    setConversations(Array.isArray(convs) ? convs : []);
  };

  const handleMarkRead = (convId) => {
    readSetRef.current.add(Number(convId));
    readSetRef.current.add(String(convId));
  };

  const handleMarkAllRead = () => {
    conversations.forEach(c => {
      readSetRef.current.add(Number(c.id));
      readSetRef.current.add(String(c.id));
    });
    setConversations(prev => prev.map(c => ({ ...c, unread_count: 0 })));
  };

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);
  const pendingQRs = Object.entries(qrData).filter(([id]) => numberStatuses[id] === 'qr_pending');

  const t = theme;

  return (
    <div style={{ height: '100vh', background: t.bgMain, display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', sans-serif", overflow: 'hidden', transition: 'background 0.2s, color 0.2s' }}>
      {notification && (
        <div style={{ position: 'fixed', top: '16px', right: '16px', color: '#fff', padding: '12px 20px', borderRadius: '10px', fontSize: '13px', zIndex: 9999, maxWidth: '320px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', background: notification.type === 'success' ? '#1a3a1a' : '#3a1a1a' }}>
          {notification.msg}
        </div>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', background: t.bgPanel, borderBottom: `1px solid ${t.border}`, height: '56px', flexShrink: 0, boxShadow: t.shadow }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <span style={{ color: t.accent, fontWeight: '700', fontSize: '16px' }}>💬 WA Panel</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => setActiveTab('inbox')} style={{ background: activeTab === 'inbox' ? t.bgActive : 'none', border: 'none', color: activeTab === 'inbox' ? t.textPrimary : t.textMuted, padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: '6px' }}>
              Gelen Kutusu
              {totalUnread > 0 && <span style={{ background: t.accent, color: '#000', fontSize: '11px', fontWeight: '700', padding: '1px 6px', borderRadius: '20px' }}>{totalUnread}</span>}
            </button>
            <button onClick={() => setActiveTab('new')} style={{ background: activeTab === 'new' ? t.bgActive : 'none', border: 'none', color: activeTab === 'new' ? t.textPrimary : t.textMuted, padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', fontFamily: "'DM Sans', sans-serif" }}>
              Yeni Mesaj
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {pendingQRs.length > 0 && (
            <span style={{ background: '#3a2800', color: '#ffa502', borderRadius: '8px', padding: '6px 12px', fontSize: '13px' }}>
              📲 QR Bekliyor ({pendingQRs.length})
            </span>
          )}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {numbers.slice(0, 5).map(n => (
              <div key={n.id} style={{ width: '8px', height: '8px', borderRadius: '50%', background: numberStatuses[n.id] === 'connected' ? '#25d366' : numberStatuses[n.id] === 'qr_pending' ? '#ffa502' : t.textDim }} title={`${n.label}: ${numberStatuses[n.id] || n.status}`} />
            ))}
          </div>
          <button onClick={() => setShowNumbers(true)} style={{ background: t.bgActive, color: t.textSecondary, border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            ⚙️ Numaralar
          </button>
          <button onClick={toggleTheme} title={isDark ? 'Aydınlık mod' : 'Gece modu'} style={{ background: t.bgCard, border: `1px solid ${t.borderInput}`, color: t.textSecondary, borderRadius: '8px', padding: '5px 10px', fontSize: '16px', cursor: 'pointer' }}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={logout} style={{ background: 'none', color: t.textMuted, border: `1px solid ${t.borderInput}`, borderRadius: '8px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            Çıkış
          </button>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeTab === 'inbox' && (
          <InboxPanel conversations={conversations} onConversationsUpdate={handleConversationsUpdate} onMarkRead={handleMarkRead} onMarkAllRead={handleMarkAllRead} numbers={numbers} />
        )}
        {activeTab === 'new' && (
          <NewMessagePanel numbers={numbers} onMessageSent={(convs) => { setConversations(convs); setActiveTab('inbox'); }} />
        )}
      </main>

      {showNumbers && (
        <NumbersModal onClose={() => { setShowNumbers(false); loadInitialData(); }} numberStatuses={numberStatuses} qrData={qrData} numbers={numbers} onNumbersChange={loadInitialData} />
      )}
      {pendingQRs.length > 0 && (
        <QRModal qrData={qrData} numberStatuses={numberStatuses} onClose={() => setQrData({})} />
      )}
    </div>
  );
}

export default function App() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Dashboard /> : <LoginPage />;
}
