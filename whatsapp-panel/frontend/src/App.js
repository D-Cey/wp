import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useSocket } from './hooks/useSocket';
import LoginPage from './pages/LoginPage';
import InboxPanel from './pages/InboxPanel';
import NewMessagePanel from './pages/NewMessagePanel';
import NumbersModal from './components/NumbersModal';
import QRModal from './components/QRModal';
import { getConversations, getNumbers } from './api';

function Dashboard() {
  const { token, user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('inbox');
  const [conversations, setConversations] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [numberStatuses, setNumberStatuses] = useState({});
  const [qrData, setQrData] = useState({});
  const [showNumbers, setShowNumbers] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const unread = Array.isArray(conversations) ? conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0) : 0;
    setTotalUnread(unread);
  }, [conversations]);

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
    setTimeout(() => setNotification(null), 3000);
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
        showNotif(`💬 ${data.numberLabel}: ${data.contactName || data.phone} → ${data.body.slice(0, 40)}`);
      }
    },
    onConversationsUpdated: (convs) => {
      setConversations(Array.isArray(convs) ? convs : []);
    },
  });

  const handleMessageSent = (updatedConvs, convId) => {
    setConversations(updatedConvs);
    setActiveTab('inbox');
  };

  const pendingQRs = Object.entries(qrData).filter(
    ([id]) => numberStatuses[id] === 'qr_pending'
  );

  return (
    <div style={styles.app}>
      {/* Notification */}
      {notification && (
        <div style={{ ...styles.notification, background: notification.type === 'success' ? '#1a3a1a' : '#3a1a1a' }}>
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>💬 WA Panel</span>
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tab, ...(activeTab === 'inbox' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('inbox')}
            >
              Gelen Kutusu
              {totalUnread > 0 && <span style={styles.tabBadge}>{totalUnread}</span>}
            </button>
            <button
              style={{ ...styles.tab, ...(activeTab === 'new' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('new')}
            >
              Yeni Mesaj
            </button>
          </div>
        </div>
        <div style={styles.headerRight}>
          {pendingQRs.length > 0 && (
            <button style={styles.qrAlert} onClick={() => {}}>
              📲 QR Bekliyor ({pendingQRs.length})
            </button>
          )}
          <div style={styles.numberStatus}>
            {numbers.slice(0, 5).map(n => (
              <div
                key={n.id}
                style={{
                  ...styles.numDot,
                  background: (numberStatuses[n.id] === 'connected') ? '#25d366' :
                               (numberStatuses[n.id] === 'qr_pending') ? '#ffa502' : '#333',
                }}
                title={`${n.label}: ${numberStatuses[n.id] || n.status}`}
              />
            ))}
          </div>
          <button style={styles.settingsBtn} onClick={() => setShowNumbers(true)}>
            ⚙️ Numaralar
          </button>
          <button style={styles.logoutBtn} onClick={logout}>
            Çıkış
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        {activeTab === 'inbox' && (
          <InboxPanel
            conversations={conversations}
            onConversationsUpdate={setConversations}
            numbers={numbers}
          />
        )}
        {activeTab === 'new' && (
          <NewMessagePanel
            numbers={numbers}
            onMessageSent={handleMessageSent}
          />
        )}
      </main>

      {/* Modals */}
      {showNumbers && (
        <NumbersModal
          onClose={() => { setShowNumbers(false); loadInitialData(); }}
          numberStatuses={numberStatuses}
          qrData={qrData}
        />
      )}
      {pendingQRs.length > 0 && (
        <QRModal
          qrData={qrData}
          numberStatuses={numberStatuses}
          onClose={() => setQrData({})}
        />
      )}
    </div>
  );
}

export default function App() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Dashboard /> : <LoginPage />;
}

const styles = {
  app: {
    height: '100vh', background: '#0a0a0f',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'DM Sans', sans-serif",
    overflow: 'hidden',
  },
  notification: {
    position: 'fixed', top: '16px', right: '16px',
    color: '#fff', padding: '12px 20px', borderRadius: '10px',
    fontSize: '13px', zIndex: 9999, maxWidth: '320px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0 24px', background: '#0d0d14', borderBottom: '1px solid #1a1a24',
    height: '56px', flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '24px' },
  logo: { color: '#fff', fontWeight: '600', fontSize: '16px' },
  tabs: { display: 'flex', gap: '4px' },
  tab: {
    background: 'none', border: 'none', color: '#555',
    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
    fontSize: '14px', fontWeight: '500', fontFamily: "'DM Sans', sans-serif",
    display: 'flex', alignItems: 'center', gap: '6px',
    transition: 'all 0.15s',
  },
  tabActive: { background: '#1e1e2e', color: '#fff' },
  tabBadge: {
    background: '#25d366', color: '#000',
    fontSize: '11px', fontWeight: '700',
    padding: '1px 6px', borderRadius: '20px',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  qrAlert: {
    background: '#3a2800', color: '#ffa502', border: 'none',
    borderRadius: '8px', padding: '6px 12px', fontSize: '13px',
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
    animation: 'pulse 2s infinite',
  },
  numberStatus: { display: 'flex', gap: '6px', alignItems: 'center' },
  numDot: { width: '8px', height: '8px', borderRadius: '50%' },
  settingsBtn: {
    background: '#1e1e2e', color: '#888', border: 'none',
    borderRadius: '8px', padding: '6px 14px', fontSize: '13px',
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
  logoutBtn: {
    background: 'none', color: '#555', border: '1px solid #2a2a3a',
    borderRadius: '8px', padding: '6px 14px', fontSize: '13px',
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
};
