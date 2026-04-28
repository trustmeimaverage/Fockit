'use strict';

// In-memory store of all active game sessions
const games = new Map();

// Generate a unique 6-char alphanumeric PIN
function generatePin() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pin;
  do {
    pin = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (games.has(pin));
  return pin;
}

function createGame(gameName, questions) {
  const pin = generatePin();
  const game = {
    pin,
    gameName,
    questions,
    state: 'LOBBY',        // LOBBY | STARTING | QUESTION_ACTIVE | QUESTION_RESULTS | GAME_END
    players: [],           // [{ socketId, nickname, connected }]
    scores: {},            // { nickname: number }
    answers: {},           // { questionIndex: { nickname: { answerIndex, submittedAt } } }
    hostSocketId: null,
    hostTimeout: null,     // reconnection timeout
    questionTimeout: null, // auto-end timer
    advanceTimeout: null,  // auto-advance after results
    currentQuestionIndex: 0,
    questionEndsAt: null,
    createdAt: Date.now(),
  };
  games.set(pin, game);
  return game;
}

function getGame(pin) {
  return games.get(pin) || null;
}

function deleteGame(pin) {
  const game = games.get(pin);
  if (game) {
    if (game.hostTimeout) clearTimeout(game.hostTimeout);
    if (game.questionTimeout) clearTimeout(game.questionTimeout);
    if (game.advanceTimeout) clearTimeout(game.advanceTimeout);
  }
  games.delete(pin);
}

function setHostSocket(pin, socketId) {
  const g = games.get(pin);
  if (g) g.hostSocketId = socketId;
}

function setState(pin, state) {
  const g = games.get(pin);
  if (g) g.state = state;
}

function setCurrentQuestion(pin, index, endsAt) {
  const g = games.get(pin);
  if (!g) return;
  g.currentQuestionIndex = index;
  g.questionEndsAt = endsAt;
  if (!g.answers[index]) g.answers[index] = {};
}

function addPlayer(pin, socketId, nickname) {
  const g = games.get(pin);
  if (!g) return null;
  const player = { socketId, nickname, connected: true };
  g.players.push(player);
  g.scores[nickname] = 0;
  return player;
}

function getActivePlayers(pin) {
  const g = games.get(pin);
  if (!g) return [];
  return g.players.filter(p => p.connected).map(p => ({ nickname: p.nickname }));
}

function isNicknameTaken(pin, nickname) {
  const g = games.get(pin);
  if (!g) return false;
  return g.players.some(p => p.nickname.toLowerCase() === nickname.toLowerCase() && p.connected);
}

function markPlayerDisconnected(pin, nickname) {
  const g = games.get(pin);
  if (!g) return;
  const p = g.players.find(p => p.nickname === nickname);
  if (p) p.connected = false;
}

function reconnectPlayer(pin, nickname, newSocketId) {
  const g = games.get(pin);
  if (!g) return false;
  const p = g.players.find(p => p.nickname === nickname && !p.connected);
  if (p) {
    p.connected = true;
    p.socketId = newSocketId;
    return true;
  }
  return false;
}

function removePlayerIfDisconnected(pin, nickname) {
  const g = games.get(pin);
  if (!g) return;
  const p = g.players.find(p => p.nickname === nickname);
  if (p && !p.connected) {
    g.players = g.players.filter(pl => pl.nickname !== nickname);
    delete g.scores[nickname];
  }
}

function submitAnswer(pin, nickname, answerIndex, submittedAt) {
  const g = games.get(pin);
  if (!g) return false;
  const qIdx = g.currentQuestionIndex;
  if (!g.answers[qIdx]) g.answers[qIdx] = {};
  if (g.answers[qIdx][nickname]) return false; // already answered
  g.answers[qIdx][nickname] = { answerIndex, submittedAt };
  return true;
}

function getAnswerCount(pin) {
  const g = games.get(pin);
  if (!g) return 0;
  return Object.keys(g.answers[g.currentQuestionIndex] || {}).length;
}

