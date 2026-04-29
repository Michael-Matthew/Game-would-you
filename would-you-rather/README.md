# Would You Rather? 🎮 — Deploy Guide

## Struktur File
```
would-you-rather/
├── server.js          ← WebSocket server (deploy ke Railway/Render)
├── package.json
├── README.md
└── public/
    └── index.html     ← Frontend (deploy ke Netlify)
```

---

## Step 1 — Deploy Server ke Railway (GRATIS)

1. Buka https://railway.app → Login pakai GitHub
2. Klik **"New Project"** → **"Deploy from GitHub Repo"**
3. Upload folder `would-you-rather` ke GitHub dulu, atau pakai **"Empty Project"** → deploy manual
4. Pilih repo → Railway otomatis detect `package.json`
5. Setelah deploy, klik project → tab **"Settings"** → copy URL-nya
   - Contoh: `would-you-rather-production.up.railway.app`

---

## Step 2 — Edit index.html

Buka `public/index.html`, cari baris ini (sekitar baris 380):

```javascript
const SERVER_URL = (location.hostname === 'localhost' ...)
  ? 'ws://localhost:3001'
  : 'wss://YOUR_SERVER_URL'; // <-- GANTI INI
```

Ganti `YOUR_SERVER_URL` dengan URL Railway kamu:
```javascript
  : 'wss://would-you-rather-production.up.railway.app';
```

---

## Step 3 — Deploy Frontend ke Netlify

1. Buka https://netlify.com → Login
2. Drag & drop folder **`public/`** ke Netlify dashboard
3. Done! Netlify kasih URL gratis, contoh: `your-game.netlify.app`

---

## Step 4 — Cara Main

1. Buka link Netlify
2. Player 1: isi nama → klik **"Bikin Room"** → dapat kode 4 huruf
3. Kirim kode ke teman
4. Player 2: isi nama → masukkan kode → **"Join"**
5. Player 1 klik **"Mulai Game"**
6. Main bareng! 🎉

---

## Alternatif Server: Render.com

1. Buka https://render.com → New → Web Service
2. Connect GitHub repo
3. **Build Command**: `npm install`
4. **Start Command**: `node server.js`
5. Copy URL dari Render → pakai di index.html

---

## Test Lokal

```bash
# Install dependencies
npm install

# Jalankan server
node server.js

# Buka public/index.html di 2 tab browser berbeda
# Server berjalan di ws://localhost:3001
```
