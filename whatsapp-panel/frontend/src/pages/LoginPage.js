import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username, form.password);
    } catch (err) {
      setError(err.response?.data?.error || 'Giriş başarısız');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>💬</span>
          <h1 style={styles.logoText}>WA Panel</h1>
        </div>
        <p style={styles.subtitle}>Mesaj Yönetim Sistemi</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Kullanıcı Adı</label>
            <input
              style={styles.input}
              type="text"
              placeholder="admin"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Şifre</label>
            <input
              style={styles.input}
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    background: '#0a0a0f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'DM Sans', sans-serif",
  },
  card: {
    background: '#111118',
    border: '1px solid #1e1e2e',
    borderRadius: '16px',
    padding: '48px',
    width: '380px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  },
  logo: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' },
  logoIcon: { fontSize: '32px' },
  logoText: { fontSize: '24px', fontWeight: '600', color: '#fff', margin: 0 },
  subtitle: { color: '#555', fontSize: '14px', margin: '0 0 36px 0' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  field: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { color: '#888', fontSize: '13px', fontWeight: '500' },
  input: {
    background: '#0d0d14',
    border: '1px solid #2a2a3a',
    borderRadius: '10px',
    padding: '12px 16px',
    color: '#fff',
    fontSize: '15px',
    outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'border-color 0.2s',
  },
  error: { color: '#ff4757', fontSize: '13px', margin: 0 },
  btn: {
    background: '#25d366',
    color: '#000',
    border: 'none',
    borderRadius: '10px',
    padding: '14px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    marginTop: '4px',
    transition: 'background 0.2s',
  },
};
