require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const authRoutes = require('./routes/auth');
const waRoutes = require('./routes/whatsapp');
const waService = require('./services/whatsappService');
const db = require('./db/database');

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const isProduction = process.env.NODE_ENV === 'production';

const io = new Server(server, {
  cors: {
    origin: isProduction ? '*' : FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: isProduction ? '*' : FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/wa', waRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// React build'i serve et
const buildPath = path.join(__dirname, '../../frontend/build');
app.use(express.static(buildPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// Socket.IO auth
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Yetkisiz'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret-change-this');
    socket.user = decoded;
    next();
  } catch {
    next(new Error('Geçersiz token'));
  }
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Pass io to whatsapp service
waService.setIO(io);

const PORT = process.env.PORT || 3001;

db.initDB().then(async () => {
  server.listen(PORT, async () => {
    console.log(`\n🚀 Backend çalışıyor: http://localhost:${PORT}`);
    console.log('📱 Kayıtlı numaralar yeniden bağlanıyor...\n');
    await waService.initializeSavedNumbers();
  });
}).catch(err => {
  console.error('Veritabanı başlatılamadı:', err);
  process.exit(1);
});
