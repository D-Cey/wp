import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

let socket = null;

export function useSocket(token, handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!token) return;

    const SOCKET_URL = window.location.hostname === 'localhost'
      ? 'http://localhost:3001'
      : window.location.origin;

    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['polling', 'websocket'],
    });

    socket.on('connect', () => console.log('Socket connected'));
    socket.on('disconnect', () => console.log('Socket disconnected'));

    socket.on('wa:qr', (data) => handlersRef.current?.onQR?.(data));
    socket.on('wa:status', (data) => handlersRef.current?.onStatus?.(data));
    socket.on('wa:message', (data) => handlersRef.current?.onMessage?.(data));
    socket.on('wa:conversations_updated', (data) => handlersRef.current?.onConversationsUpdated?.(data));

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [token]);

  return socket;
}