function getAnswerDistribution(pin, questionIndex) {
  const g = games.get(pin);
  if (!g) return [];
  const q = g.questions[questionIndex];
  const count = q.type === 'truefalse' ? 2 : 4;
  const dist = Array(count).fill(0);
  for (const { answerIndex } of Object.values(g.answers[questionIndex] || {})) {
    if (answerIndex >= 0 && answerIndex < count) dist[answerIndex]++;
  }
  return dist;
}

function calculateAndApplyScores(pin, questionIndex) {
  const g = games.get(pin);
  if (!g) return {};
  const q = g.questions[questionIndex];
  const endsAt = g.questionEndsAt;
  const totalMs = q.timer * 1000;
  const correctIdx = q.type === 'truefalse' ? (q.correct ? 0 : 1) : q.correctIndex;

  for (const [nickname, { answerIndex, submittedAt }] of Object.entries(g.answers[questionIndex] || {})) {
    if (answerIndex === correctIdx) {
      const remaining = Math.max(0, endsAt - submittedAt);
      const pts = Math.round(1000 * (remaining / totalMs));
      g.scores[nickname] = (g.scores[nickname] || 0) + pts;
    }
  }
  return { ...g.scores };
}

function getCorrectAnswer(pin, questionIndex) {
  const g = games.get(pin);
  if (!g) return null;
  const q = g.questions[questionIndex];
  if (q.type === 'truefalse') {
    return { index: q.correct ? 0 : 1, text: q.correct ? 'True' : 'False' };
  }
  return { index: q.correctIndex, text: q.options[q.correctIndex] };
}

function getLeaderboard(pin) {
  const g = games.get(pin);
  if (!g) return [];
  return Object.entries(g.scores)
    .map(([nickname, score]) => ({ nickname, score }))
    .sort((a, b) => b.score - a.score);
}

function setHostTimeout(pin, timeout) {
  const g = games.get(pin);
  if (g) g.hostTimeout = timeout;
}

function clearHostTimeout(pin) {
  const g = games.get(pin);
  if (g && g.hostTimeout) {
    clearTimeout(g.hostTimeout);
    g.hostTimeout = null;
  }
}

function setQuestionTimeout(pin, timeout) {
  const g = games.get(pin);
  if (!g) return;
  if (g.questionTimeout) clearTimeout(g.questionTimeout);
  g.questionTimeout = timeout;
}

function setAdvanceTimeout(pin, timeout) {
  const g = games.get(pin);
  if (!g) return;
  if (g.advanceTimeout) clearTimeout(g.advanceTimeout);
  g.advanceTimeout = timeout;
}

function clearAdvanceTimeout(pin) {
  const g = games.get(pin);
  if (g && g.advanceTimeout) {
    clearTimeout(g.advanceTimeout);
    g.advanceTimeout = null;
  }
}

function resetGame(pin) {
  const g = games.get(pin);
  if (!g) return;
  if (g.questionTimeout) clearTimeout(g.questionTimeout);
  if (g.advanceTimeout) clearTimeout(g.advanceTimeout);
  g.state = 'LOBBY';
  g.currentQuestionIndex = 0;
  g.questionEndsAt = null;
  g.answers = {};
  g.scores = {};
  g.questionTimeout = null;
  g.advanceTimeout = null;
  // Keep only connected players
  g.players = g.players.filter(p => p.connected);
  for (const p of g.players) g.scores[p.nickname] = 0;
}

module.exports = {
  createGame, getGame, deleteGame,
  setHostSocket, setState, setCurrentQuestion,
  addPlayer, getActivePlayers, isNicknameTaken,
  markPlayerDisconnected, reconnectPlayer, removePlayerIfDisconnected,
  submitAnswer, getAnswerCount, getAnswerDistribution,
  calculateAndApplyScores, getCorrectAnswer, getLeaderboard,
  setHostTimeout, clearHostTimeout,
  setQuestionTimeout, setAdvanceTimeout, clearAdvanceTimeout,
  resetGame,
};
