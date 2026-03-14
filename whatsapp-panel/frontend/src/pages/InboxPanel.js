import React, { useState, useEffect, useRef } from 'react';
import { getMessages, sendMessage, markRead, updateContactName, deleteConversation } from '../api';

function timeAgo(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'şimdi';
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
}

function fullTime(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export default function InboxPanel({ conversations: convsProp, onConversationsUpdate, onMarkRead, onMarkAllRead, numbers = [] }) {
  const conversations = Array.isArray(convsProp) ? convsProp : [];
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [translations, setTranslations] = useState({});
  const [localReadIds, setLocalReadIds] = useState(new Set());
  const messagesEndRef = useRef(null);
  const lastConvUpdateRef = useRef(null);

  const getUnread = (conv) => localReadIds.has(conv.id) ? 0 : (conv.unread_count || 0);
  const markLocalRead = (convId) => setLocalReadIds(prev => new Set([...prev, convId]));
  const markAllLocalRead = () => setLocalReadIds(new Set(conversations.map(c => c.id)));

  // Yeni mesaj gelince (unread_count arttıysa) localRead'den çıkar
  useEffect(() => {
    conversations.forEach(c => {
      if ((c.unread_count || 0) > 0) {
        setLocalReadIds(prev => {
          if (!prev.has(c.id)) return prev;
          const next = new Set(prev);
          next.delete(c.id);
          return next;
        });
      }
    });
  }, [conversations]);

  const detectLang = (text) => {
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text) ? 'ar' : 'en';
  };

  const translateMessage = async (msgId, text) => {
    if (translations[msgId]?.tr) {
      // Zaten çevrilmiş, orijinal/çeviri arasında geçiş yap
      setTranslations(p => ({ ...p, [msgId]: { ...p[msgId], showOriginal: !p[msgId].showOriginal } }));
      return;
    }
    try {
      const sourceLang = detectLang(text);
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|tr`);
      const data = await res.json();
      const translated = data?.responseData?.translatedText;
      if (translated && !translated.includes('INVALID') && !translated.includes('MYMEMORY')) {
        setTranslations(p => ({ ...p, [msgId]: { tr: translated, showOriginal: false } }));
      }
    } catch {}
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (selected) {
      loadMessages(selected.id);
    }
  }, [selected?.id]);

  // Sadece seçili konuşmada yeni mesaj gelince güncelle
  useEffect(() => {
    if (!selected) return;
    const updated = conversations.find(c => c.id === selected.id);
    if (!updated) return;
    // Son mesaj değiştiyse mesajları yenile
    if (updated.last_message_at !== lastConvUpdateRef.current) {
      lastConvUpdateRef.current = updated.last_message_at;
      refreshMessages(selected.id);
    }
  }, [conversations]);

  const loadMessages = async (convId) => {
    try {
      const res = await getMessages(convId);
      const msgs = Array.isArray(res.data) ? res.data : [];
      setMessages(msgs);
      setTranslations({});
      markLocalRead(convId);
      markRead(convId).catch(() => {});
    } catch (e) { console.error(e); }
  };

  const refreshMessages = async (convId) => {
    try {
      const res = await getMessages(convId);
      const msgs = Array.isArray(res.data) ? res.data : [];
      setMessages(msgs);
      markLocalRead(convId);
      markRead(convId).catch(() => {});
    } catch (e) { console.error(e); }
  };

  const selectConversation = async (conv) => {
    setSelected(conv);
    setEditingName(false);
    setNameInput('');
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !selected || sending) return;
    setSending(true);
    try {
      await sendMessage(selected.number_id, selected.contact_wa_id.replace('@c.us', ''), messageInput.trim());
      setMessageInput('');
      await loadMessages(selected.id);
    } catch (err) {
      alert('Mesaj gönderilemedi: ' + (err.response?.data?.error || err.message));
    } finally {
      setSending(false);
    }
  };

  const handleDeleteConversation = async (e, convId) => {
    e.stopPropagation();
    if (!window.confirm('Bu konuşmayı silmek istediğinize emin misiniz?')) return;
    try {
      const res = await deleteConversation(convId);
      if (selected?.id === convId) setSelected(null);
      setMessages([]);
      onConversationsUpdate(Array.isArray(res.data.conversations) ? res.data.conversations : []);
    } catch (e) { console.error(e); }
  };

  const handleSaveName = async () => {
    if (!nameInput.trim() || !selected) return;
    try {
      const res = await updateContactName(selected.contact_wa_id, nameInput.trim());
      onConversationsUpdate(res.data.conversations);
      setEditingName(false);
    } catch (e) {}
  };

  const filtered = conversations.filter(c => {
    const name = c.contact_name || c.contact_phone || '';
    const matchSearch = name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = activeFilter === 'all' || c.number_id === activeFilter;
    return matchSearch && matchFilter;
  });

  // Unread count per number - localReadIds dikkate alarak
  const unreadPerNumber = {};
  conversations.forEach(c => {
    if (!unreadPerNumber[c.number_id]) unreadPerNumber[c.number_id] = 0;
    unreadPerNumber[c.number_id] += getUnread(c);
  });
  const totalUnreadLocal = conversations.reduce((s, c) => s + getUnread(c), 0);

  const displayName = (conv) => conv.contact_name || conv.contact_phone || conv.contact_wa_id;

  return (
    <div style={styles.container}>
      {/* Sol Panel - Konuşmalar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h2 style={styles.sidebarTitle}>Konuşmalar</h2>
          <span style={styles.convCount}>{filtered.length}</span>
        </div>
        <div style={styles.sidebarActions}>
          <button
            style={styles.actionBtn}
            onClick={async () => {
              markAllLocalRead();
              conversations.forEach(c => markRead(c.id).catch(() => {}));
            }}
          >✓ Mark All Read</button>
          <button
            style={{ ...styles.actionBtn, color: '#e74c3c', borderColor: '#3a1a1a' }}
            onClick={async () => {
              if (!window.confirm('Tüm konuşmaları silmek istediğinize emin misiniz?')) return;
              try {
                await Promise.allSettled(conversations.map(c => deleteConversation(c.id)));
                onConversationsUpdate([]);
                setSelected(null);
                setMessages([]);
              } catch (e) { console.error(e); }
            }}
          >🗑 Tümünü Sil</button>
        </div>

        {/* Numara Filtreleri */}
        <div style={styles.filterTabs}>
          <button
            style={{ ...styles.filterTab, ...(activeFilter === 'all' ? styles.filterTabActive : {}) }}
            onClick={() => setActiveFilter('all')}
          >
            Tümü
            {totalUnreadLocal > 0 && (
              <span style={styles.filterBadge}>{totalUnreadLocal}</span>
            )}
          </button>
          {numbers.filter(n => n.status === 'connected' || n.currentStatus === 'connected').map(n => (
            <button
              key={n.id}
              style={{ ...styles.filterTab, ...(activeFilter === n.id ? styles.filterTabActive : {}) }}
              onClick={() => setActiveFilter(n.id)}
            >
              {n.label}
              {unreadPerNumber[n.id] > 0 && (
                <span style={styles.filterBadge}>{unreadPerNumber[n.id]}</span>
              )}
            </button>
          ))}
        </div>
        <div style={styles.searchWrap}>
          <input
            style={styles.searchInput}
            placeholder="Ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={styles.convList}>
          {filtered.length === 0 && (
            <div style={styles.emptyConvs}>
              <p>Henüz konuşma yok</p>
              <p style={styles.emptyHint}>Yeni Mesaj sekmesinden başlatın</p>
            </div>
          )}
          {filtered.map(conv => (
            <div
              key={conv.id}
              style={{
                ...styles.convItem,
                ...(selected?.id === conv.id ? styles.convItemActive : {}),
              }}
              onClick={() => selectConversation(conv)}
            >
              <div style={styles.convAvatar}>
                {(displayName(conv)[0] || '?').toUpperCase()}
              </div>
              <div style={styles.convContent}>
                <div style={styles.convTopRow}>
                  <span style={styles.convName}>{displayName(conv)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={styles.convTime}>{timeAgo(conv.last_message_at)}</span>
                    {getUnread(conv) > 0 && (
                      <button
                        style={styles.convReadBtn}
                        onClick={async (e) => {
                          e.stopPropagation();
                          markLocalRead(conv.id);
                          markRead(conv.id).catch(() => {});
                        }}
                        title="Okundu işaretle"
                      >✓</button>
                    )}
                    <button
                      style={styles.convDeleteBtn}
                      onClick={(e) => handleDeleteConversation(e, conv.id)}
                      title="Konuşmayı sil"
                    >✕</button>
                  </div>
                </div>
                <div style={styles.convBottomRow}>
                  <span style={styles.convPreview}>
                    <span style={styles.convNumberTag}>{conv.number_label}</span>
                    {conv.last_message}
                  </span>
                  {getUnread(conv) > 0 && (
                    <span style={styles.unreadBadge}>{getUnread(conv)}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sağ Panel - Mesajlar */}
      <div style={styles.chatArea}>
        {!selected ? (
          <div style={styles.noChatSelected}>
            <div style={styles.noChatIcon}>💬</div>
            <h3 style={styles.noChatTitle}>Konuşma Seçin</h3>
            <p style={styles.noChatHint}>Sol menüden bir konuşmaya tıklayın</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div style={styles.chatHeader}>
              <div style={styles.chatAvatar}>
                {(displayName(selected)[0] || '?').toUpperCase()}
              </div>
              <div style={styles.chatHeaderInfo}>
                {editingName ? (
                  <div style={styles.nameEditRow}>
                    <input
                      style={styles.nameInput}
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      placeholder="İsim girin..."
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                    />
                    <button style={styles.saveNameBtn} onClick={handleSaveName}>Kaydet</button>
                    <button style={styles.cancelNameBtn} onClick={() => setEditingName(false)}>İptal</button>
                  </div>
                ) : (
                  <div style={styles.chatNameRow}>
                    <span style={styles.chatName}>{displayName(selected)}</span>
                    <button
                      style={styles.editNameBtn}
                      onClick={() => { setEditingName(true); setNameInput(selected.contact_name || ''); }}
                      title="İsim düzenle"
                    >✏️</button>
                  </div>
                )}
                <div style={styles.chatMeta}>
                  <span style={styles.chatPhone}>{selected.contact_phone}</span>
                  <span style={styles.chatMetaDot}>·</span>
                  <span style={styles.chatNumberTag}>{selected.number_label}</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={styles.messages}>
              {messages.length === 0 && (
                <div style={styles.noMessages}>Mesaj bulunamadı</div>
              )}
              {messages.filter(msg => {
                if (!msg.body) return false;
                if (msg.body.length > 500 && !msg.body.includes(' ')) return false;
                return true;
              }).map((msg) => {
                const isMe = msg.from_me === 1;
                const trans = translations[msg.id];
                const displayText = (trans && !trans.showOriginal && trans.tr) ? trans.tr : msg.body;
                const hasTranslation = trans?.tr && trans.tr !== msg.body;
                return (
                  <div key={msg.id} style={{ ...styles.msgRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                    <div style={{ ...styles.msgBubble, ...(isMe ? styles.msgBubbleMe : styles.msgBubbleThem) }}>
                      <p style={styles.msgText}>{displayText}</p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          style={styles.translateToggleBtn}
                          onClick={() => translateMessage(msg.id, msg.body)}
                          title="Çevir / Orijinal"
                        >
                          {hasTranslation ? (trans.showOriginal ? '🌐 Çevir' : '💬 Orijinal') : '🌐'}
                        </button>
                        <span style={styles.msgTime}>{fullTime(msg.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <form onSubmit={handleSend} style={styles.inputArea}>
              <input
                style={styles.messageInput}
                placeholder="Mesaj yaz..."
                value={messageInput}
                onChange={e => setMessageInput(e.target.value)}
                disabled={sending}
              />
              <button
                style={{ ...styles.sendBtn, opacity: (!messageInput.trim() || sending) ? 0.5 : 1 }}
                type="submit"
                disabled={!messageInput.trim() || sending}
              >
                {sending ? '...' : '➤'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex', height: '100%', flex: 1,
    fontFamily: "'DM Sans', sans-serif",
  },
  // Sidebar
  sidebar: {
    width: '320px', minWidth: '280px',
    background: '#0d0d14', borderRight: '1px solid #1a1a24',
    display: 'flex', flexDirection: 'column',
  },
  sidebarHeader: {
    padding: '20px 20px 12px',
    display: 'flex', alignItems: 'center', gap: '8px',
    borderBottom: '1px solid #1a1a24',
  },
  sidebarActions: {
    display: 'flex', gap: '6px', padding: '8px 12px',
    borderBottom: '1px solid #1a1a24',
  },
  actionBtn: {
    flex: 1, background: 'none', border: '1px solid #2a2a3a', color: '#25d366',
    borderRadius: '6px', padding: '5px 8px', fontSize: '11px',
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
    whiteSpace: 'nowrap',
  },
  convReadBtn: {
    background: 'none', border: 'none', color: '#25d366',
    fontSize: '11px', cursor: 'pointer', padding: '1px 3px',
    borderRadius: '3px', flexShrink: 0,
  },
  convCount: {
    background: '#1e1e2e', color: '#666',
    fontSize: '12px', padding: '2px 8px', borderRadius: '20px',
  },
  filterTabs: {
    display: 'flex', gap: '4px', padding: '8px 12px',
    borderBottom: '1px solid #1a1a24', flexWrap: 'wrap',
  },
  filterTab: {
    background: 'none', border: '1px solid #2a2a3a', color: '#666',
    borderRadius: '20px', padding: '4px 10px', fontSize: '12px',
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
    display: 'flex', alignItems: 'center', gap: '4px',
    transition: 'all 0.15s',
  },
  filterTabActive: {
    background: '#1a2a1a', borderColor: '#25d366', color: '#25d366',
  },
  filterBadge: {
    background: '#25d366', color: '#000',
    fontSize: '10px', fontWeight: '700',
    padding: '1px 5px', borderRadius: '20px',
  },
  searchInput: {
    width: '100%', background: '#111118', border: '1px solid #2a2a3a',
    borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '14px',
    outline: 'none', fontFamily: "'DM Sans', sans-serif",
    boxSizing: 'border-box',
  },
  convList: { flex: 1, overflowY: 'auto' },
  emptyConvs: { textAlign: 'center', padding: '40px 20px', color: '#444' },
  emptyHint: { fontSize: '13px', color: '#333', marginTop: '8px' },
  convItem: {
    display: 'flex', gap: '12px', padding: '14px 16px',
    cursor: 'pointer', borderBottom: '1px solid #111118',
    transition: 'background 0.15s',
  },
  convItemActive: { background: '#111118' },
  convAvatar: {
    width: '42px', height: '42px', borderRadius: '50%',
    background: '#1e2d1e', color: '#25d366',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '16px', fontWeight: '600', flexShrink: 0,
  },
  convContent: { flex: 1, minWidth: 0 },
  convTopRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' },
  convName: { color: '#fff', fontSize: '14px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  convTime: { color: '#444', fontSize: '11px', flexShrink: 0 },
  convDeleteBtn: {
    background: 'none', border: 'none', color: '#444',
    fontSize: '11px', cursor: 'pointer', padding: '1px 4px',
    borderRadius: '4px', flexShrink: 0,
    transition: 'color 0.15s',
  },
  convBottomRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  convPreview: { color: '#555', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
  convNumberTag: {
    background: '#1a2a1a', color: '#25d366', fontSize: '10px',
    padding: '1px 5px', borderRadius: '3px', marginRight: '6px',
    fontWeight: '600',
  },
  unreadBadge: {
    background: '#25d366', color: '#000',
    fontSize: '11px', fontWeight: '700',
    padding: '1px 6px', borderRadius: '20px',
    flexShrink: 0, marginLeft: '8px',
  },
  // Chat area
  chatArea: {
    flex: 1, display: 'flex', flexDirection: 'column',
    background: '#0a0a0f', overflow: 'hidden', minHeight: 0,
  },
  noChatSelected: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '12px',
  },
  noChatIcon: { fontSize: '48px', opacity: 0.3 },
  noChatTitle: { color: '#333', margin: 0, fontWeight: '400' },
  noChatHint: { color: '#2a2a2a', fontSize: '14px' },
  // Chat header
  chatHeader: {
    display: 'flex', alignItems: 'center', gap: '14px',
    padding: '16px 24px', borderBottom: '1px solid #1a1a24',
    background: '#0d0d14',
  },
  chatAvatar: {
    width: '42px', height: '42px', borderRadius: '50%',
    background: '#1e2d1e', color: '#25d366',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '16px', fontWeight: '600',
  },
  chatHeaderInfo: { flex: 1 },
  chatNameRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  chatName: { color: '#fff', fontSize: '16px', fontWeight: '500' },
  editNameBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '14px', padding: '2px', opacity: 0.5,
  },
  nameEditRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  nameInput: {
    background: '#111118', border: '1px solid #2a2a3a', borderRadius: '6px',
    padding: '4px 10px', color: '#fff', fontSize: '14px', outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
  },
  saveNameBtn: {
    background: '#25d366', color: '#000', border: 'none',
    borderRadius: '6px', padding: '4px 12px', fontSize: '13px',
    fontWeight: '600', cursor: 'pointer',
  },
  cancelNameBtn: {
    background: 'none', color: '#666', border: '1px solid #2a2a3a',
    borderRadius: '6px', padding: '4px 10px', fontSize: '13px', cursor: 'pointer',
  },
  chatMeta: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' },
  chatPhone: { color: '#555', fontSize: '12px' },
  chatMetaDot: { color: '#333' },
  chatNumberTag: {
    background: '#1a2a1a', color: '#25d366', fontSize: '11px',
    padding: '1px 6px', borderRadius: '3px', fontWeight: '600',
  },
  // Messages
  messages: {
    flex: 1, overflowY: 'auto', padding: '20px 24px',
    display: 'flex', flexDirection: 'column', gap: '8px',
  },
  noMessages: { color: '#333', textAlign: 'center', marginTop: '40px' },
  msgRow: { display: 'flex' },
  msgBubble: {
    maxWidth: '60%', minWidth: '80px', padding: '10px 14px', borderRadius: '12px',
    wordBreak: 'break-word', display: 'inline-block',
  },
  msgBubbleMe: { background: '#1e3a1e', borderBottomRightRadius: '4px' },
  msgBubbleThem: { background: '#1a1a24', borderBottomLeftRadius: '4px' },
  msgText: { color: '#e0e0e0', margin: '0 0 4px', fontSize: '14px', lineHeight: '1.5' },
  msgTime: { color: '#444', fontSize: '11px', float: 'right' },
  translateToggleBtn: {
    background: 'none', border: 'none', color: '#555',
    fontSize: '10px', cursor: 'pointer', padding: '0',
  },
  // Input
  inputArea: {
    display: 'flex', gap: '10px', padding: '16px 24px',
    borderTop: '1px solid #1a1a24', background: '#0d0d14',
  },
  messageInput: {
    flex: 1, background: '#111118', border: '1px solid #2a2a3a',
    borderRadius: '10px', padding: '12px 16px', color: '#fff',
    fontSize: '14px', outline: 'none', fontFamily: "'DM Sans', sans-serif",
    resize: 'none',
  },
  sendBtn: {
    background: '#25d366', color: '#000', border: 'none',
    borderRadius: '10px', padding: '12px 18px',
    fontSize: '18px', cursor: 'pointer', flexShrink: 0,
  },
};
