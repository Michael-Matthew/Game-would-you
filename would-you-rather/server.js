const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
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

function deleteHistory(id) {
  db.prepare(`DELETE FROM game_history WHERE id = ?`).run(id);
}

// ─── HTTP SERVER ───────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Serve frontend HTML
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const filePath = path.join(__dirname, "public", "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(500); res.end("Error loading index.html"); return; }
      res.setHeader("Content-Type", "text/html");
      res.writeHead(200);
      res.end(data);
    });
    return;
  }

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

const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

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
      bonusUsedInLevel: false,
      honestUsedInLevel: false,
      _injectBonus: false,
      _injectHonest: false,
      _injectSecret: false,
      answers: {},
      scores: { "1": 0, "2": 0 },
      guessScores: { "1": 0, "2": 0 },
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
  const base = {
    type: "question",
    level: lvl + 1,
    qNum: qi + 1,
    total: totalQ,
    scores: room.state.scores,
    isSecret: q.type === "secret",
    consecutiveSame: room.state.consecutiveSame,
  };

  if (q.type === "bonus_pair") {
    // Kirim pertanyaan berbeda ke tiap player
    ["1", "2"].forEach(n => {
      const ws = room.players[n];
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          ...base,
          question: { ...q, question: q.questionFor[n], type: "open" },
          isBonus: true,
        }));
      }
    });
  } else {
    broadcast(room, { ...base, question: q });
  }

  const timeout = (q.type === "secret" || q.type === "bonus_pair") ? 30000 : 20000;
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
  const isBonus = q.type === "bonus_pair";
  const isGuessMode = room.state.gameMode === "guess";

  let same = false;
  if (!isSecret && !isBonus) {
    if (isGuessMode) {
      // Guess mode: a2 adalah tebakan P2 tentang P1, bukan jawaban independen P2.
      // Jangan bandingkan a1===a2 sebagai "sama", jangan kasih skor, jangan hitung streak.
      // Skor ditangani client via pesan "guess_point".
      same = false;
      // streak tidak diubah di sini — diurus di handler next_question
    } else {
      same = a1 !== null && a2 !== null && a1 === a2;
      if (same) {
        room.state.scores["1"] += 2;
        room.state.scores["2"] += 2;
        room.state.consecutiveSame++;
      } else {
        room.state.consecutiveSame = 0;
      }
    }
  }

  room.state.currentLevelHistory.push({
    qNum: room.state.qIndex + 1,
    question: q,
    answers: { "1": a1, "2": a2 },
    same,
    isSecret,
    isBonus,
  });

  const challenge = (!isSecret && !isBonus && !same && !isGuessMode)
    ? CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)]
    : null;

  if (!isSecret && !isBonus && !isGuessMode) {
    const cs = room.state.consecutiveSame;
    if (cs >= 5 && !room.state.honestUsedInLevel) {
      room.state._injectHonest = true;
    } else if (cs >= 3 && !room.state.bonusUsedInLevel && !room.state._injectHonest) {
      room.state._injectBonus = true;
    }
  }

  if (isBonus) {
    // Kirim reveal per-player dengan label soal masing-masing
    ["1", "2"].forEach(n => {
      const ws = room.players[n];
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: "reveal",
          answers: { "1": a1, "2": a2 },
          same: false,
          isSecret: false,
          isBonus: true,
          bonusQuestionFor: q.questionFor,
          challenge: null,
          scores: room.state.scores,
          consecutiveSame: room.state.consecutiveSame,
        }));
      }
    });
    return;
  }

  broadcast(room, {
    type: "reveal",
    question: q,
    answers: { "1": a1, "2": a2 },
    same,
    isSecret,
    challenge,
    scores: room.state.scores,
    consecutiveSame: room.state.consecutiveSame,
  });
}

