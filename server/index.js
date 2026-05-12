'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const gm = require('./gameManager');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 20000,
  pingInterval: 10000,
});

app.use(cors());
app.use(express.json());

// ─── REST API ────────────────────────────────────────────────────────────────

// Create a new game (called from CreatePage before socket join)
app.post('/api/games', (req, res) => {
  const { gameName, questions } = req.body;
  if (!gameName || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Invalid game data' });
  }
  const game = gm.createGame(gameName, questions);
  res.json({ pin: game.pin });
});

// Check if a PIN is valid (used by client before entering nickname)
app.get('/api/games/:pin', (req, res) => {
  const game = gm.getGame(req.params.pin.toUpperCase());
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.state !== 'LOBBY') return res.status(409).json({ error: 'Game already started' });
  res.json({ exists: true, gameName: game.gameName, playerCount: gm.getActivePlayers(game.pin).length });
});

// Game history (most recent completed games)
app.get('/api/history', async (req, res) => {
  try {
    const games = await db.getRecentGames(20);
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Full details for one completed game
app.get('/api/history/:id', async (req, res) => {
  try {
    const game = await db.getGameById(parseInt(req.params.id));
    if (!game) return res.status(404).json({ error: 'Not found' });
    res.json(game);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Serve built React app in production
const clientBuild = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuild));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

// ─── Socket.io ───────────────────────────────────────────────────────────────

io.on('connection', (socket) => {

  // ── HOST ──

  socket.on('host:join', ({ pin }, cb) => {
    pin = pin.toUpperCase();
    const game = gm.getGame(pin);
    if (!game) return cb?.({ success: false, error: 'Game not found' });

    socket.join(`game:${pin}`);
    socket.join(`host:${pin}`);
    socket.data.role = 'host';
    socket.data.pin = pin;
    gm.setHostSocket(pin, socket.id);
    gm.clearHostTimeout(pin);

    // If reconnecting mid-game, notify clients
    if (game.state !== 'LOBBY') {
      io.to(`game:${pin}`).emit('host:reconnected');
    }

    cb?.({
      success: true,
      state: game.state,
      gameName: game.gameName,
      players: gm.getActivePlayers(pin),
      currentQuestionIndex: game.currentQuestionIndex,
      totalQuestions: game.questions.length,
    });
  });

  socket.on('host:start', (_, cb) => {
    const { pin } = socket.data;
    const game = gm.getGame(pin);
    if (!game || game.hostSocketId !== socket.id) return;
    if (game.state !== 'LOBBY') return;
    if (gm.getActivePlayers(pin).length === 0) return;

    gm.setState(pin, 'STARTING');
    io.to(`game:${pin}`).emit('game:starting', { gameName: game.gameName });

    // Wait 6s (5s countdown + 1s buffer) then start Q0
    const t = setTimeout(() => startQuestion(pin, 0), 6000);
    gm.setQuestionTimeout(pin, t);
    cb?.({ success: true });
  });

  socket.on('host:next', () => {
    const { pin } = socket.data;
    const game = gm.getGame(pin);
    if (!game || game.hostSocketId !== socket.id) return;
    if (game.state !== 'QUESTION_RESULTS') return;

    gm.clearAdvanceTimeout(pin);
    const next = game.currentQuestionIndex + 1;
    if (next >= game.questions.length) {
      endGame(pin);
    } else {
      startQuestion(pin, next);
    }
  });

  socket.on('host:play_again', () => {
    const { pin } = socket.data;
    const game = gm.getGame(pin);
    if (!game || game.hostSocketId !== socket.id) return;

    gm.resetGame(pin);
    const players = gm.getActivePlayers(pin);
    io.to(`game:${pin}`).emit('lobby:reset', { players });
  });

  // ── CLIENT ──

  socket.on('game:join', ({ pin, nickname }, cb) => {
    pin = pin.toUpperCase();
    const game = gm.getGame(pin);
    if (!game) return cb?.({ success: false, error: 'Game not found' });
    if (game.state !== 'LOBBY') return cb?.({ success: false, error: 'Game already started' });
    if (!nickname || nickname.trim().length < 1 || nickname.trim().length > 20) {
      return cb?.({ success: false, error: 'Invalid nickname' });
    }
    const nick = nickname.trim();
    if (gm.isNicknameTaken(pin, nick)) {
      return cb?.({ success: false, error: 'Nickname already taken' });
    }

    gm.addPlayer(pin, socket.id, nick);
    socket.join(`game:${pin}`);
    socket.data.role = 'client';
    socket.data.pin = pin;
    socket.data.nickname = nick;

    const players = gm.getActivePlayers(pin);
    io.to(`game:${pin}`).emit('lobby:update', { players });

    cb?.({ success: true, gameName: game.gameName });
  });

  socket.on('answer:submit', ({ questionIndex, answerIndex }, cb) => {
    const { pin, nickname } = socket.data;
    const game = gm.getGame(pin);
    if (!game || game.state !== 'QUESTION_ACTIVE') {
      return cb?.({ accepted: false, error: 'Not accepting answers' });
    }
    if (game.currentQuestionIndex !== questionIndex) {
      return cb?.({ accepted: false, error: 'Wrong question' });
    }
    const now = Date.now();
    if (now > game.questionEndsAt) {
      return cb?.({ accepted: false, error: 'Time expired' });
    }

    const ok = gm.submitAnswer(pin, nickname, answerIndex, now);
    if (!ok) return cb?.({ accepted: false, error: 'Already answered' });

    cb?.({ accepted: true });

    // Push live update to host
    const dist = gm.getAnswerDistribution(pin, questionIndex);
    const count = gm.getAnswerCount(pin);
    io.to(`host:${pin}`).emit('host:answer_update', {
      answerCount: count,
      totalPlayers: game.players.filter(p => p.connected).length,
      distribution: dist,
    });
  });

  socket.on('game:leave', () => {
    handleClientDisconnect(socket);
  });

  // ── DISCONNECT ──

  socket.on('disconnect', () => {
    const { role, pin } = socket.data;
    if (!pin) return;

    if (role === 'host') {
      const game = gm.getGame(pin);
      if (!game) return;
      // Only pause if game is actively running
      if (['STARTING', 'QUESTION_ACTIVE', 'QUESTION_RESULTS'].includes(game.state)) {
        io.to(`game:${pin}`).emit('host:disconnected', { resumeIn: 60 });
        const t = setTimeout(() => {
          io.to(`game:${pin}`).emit('game:terminated');
          gm.deleteGame(pin);
        }, 60000);
        gm.setHostTimeout(pin, t);
      }
    } else if (role === 'client') {
      handleClientDisconnect(socket);
    }
  });
});

function handleClientDisconnect(socket) {
  const { pin, nickname } = socket.data;
  if (!pin || !nickname) return;
  gm.markPlayerDisconnected(pin, nickname);
  const players = gm.getActivePlayers(pin);
  io.to(`game:${pin}`).emit('lobby:update', { players });

  // Remove from session after 30s if not reconnected
  setTimeout(() => {
    gm.removePlayerIfDisconnected(pin, nickname);
    // refresh lobby if still in LOBBY state
    const game = gm.getGame(pin);
    if (game && game.state === 'LOBBY') {
      io.to(`game:${pin}`).emit('lobby:update', { players: gm.getActivePlayers(pin) });
    }
  }, 30000);
}

function startQuestion(pin, questionIndex) {
  const game = gm.getGame(pin);
  if (!game) return;

  const q = game.questions[questionIndex];
  const timerMs = q.timer * 1000;
  // Add 3s for first question (client intro animation), 0 for subsequent
  const bufferMs = questionIndex === 0 ? 3000 : 0;
  const endsAt = Date.now() + timerMs + bufferMs;

  gm.setState(pin, 'QUESTION_ACTIVE');
  gm.setCurrentQuestion(pin, questionIndex, endsAt);

  const payload = {
    questionIndex,
    totalQuestions: game.questions.length,
    type: q.type,
    question: q.question,
    timer: q.timer,
    endsAt,
    gameName: game.gameName,
  };
  if (q.type === 'quiz') payload.options = q.options;

  io.to(`game:${pin}`).emit('question:start', payload);

  // Auto-end question when server-side timer expires
  const t = setTimeout(() => endQuestion(pin, questionIndex), timerMs + bufferMs);
  gm.setQuestionTimeout(pin, t);
}

function endQuestion(pin, questionIndex) {
  const game = gm.getGame(pin);
  if (!game || game.state !== 'QUESTION_ACTIVE') return;
  if (game.currentQuestionIndex !== questionIndex) return;

  const scores = gm.calculateAndApplyScores(pin, questionIndex);
  const correct = gm.getCorrectAnswer(pin, questionIndex);
  const dist = gm.getAnswerDistribution(pin, questionIndex);

  gm.setState(pin, 'QUESTION_RESULTS');

  io.to(`game:${pin}`).emit('question:end', {
    questionIndex,
    type: game.questions[questionIndex].type,
    correctAnswer: correct.index,
    correctAnswerText: correct.text,
    answerStats: dist,
    scores,
    isLastQuestion: questionIndex === game.questions.length - 1,
  });

  // Auto-advance to next question after 8s (host can override with host:next)
  const next = questionIndex + 1;
  const t = setTimeout(() => {
    const g = gm.getGame(pin);
    if (!g || g.state !== 'QUESTION_RESULTS') return;
    if (next >= g.questions.length) {
      endGame(pin);
    } else {
      startQuestion(pin, next);
    }
  }, 8000);
  gm.setAdvanceTimeout(pin, t);
}

function endGame(pin) {
  const game = gm.getGame(pin);
  if (!game) return;
  gm.setState(pin, 'GAME_END');
  const leaderboard = gm.getLeaderboard(pin);
  io.to(`game:${pin}`).emit('game:end', { leaderboard });
  // Persist to PostgreSQL (non-blocking, non-fatal)
  db.saveCompletedGame(game, leaderboard).catch(() => {});
}

// ─── Start server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

db.initDb().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎮  Fockit! server running on http://localhost:${PORT}`);
    console.log(`📡  Accessible at http://<your-ip>:${PORT} on your local network\n`);

    // Announce via mDNS so clients can reach via fockit.local
    try {
      const Bonjour = require('bonjour-service');
      const bonjour = new Bonjour.Bonjour();
      bonjour.publish({ name: 'Fockit', type: 'http', port: PORT });
      console.log('✅  mDNS: fockit.local is live');
    } catch (e) {
      console.log('⚠️   mDNS unavailable (install bonjour-service or use IP directly)');
    }
  });
});
