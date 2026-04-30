const WebSocket = require("ws");
const http = require("http");
const Database = require("better-sqlite3");
const path = require("path");

// ─── DATABASE SETUP ───────────────────────────────────────────────
const db = new Database(path.join(__dirname, "game.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS game_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    played_at TEXT NOT NULL,
    player1_name TEXT,
    player2_name TEXT,
    levels TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

function saveHistory(roomCode, p1name, p2name, levels) {
  db.prepare(`
    INSERT INTO game_history (room_code, played_at, player1_name, player2_name, levels)
    VALUES (?, ?, ?, ?, ?)
  `).run(roomCode, new Date().toISOString(), p1name, p2name, JSON.stringify(levels));
}

function getHistory(roomCode) {
  return db.prepare(`SELECT * FROM game_history WHERE room_code = ? ORDER BY created_at DESC LIMIT 20`).all(roomCode);
}

function getAllHistory() {
  return db.prepare(`SELECT * FROM game_history ORDER BY created_at DESC LIMIT 50`).all();
}

// ─── HTTP SERVER ───────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && req.url === "/history") {
    const rows = getAllHistory();
    res.writeHead(200);
    res.end(JSON.stringify(rows.map(r => ({ ...r, levels: JSON.parse(r.levels) }))));
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/history/")) {
    const code = req.url.split("/history/")[1];
    const rows = getHistory(code);
    res.writeHead(200);
    res.end(JSON.stringify(rows.map(r => ({ ...r, levels: JSON.parse(r.levels) }))));
    return;
  }

  res.writeHead(200);
  res.end(JSON.stringify({ status: "ok", name: "Would You Rather Game Server v2" }));
});

const wss = new WebSocket.Server({ server });

// ─── DEFAULT QUESTIONS ────────────────────────────────────────────
const DEFAULT_QUESTIONS = [
  [
    { type: "ab", question: "Liburan impian kamu?", a: "Pantai santai, rebahan & sunset 🌅", b: "Hiking gunung, dingin & view keren 🏔️" },
    { type: "ab", question: "Kalau date makan malam, milih?", a: "Restoran fancy, romantis & lilin 🕯️", b: "Warung pinggir jalan, murah & enak 🍜" },
    { type: "ab", question: "Weekend di rumah, lebih suka?", a: "Nonton film marathon seharian 🎬", b: "Main game atau board game bareng 🎮" },
    { type: "ab", question: "Cuaca favorit kamu?", a: "Panas cerah, jalan-jalan & es krim ☀️", b: "Hujan deras, di rumah & selimutan 🌧️" },
    { type: "ab", question: "Peliharaan impian?", a: "Kucing manja yang menggemaskan 🐱", b: "Anjing setia yang suka diajak main 🐶" },
  ],
  [
    { type: "ab", question: "Kalau bisa punya superpower?", a: "Terbang ke mana aja sesuka hati ✈️", b: "Baca pikiran orang lain 🧠" },
    { type: "ab", question: "Kado yang paling berkesan?", a: "Hadiah mahal yang kamu mau banget 💎", b: "Sesuatu yang dibuat sendiri dengan hati 🎨" },
    { type: "ab", question: "Habiskan malam minggu?", a: "Pesta rame-rame, banyak orang 🎉", b: "Dinner berdua yang quiet & intimate 🕯️" },
    { type: "ab", question: "Soal waktu, kamu tipe?", a: "Early bird, bangun pagi & produktif 🌅", b: "Night owl, hidup mulai malam 🌙" },
    { type: "ab", question: "Musik favorit lagi santai?", a: "Lo-fi chill, instrumental & ngantuk enak 🎧", b: "Lagu upbeat, nyanyi-nyanyi & goyang 🎤" },
  ],
  [
    { type: "ab", question: "Kalau bisa time travel?", a: "Balik ke masa lalu & ubah sesuatu ⏪", b: "Loncat ke masa depan & liat hasilnya ⏩" },
    { type: "ab", question: "Kalau tiba-tiba kaya raya?", a: "Keliling dunia & explore tempat baru 🌍", b: "Beli rumah impian & hidup nyaman 🏡" },
    { type: "ab", question: "Kerja yang ideal?", a: "Remote dari mana aja, bebas & fleksibel 💻", b: "Kantor seru, ketemu orang & kolaborasi 🏢" },
    { type: "ab", question: "Film favorit kamu?", a: "Komedi & ketawa sampai sakit perut 😂", b: "Drama & nangis sambil makan popcorn 😭" },
    { type: "ab", question: "Cara healing paling efektif?", a: "Sendirian dulu, me-time & recharge 🔋", b: "Jalan sama teman, curhat & ketawa 👥" },
  ],
];

const CHALLENGES = [
  "Yang beda: cerita kenangan paling lucu kamu!",
  "Yang beda: peragakan ekspresi kalau disuruh pilih yang lain 😂",
  "Yang beda: convince yang lain dalam 30 detik kenapa pilihan kamu lebih baik!",
  "Yang beda: cerita satu hal random yang bikin kamu ketawa hari ini!",
  "Yang beda: tebak kenapa yang lain milih itu — bener atau salah?",
  "Yang beda: kasih alasan paling absurd kenapa pilihan kamu lebih oke!",
];

