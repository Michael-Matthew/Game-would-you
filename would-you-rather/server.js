const WebSocket = require("ws");
const http = require("http");

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Would You Rather? Game Server 🎮");
});

const wss = new WebSocket.Server({ server });

// rooms[roomCode] = { players: {1: ws, 2: ws}, state: {...} }
const rooms = {};

const questions = [
  {
    category: "🌴 LIBURAN",
    question: "Kalau bisa liburan, lebih pilih mana?",
    a: "Pantai santai, rebahan, sunset views 🌅",
    b: "Hiking ke gunung, dingin-dingin, view keren 🏔️",
    challenge: "Yang jawabannya beda: cerita 1 destinasi impian paling pengen dikunjungin!",
  },
  {
    category: "🍕 KULINER",
    question: "Kalau date makan malam, lebih milih?",
    a: "Restoran fancy, suasana romantis, lilin-lilin 🕯️",
    b: "Warung pinggir jalan, murah meriah, enak banget 🍜",
    challenge: "Yang jawabannya beda: rekomendasiin 1 tempat makan favorit ke yang lain sekarang!",
  },
  {
    category: "🎬 HIBURAN",
    question: "Weekend di rumah, lebih suka?",
    a: "Nonton film marathon seharian 🎬",
    b: "Main game atau board game bareng 🎮",
    challenge: "Yang jawabannya beda: convince yang lain buat nyobain film/game favorit kamu!",
  },
  {
    category: "🐾 PELIHARAAN",
    question: "Kalau boleh punya peliharaan, pilih?",
    a: "Kucing menggemaskan yang manja 🐱",
    b: "Anjing setia yang suka diajak main 🐶",
    challenge: "Yang jawabannya beda: peragakan suara atau tingkah laku hewan pilihan kamu! 😂",
  },
  {
    category: "⏰ RUTINITAS",
    question: "Soal waktu, kamu lebih tipe?",
    a: "Early bird, bangun pagi, produktif dari jam 5 🌅",
    b: "Night owl, hidup mulai malam, tidur subuh 🌙",
    challenge: "Yang jawabannya beda: ceritain 1 hal yang biasa dilakuin di waktu favorit kamu!",
  },
  {
    category: "💝 HADIAH",
    question: "Kado yang paling berkesan menurutmu?",
    a: "Hadiah kejutan mahal yang kamu mau banget 💎",
    b: "Sesuatu yang dibuat sendiri dengan hati 🎨",
    challenge: "Yang beda: kasih tau kado impian yang paling diinginkan ke satu sama lain!",
  },
  {
    category: "🎉 SOSIAL",
    question: "Habiskan malam minggu dengan cara?",
    a: "Pesta rame-rame, banyak orang, seru 🎉",
    b: "Dinner berdua yang quiet dan intimate 🕯️",
    challenge: "Yang beda: act out gimana reaksi kamu kalau tiba-tiba diajak ke pilihan yang lain!",
  },
  {
    category: "🚀 SUPERPOWER",
    question: "Superpower yang pengen kamu punya?",
    a: "Bisa terbang ke mana aja sesuka hati ✈️",
    b: "Bisa baca pikiran orang lain 🧠",
    challenge: "Yang beda: cerita 1 hal pertama yang bakal kamu lakuin kalau punya superpower itu!",
  },
  {
    category: "🎵 MUSIK",
    question: "Kalau lagi santai, lebih suka dengerin?",
    a: "Lo-fi chill, instrumental, ngantuk-ngantuk enak 🎧",
    b: "Lagu upbeat, nyanyi-nyanyi, goyang tipis 🎤",
    challenge: "Yang beda: nyanyi atau senandungin lagu favorit kalian sekarang! 🎵",
  },
  {
    category: "☀️ CUACA",
    question: "Cuaca favorit kamu?",
    a: "Panas cerah, jalan-jalan, es krim di taman ☀️",
    b: "Hujan deras, di rumah, selimutan sambil nonton 🌧️",
    challenge: "Yang beda: ceritain kenangan paling seru di cuaca favorit kamu!",
  },
];

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function broadcast(room, data) {
  const msg = JSON.stringify(data);
  Object.values(room.players).forEach((ws) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

function startRound(room) {
  room.state.answers = {};
  room.state.timerStart = Date.now();
  const q = room.state.questions[room.state.round];
  broadcast(room, {
    type: "round_start",
    round: room.state.round + 1,
    total: room.state.questions.length,
    question: q,
    scores: room.state.scores,
  });

  // Auto-reveal after 16s server-side
  room.state.timer = setTimeout(() => revealAnswers(room), 16000);
}

function revealAnswers(room) {
  clearTimeout(room.state.timer);
  const q = room.state.questions[room.state.round];
  const ans = room.state.answers;
  const p1ans = ans["1"] || null;
  const p2ans = ans["2"] || null;
  const same = p1ans && p2ans && p1ans === p2ans;

  if (same) {
    room.state.scores["1"] += 2;
    room.state.scores["2"] += 2;
  }

  broadcast(room, {
    type: "reveal",
    answers: { "1": p1ans, "2": p2ans },
    same,
    challenge: same ? null : q.challenge,
    scores: room.state.scores,
    round: room.state.round + 1,
    total: room.state.questions.length,
  });
}

function nextRound(room) {
  room.state.round++;
  if (room.state.round >= room.state.questions.length) {
    broadcast(room, { type: "game_over", scores: room.state.scores, names: room.state.names });
  } else {
    startRound(room);
  }
}

wss.on("connection", (ws) => {
  ws.roomCode = null;
  ws.playerNum = null;

  ws.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.type === "create_room") {
      let code = generateRoomCode();
      while (rooms[code]) code = generateRoomCode();
      rooms[code] = {
        players: { "1": ws, "2": null },
        state: {
          phase: "waiting",
          names: { "1": data.name || "Player 1", "2": "Player 2" },
          questions: shuffle(questions).slice(0, 8),
          round: 0,
          answers: {},
          scores: { "1": 0, "2": 0 },
          timer: null,
        },
      };
      ws.roomCode = code;
      ws.playerNum = "1";
      ws.send(JSON.stringify({ type: "room_created", code, playerNum: "1", name: data.name }));
    }

    else if (data.type === "join_room") {
      const code = (data.code || "").toUpperCase().trim();
      const room = rooms[code];
      if (!room) return ws.send(JSON.stringify({ type: "error", msg: "Room tidak ditemukan! Cek kode lagi 👀" }));
      if (room.players["2"]) return ws.send(JSON.stringify({ type: "error", msg: "Room sudah penuh! 😅" }));

      room.players["2"] = ws;
      room.state.names["2"] = data.name || "Player 2";
      ws.roomCode = code;
      ws.playerNum = "2";

      ws.send(JSON.stringify({ type: "joined", code, playerNum: "2", name: data.name, opponentName: room.state.names["1"] }));
      broadcast(room, { type: "both_joined", names: room.state.names });
    }

    else if (data.type === "start_game") {
      const room = rooms[ws.roomCode];
      if (!room || ws.playerNum !== "1") return;
      room.state.phase = "playing";
      startRound(room);
    }

    else if (data.type === "answer") {
      const room = rooms[ws.roomCode];
      if (!room || room.state.phase !== "playing") return;
      const pNum = ws.playerNum;
      if (room.state.answers[pNum]) return; // already answered
      room.state.answers[pNum] = data.choice; // "A" or "B"

      // notify both that this player answered
      broadcast(room, { type: "player_answered", player: pNum });

      // if both answered, reveal immediately
      if (room.state.answers["1"] && room.state.answers["2"]) {
        clearTimeout(room.state.timer);
        setTimeout(() => revealAnswers(room), 600);
      }
    }

    else if (data.type === "next_round") {
      const room = rooms[ws.roomCode];
      if (!room || ws.playerNum !== "1") return;
      nextRound(room);
    }

    else if (data.type === "restart") {
      const room = rooms[ws.roomCode];
      if (!room || ws.playerNum !== "1") return;
      room.state.questions = shuffle(questions).slice(0, 8);
      room.state.round = 0;
      room.state.scores = { "1": 0, "2": 0 };
      room.state.answers = {};
      room.state.phase = "playing";
      startRound(room);
    }
  });

  ws.on("close", () => {
    if (!ws.roomCode || !rooms[ws.roomCode]) return;
    const room = rooms[ws.roomCode];
    clearTimeout(room.state.timer);
    broadcast(room, { type: "player_left", player: ws.playerNum });
    // cleanup room after 30s
    setTimeout(() => { delete rooms[ws.roomCode]; }, 30000);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🎮 Game server running on port ${PORT}`));