function nextQuestion(room) {
  if (room.state._injectHonest) {
    room.state._injectHonest = false;
      room.state._waitingBonus = false;
    room.state.honestUsedInLevel = true;
    const honestQ = {
      type: "secret",
      question: "🔐 JUJUR ROUND! Ada hal yang ingin kamu sampaikan ke pasangan kamu? Tulis sekarang — cuma kalian berdua yang tahu.",
    };
    room.state.questions[room.state.level].splice(room.state.qIndex + 1, 0, honestQ);
  } else if (room.state._injectBonus) {
    room.state._injectBonus = false;
    room.state.bonusUsedInLevel = true;
    room.state._waitingBonus = true;
    // Trigger client to open bonus question prompt — pause here until both submit
    broadcast(room, { type: "trigger_bonus_question" });
    return; // don't advance yet
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
  // History tidak auto-save — player memilih di akhir game
  broadcast(room, {
    type: "game_over",
    scores: room.state.scores,
    guessScores: room.state.guessScores || { "1": 0, "2": 0 },
    names,
    history: room.state.history,
    allHistory: null, // will be loaded separately if saved
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
      broadcast(r, { type: "both_joined", names: r.state.names, gameMode: r.state.gameMode || 'match' });
      break;
    }

    case "setup_done": {
      if (!room || ws.playerNum !== "1") return;
      if (d.questions && Array.isArray(d.questions) && d.questions.length >= 1) {
        room.state.questions = d.questions;
        room.state.totalLevels = d.questions.length;
      }
      // Save game mode
      if (d.gameMode) room.state.gameMode = d.gameMode;
      // Inject bonus questions ke level terakhir kalau ada
      if (room.state.bonusPending && room.state.bonusQuestions) {
        const bq = room.state.bonusQuestions;
        const lastLvlIdx = room.state.totalLevels - 1;
        const n1 = room.state.names["1"];
        const n2 = room.state.names["2"];
        // Simpan sebagai satu soal tipe "bonus_pair"
        // P1 dapat soal dari P2, P2 dapat soal dari P1
        if (bq["1"] && bq["2"]) {
          room.state.questions[lastLvlIdx].push({
            type: "bonus_pair",
            // questionFor["1"] = soal yang diterima P1 (dibuat P2 buat P1)
            questionFor: {
              "1": `💌 ${n2} buat kamu: ${bq["2"]}`,
              "2": `💌 ${n1} buat kamu: ${bq["1"]}`,
            },
            question: `💌 Bonus Question`,
            isBonus: true,
          });
        }
        room.state.bonusPending = false;
      }
      room.state.phase = "playing";
      room.state.level = 0;
      room.state.qIndex = 0;
      room.state.consecutiveSame = 0;
      room.state.secretUsedInLevel = false;
      room.state.bonusUsedInLevel = false;
      room.state.honestUsedInLevel = false;
      room.state._injectBonus = false;
      room.state._injectHonest = false;
      room.state._waitingBonus = false;
      room.state._injectSecret = false;
      room.state.history = [];
      room.state.currentLevelHistory = [];
      room.state.scores = { "1": 0, "2": 0 };
      room.state.guessScores = { "1": 0, "2": 0 };
      broadcast(room, { type: "game_starting", names: room.state.names, totalLevels: room.state.totalLevels || 3, gameMode: room.state.gameMode || 'match' });
      setTimeout(() => startQuestion(room), 1000);
      break;
    }

    case "set_mode": {
      if (!room || ws.playerNum !== "1") return;
      room.state.gameMode = d.gameMode || "match";
      // Broadcast updated mode to both players immediately
      broadcast(room, { type: "mode_updated", gameMode: room.state.gameMode });
      break;
    }

    case "guess_point": {
      if (!room) return;
      room.state.guessScores["2"] = (room.state.guessScores["2"] || 0) + 1;
      room.state._guessCorrectThisRound = true;
      // In guess mode, treat correct guess as "same" for streak purposes
      room.state.consecutiveSame++;
      const cs = room.state.consecutiveSame;
      if (cs >= 5 && !room.state.honestUsedInLevel) {
        room.state._injectHonest = true;
      } else if (cs >= 3 && !room.state.bonusUsedInLevel && !room.state._injectHonest) {
        room.state._injectBonus = true;
      }
      broadcast(room, { type: "guess_score_update", guessScores: room.state.guessScores, consecutiveSame: room.state.consecutiveSame });
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
      // In guess mode, if no guess_point was sent for this question, it was wrong → reset streak
      if (room.state.gameMode === "guess" && !room.state._guessCorrectThisRound) {
        room.state.consecutiveSame = 0;
      }
      room.state._guessCorrectThisRound = false;
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
      room.state.bonusUsedInLevel = false;
      room.state.honestUsedInLevel = false;
      room.state._injectBonus = false;
      room.state._injectHonest = false;
      room.state._waitingBonus = false;
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

    case "delete_history": {
      if (d.id) deleteHistory(d.id);
      const rowsDel = getAllHistory();
      ws.send(JSON.stringify({
        type: "history_data",
        data: rowsDel.map(r => ({ ...r, levels: JSON.parse(r.levels) })),
      }));
      break;
    }

    case "vote_save": {
      if (!room) return;
      if (!room.state.saveVotes) room.state.saveVotes = {};
      room.state.saveVotes[ws.playerNum] = d.yes;
      broadcast(room, { type: "save_vote_update", votes: room.state.saveVotes, names: room.state.names });
      if (Object.keys(room.state.saveVotes).length === 2) {
        const bothYes = room.state.saveVotes["1"] && room.state.saveVotes["2"];
        if (bothYes) {
          const namesV = room.state.names;
          saveHistory(room.code, namesV["1"], namesV["2"], room.state.history);
          const rowsV = getAllHistory();
          broadcast(room, {
            type: "history_saved",
            allHistory: rowsV.map(r => ({ ...r, levels: JSON.parse(r.levels) })),
          });
        } else {
          broadcast(room, { type: "save_declined" });
        }
        room.state.saveVotes = {};
      }
      break;
    }

    case "open_bonus_prompt": {
      // P1 triggered bonus → notify P2 to open the overlay too
      if (!room) return;
      const other = ws.playerNum === "1" ? "2" : "1";
      const otherWs = room.players[other];
      if (otherWs && otherWs.readyState === WebSocket.OPEN) {
        otherWs.send(JSON.stringify({ type: "open_bonus_prompt" }));
      }
      break;
    }

    case "save_to_history": {
      if (!room) return;
      const namesH = room.state.names;
      saveHistory(room.code, namesH["1"], namesH["2"], room.state.history);
      const rowsSave = getAllHistory();
      broadcast(room, {
        type: "history_saved",
        allHistory: rowsSave.map(r => ({ ...r, levels: JSON.parse(r.levels) })),
      });
      break;
    }

    case "submit_bonus_question": {
      if (!room) return;
      if (!room.state.bonusQuestions) room.state.bonusQuestions = {};
      room.state.bonusQuestions[ws.playerNum] = d.question;
      broadcast(room, { type: "bonus_question_received", from: ws.playerNum });
      // Cek kalau keduanya sudah submit
      const bq = room.state.bonusQuestions;
      if (bq["1"] && bq["2"]) {
        // Inject bonus question immediately into current level queue
        const n1 = room.state.names["1"];
        const n2 = room.state.names["2"];
        const bonusQ = {
          type: "bonus_pair",
          questionFor: {
            "1": `💌 ${n2} buat kamu: ${bq["2"]}`,
            "2": `💌 ${n1} buat kamu: ${bq["1"]}`,
          },
          question: "💌 Bonus Question",
          isBonus: true,
        };
        // If we paused for bonus, inject at current+1 position and resume
        const insertIdx = room.state._waitingBonus
          ? room.state.qIndex + 1
          : room.state.qIndex + 1;
        room.state.questions[room.state.level].splice(insertIdx, 0, bonusQ);
        room.state.bonusQuestions = {};
        room.state._waitingBonus = false;
        broadcast(room, { type: "bonus_questions_ready" });
        // Resume: advance to the injected bonus question
        room.state.qIndex++;
        startQuestion(room);
      }
      break;
    }

    case "restart": {
      if (!room || ws.playerNum !== "1") return;
      clearTimeout(room.state.timer);
      room.state.phase = "waiting";
      room.state.level = 0;
      room.state.qIndex = 0;
      room.state.scores = { "1": 0, "2": 0 };
      room.state.guessScores = { "1": 0, "2": 0 };
      room.state.answers = {};
      room.state.voteNext = {};
      room.state.consecutiveSame = 0;
      room.state.secretUsedInLevel = false;
      room.state.bonusUsedInLevel = false;
      room.state.honestUsedInLevel = false;
      room.state._injectBonus = false;
      room.state._injectHonest = false;
      room.state._waitingBonus = false;
      room.state._injectSecret = false;
      room.state.history = [];
      room.state.currentLevelHistory = [];
      room.state.questions = JSON.parse(JSON.stringify(DEFAULT_QUESTIONS));
      room.state.bonusQuestions = {};
      broadcast(room, { type: "restart", names: room.state.names });
      break;
    }
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🎮 Server v2 running on port ${PORT}`));
