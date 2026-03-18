import axios from 'axios';

const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001/api' 
  : '/api';

const API = axios.create({ baseURL: API_BASE });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('wa_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Cache'i engelle
  config.headers['Cache-Control'] = 'no-cache, no-store';
  config.headers['Pragma'] = 'no-cache';
  return config;
});

API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('wa_token');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export const login = (username, password) =>
  API.post('/auth/login', { username, password });

export const getNumbers = () => API.get('/wa/numbers');
export const addNumber = (id, label) => API.post('/wa/numbers', { id, label });
export const deleteNumber = (id) => API.delete(`/wa/numbers/${id}`);

export const getConversations = () => API.get('/wa/conversations');
export const getMessages = (convId) => API.get(`/wa/conversations/${convId}/messages`);
export const markRead = (convId) => API.post(`/wa/conversations/${convId}/read`);
export const deleteConversation = (id) => API.delete(`/wa/conversations/${id}`);

export const sendMessage = (numberId, to, body) =>
  API.post('/wa/send', { numberId, to, body });

export const updateContactName = (waId, name) =>
  API.patch(`/wa/contacts/${encodeURIComponent(waId)}/name`, { name });

export default API;