// ─── ROOM STATE ───────────────────────────────────────────────────
const rooms = {};

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function makeRoom(code, name) {
  return {
    code,
    players: { "1": null, "2": null },
    state: {
      phase: "waiting",
      names: { "1": name, "2": "" },
      questions: JSON.parse(JSON.stringify(DEFAULT_QUESTIONS)),
      level: 0,
      qIndex: 0,
      consecutiveSame: 0,
      secretUsedInLevel: false,
      _injectSecret: false,
      answers: {},
      scores: { "1": 0, "2": 0 },
      voteNext: {},
      history: [],
      currentLevelHistory: [],
      timer: null,
    },
  };
}

function broadcast(room, data) {
  const msg = JSON.stringify(data);
  ["1", "2"].forEach(n => {
    const ws = room.players[n];
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// ─── GAME LOGIC ───────────────────────────────────────────────────
function getQuestion(room) {
  const lvl = room.state.level;
  const qi = room.state.qIndex;
  const qs = room.state.questions;
  return qs[lvl] && qs[lvl][qi] ? qs[lvl][qi] : null;
}

function startQuestion(room) {
  clearTimeout(room.state.timer);
  room.state.answers = {};
  const q = getQuestion(room);
  if (!q) return endLevel(room);

  const lvl = room.state.level;
  const qi = room.state.qIndex;
  const totalQ = room.state.questions[lvl].length;

  broadcast(room, {
    type: "question",
    level: lvl + 1,
    qNum: qi + 1,
    total: totalQ,
    scores: room.state.scores,
    question: q,
    isSecret: q.type === "secret",
    consecutiveSame: room.state.consecutiveSame,
  });

  const timeout = q.type === "secret" ? 30000 : 20000;
  room.state.timer = setTimeout(() => revealAnswer(room), timeout);
}

function revealAnswer(room) {
  clearTimeout(room.state.timer);
  const q = getQuestion(room);
  if (!q) return;
  const ans = room.state.answers;
  const a1 = ans["1"] !== undefined ? ans["1"] : null;
  const a2 = ans["2"] !== undefined ? ans["2"] : null;
  const isSecret = q.type === "secret";

  let same = false;
  if (!isSecret) {
    same = a1 !== null && a2 !== null && a1 === a2;
    if (same) {
      room.state.scores["1"] += 2;
      room.state.scores["2"] += 2;
      room.state.consecutiveSame++;
    } else {
      room.state.consecutiveSame = 0;
    }
  }

  room.state.currentLevelHistory.push({
    qNum: room.state.qIndex + 1,
    question: q,
    answers: { "1": a1, "2": a2 },
    same,
    isSecret,
  });

  const challenge = !isSecret && !same
    ? CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)]
    : null;

  if (!isSecret && room.state.consecutiveSame >= 3 && !room.state.secretUsedInLevel) {
    room.state._injectSecret = true;
  }

  broadcast(room, {
    type: "reveal",
    answers: { "1": a1, "2": a2 },
    same,
    isSecret,
    challenge,
    scores: room.state.scores,
    consecutiveSame: room.state.consecutiveSame,
  });
}

function nextQuestion(room) {
  if (room.state._injectSecret) {
    room.state._injectSecret = false;
    room.state.secretUsedInLevel = true;
    const secretQ = {
      type: "secret",
      question: "🔐 SECRET ROUND! Tulis jawaban jujur kamu — keliatan setelah keduanya submit!",
    };
    room.state.questions[room.state.level].splice(room.state.qIndex + 1, 0, secretQ);
  }

  room.state.qIndex++;
  const lvl = room.state.level;
  if (room.state.qIndex >= room.state.questions[lvl].length) {
    endLevel(room);
  } else {
    startQuestion(room);
  }
}

function endLevel(room) {
  const lvl = room.state.level;
  room.state.history.push({
    level: lvl + 1,
    questions: room.state.currentLevelHistory,
  });
  room.state.currentLevelHistory = [];

  const maxLvl = (room.state.totalLevels || 3) - 1;
  if (lvl >= maxLvl) {
    endGame(room);
  } else {
    room.state.phase = "vote";
    room.state.voteNext = {};
    broadcast(room, {
      type: "vote_start",
      level: lvl + 1,
      scores: room.state.scores,
      names: room.state.names,
    });
  }
}

function endGame(room) {
  room.state.phase = "done";
  clearTimeout(room.state.timer);
  const names = room.state.names;
  saveHistory(room.code, names["1"], names["2"], room.state.history);
  const rows = getAllHistory();
  broadcast(room, {
    type: "game_over",
    scores: room.state.scores,
    names,
    history: room.state.history,
    allHistory: rows.map(r => ({ ...r, levels: JSON.parse(r.levels) })),
  });
}

// ─── WEBSOCKET HANDLER ────────────────────────────────────────────
wss.on("connection", ws => {
  ws.roomCode = null;
  ws.playerNum = null;

  ws.on("message", raw => {
    let d;
    try { d = JSON.parse(raw); } catch { return; }
    handle(ws, d);
  });

  ws.on("close", () => {
    if (!ws.roomCode || !rooms[ws.roomCode]) return;
    const room = rooms[ws.roomCode];
    clearTimeout(room.state.timer);
    broadcast(room, { type: "player_left", player: ws.playerNum });
    setTimeout(() => { delete rooms[ws.roomCode]; }, 60000);
  });
});

function handle(ws, d) {
  const room = ws.roomCode ? rooms[ws.roomCode] : null;

  switch (d.type) {
    case "create_room": {
      let code = generateCode();
      while (rooms[code]) code = generateCode();
      const r = makeRoom(code, d.name || "Player 1");
      rooms[code] = r;
      r.players["1"] = ws;
      ws.roomCode = code;
      ws.playerNum = "1";
      ws.send(JSON.stringify({ type: "room_created", code, playerNum: "1", name: d.name }));
      break;
    }

    case "join_room": {
      const code = (d.code || "").toUpperCase().trim();
      const r = rooms[code];
      if (!r) return ws.send(JSON.stringify({ type: "error", msg: "Room tidak ditemukan! 👀" }));
      if (r.players["2"]) return ws.send(JSON.stringify({ type: "error", msg: "Room sudah penuh 😅" }));
      r.players["2"] = ws;
      r.state.names["2"] = d.name || "Player 2";
      ws.roomCode = code;
      ws.playerNum = "2";
      ws.send(JSON.stringify({ type: "joined", code, playerNum: "2", name: d.name, opponentName: r.state.names["1"] }));
      broadcast(r, { type: "both_joined", names: r.state.names });
      break;
    }

    case "setup_done": {
      if (!room || ws.playerNum !== "1") return;
      if (d.questions && Array.isArray(d.questions) && d.questions.length >= 1) {
        room.state.questions = d.questions;
        room.state.totalLevels = d.questions.length; // 1, 2, or 3
      }
      room.state.phase = "playing";
      room.state.level = 0;
      room.state.qIndex = 0;
      room.state.consecutiveSame = 0;
      room.state.secretUsedInLevel = false;
      room.state._injectSecret = false;
      room.state.history = [];
      room.state.currentLevelHistory = [];
      room.state.scores = { "1": 0, "2": 0 };
      broadcast(room, { type: "game_starting", names: room.state.names, totalLevels: room.state.totalLevels || 3 });
      setTimeout(() => startQuestion(room), 1000);
      break;
    }

    case "answer": {
      if (!room) return;
      const pNum = ws.playerNum;
      if (room.state.answers[pNum] !== undefined) return;
      room.state.answers[pNum] = d.answer;
      broadcast(room, { type: "player_answered", player: pNum });
      if (room.state.answers["1"] !== undefined && room.state.answers["2"] !== undefined) {
        clearTimeout(room.state.timer);
        setTimeout(() => revealAnswer(room), 700);
      }
      break;
    }

    case "next_question": {
      if (!room || ws.playerNum !== "1") return;
      nextQuestion(room);
      break;
    }

    case "vote": {
      if (!room || room.state.phase !== "vote") return;
      room.state.voteNext[ws.playerNum] = d.yes;
      broadcast(room, { type: "vote_update", votes: room.state.voteNext, names: room.state.names });
      if (Object.keys(room.state.voteNext).length === 2) {
        const yes = room.state.voteNext["1"] && room.state.voteNext["2"];
        if (yes) {
          room.state.level++;
          room.state.qIndex = 0;
          room.state.consecutiveSame = 0;
          room.state.secretUsedInLevel = false;
          room.state._injectSecret = false;
          room.state.phase = "playing";
          broadcast(room, { type: "level_start", level: room.state.level + 1, scores: room.state.scores, totalLevels: room.state.totalLevels || 3 });
          setTimeout(() => startQuestion(room), 1000);
        } else {
          endGame(room);
        }
      }
      break;
    }

    case "get_history": {
      const rows = getAllHistory();
      ws.send(JSON.stringify({
        type: "history_data",
        data: rows.map(r => ({ ...r, levels: JSON.parse(r.levels) })),
      }));
      break;
    }

    case "restart": {
      if (!room || ws.playerNum !== "1") return;
      clearTimeout(room.state.timer);
      room.state.phase = "waiting";
      room.state.level = 0;
      room.state.qIndex = 0;
      room.state.scores = { "1": 0, "2": 0 };
      room.state.answers = {};
      room.state.voteNext = {};
      room.state.consecutiveSame = 0;
      room.state.secretUsedInLevel = false;
      room.state._injectSecret = false;
      room.state.history = [];
      room.state.currentLevelHistory = [];
      room.state.questions = JSON.parse(JSON.stringify(DEFAULT_QUESTIONS));
      broadcast(room, { type: "restart", names: room.state.names });
      break;
    }
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🎮 Server v2 running on port ${PORT}`));
