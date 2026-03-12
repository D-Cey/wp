# WA Panel - Kurulum ve Çalıştırma Kılavuzu

## Gereksinimler
- Node.js 18+
- npm 9+
- Google Chrome veya Chromium (whatsapp-web.js için)

---

## 1. Proje Yapısı
```
whatsapp-panel/
├── backend/          ← Node.js + Express + WA
└── frontend/         ← React arayüz
```

---

## 2. Backend Kurulum

```bash
cd backend

# Bağımlılıkları yükle
npm install

# .env dosyası oluştur
cp .env.example .env
```

**.env dosyasını düzenle:**
```
PORT=3001
JWT_SECRET=BURAYA_GUCLU_BIR_SIFRE_YAZ_12345
ADMIN_USERNAME=admin
ADMIN_PASSWORD=sifrenizi_buraya_yazin
WA_SESSION_PATH=./sessions
FRONTEND_URL=http://localhost:3000
```

---

## 3. Frontend Kurulum

```bash
cd frontend
npm install
```

---

## 4. Çalıştırma

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# → http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm start
# → http://localhost:3000
```

---

## 5. İlk Kullanım

1. `http://localhost:3000` adresine git
2. `.env`'deki kullanıcı adı ve şifre ile giriş yap
3. Sağ üstteki **⚙️ Numaralar** butonuna tıkla
4. "Yeni Numara Bağla" bölümünden numara ekle:
   - **ID:** `numara_a` (küçük harf, alt çizgi)
   - **Etiket:** `Numara A` (panelde görünen isim)
5. QR kodu otomatik çıkacak → WhatsApp ile tarat
6. Bağlantı yeşil göstergede görünecek

---

## 6. WhatsApp QR Taratma
- Telefonunda WhatsApp'ı aç
- ⋮ Menü → **Bağlı Cihazlar** → **Cihaz Ekle**
- QR'ı tara

---

## 7. Güvenlik Notları
- `.env` dosyasını **asla** git'e yükleme
- `JWT_SECRET`'i güçlü ve rastgele bir string yap
- Production'da HTTPS kullan
- `sessions/` klasörü WA oturumlarını saklar — yedekle

---

## 8. Sorun Giderme

**"Puppeteer/Chrome bulunamadı" hatası:**
```bash
# Ubuntu/Debian
sudo apt-get install -y chromium-browser
# .env'e ekle:
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

**"Port kullanımda" hatası:**
```bash
# .env'de PORT değiştir (örn: 3002)
# frontend/package.json'da "proxy": "http://localhost:3002"
```

**Numara ban yedisi:**
- Kişisel numaralarla test etme
- Projeye özel SIM kartları kullan
- Çok hızlı toplu mesaj gönderme
