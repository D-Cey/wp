import React, { createContext, useContext, useState, useEffect } from 'react';
import { login as apiLogin } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('wa_token'));
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser(payload);
      } catch {
        setToken(null);
      }
    }
  }, [token]);

  const login = async (username, password) => {
    const res = await apiLogin(username, password);
    const { token: t, username: u } = res.data;
    localStorage.setItem('wa_token', t);
    setToken(t);
    setUser({ username: u });
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('wa_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
