'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.PGHOST     || 'localhost',
  port:     parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'fockit',
  user:     process.env.PGUSER     || 'fockit',
  password: process.env.PGPASSWORD || 'fockit',
});

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS games (
    id          SERIAL PRIMARY KEY,
    pin         VARCHAR(8)   NOT NULL,
    game_name   TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ended_at    TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS game_questions (
    id              SERIAL PRIMARY KEY,
    game_id         INTEGER      NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    question_index  INTEGER      NOT NULL,
    type            VARCHAR(16)  NOT NULL,
    question        TEXT         NOT NULL,
    options         JSONB,
    correct_index   INTEGER,
    correct         BOOLEAN,
    timer           INTEGER      NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_players (
    id          SERIAL PRIMARY KEY,
    game_id     INTEGER  NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    nickname    TEXT     NOT NULL,
    score       INTEGER  NOT NULL DEFAULT 0,
    rank        INTEGER  NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

async function initDb() {
  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query(SCHEMA);
      console.log('✅  PostgreSQL connected and schema ready');
      return;
    } catch (err) {
      retries--;
      if (retries === 0) {
        console.error('❌  PostgreSQL connection failed:', err.message);
        console.error('    The app will run but game results will NOT be persisted.');
        return;
      }
      console.log(`⏳  Waiting for PostgreSQL... (${retries} retries left)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/**
 * Persist a completed game session to the database.
 * Called once at game end. Non-fatal on failure.
 */
async function saveCompletedGame(game, leaderboard) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert game row
    const gameRes = await client.query(
      `INSERT INTO games (pin, game_name, ended_at)
       VALUES ($1, $2, NOW())
       RETURNING id`,
      [game.pin, game.gameName]
    );
    const gameId = gameRes.rows[0].id;

    // Insert questions
    for (let i = 0; i < game.questions.length; i++) {
      const q = game.questions[i];
      await client.query(
        `INSERT INTO game_questions
           (game_id, question_index, type, question, options, correct_index, correct, timer)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          gameId, i, q.type, q.question,
          q.type === 'quiz' ? JSON.stringify(q.options) : null,
          q.type === 'quiz' ? q.correctIndex : null,
          q.type === 'truefalse' ? q.correct : null,
          q.timer,
        ]
      );
    }

    // Insert players / leaderboard
    for (let i = 0; i < leaderboard.length; i++) {
      const { nickname, score } = leaderboard[i];
      await client.query(
        `INSERT INTO game_players (game_id, nickname, score, rank)
         VALUES ($1, $2, $3, $4)`,
        [gameId, nickname, score, i + 1]
      );
    }

    await client.query('COMMIT');
    console.log(`💾  Game ${game.pin} saved to database (id=${gameId})`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('⚠️   Failed to save game to database:', err.message);
  } finally {
    client.release();
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Return the N most recent completed games with their leaderboards. */
async function getRecentGames(limit = 20) {
  const res = await pool.query(
    `SELECT
       g.id, g.pin, g.game_name, g.ended_at,
       COUNT(DISTINCT gq.id)::int AS question_count,
       COUNT(DISTINCT gp.id)::int AS player_count
     FROM games g
     LEFT JOIN game_questions gq ON gq.game_id = g.id
     LEFT JOIN game_players   gp ON gp.game_id = g.id
     WHERE g.ended_at IS NOT NULL
     GROUP BY g.id
     ORDER BY g.ended_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

/** Return full details for a single game by DB id. */
async function getGameById(id) {
  const gameRes = await pool.query(
    `SELECT id, pin, game_name, ended_at FROM games WHERE id = $1`,
    [id]
  );
  if (gameRes.rows.length === 0) return null;
  const game = gameRes.rows[0];

  const questionsRes = await pool.query(
    `SELECT question_index, type, question, options, correct_index, correct, timer
     FROM game_questions WHERE game_id = $1 ORDER BY question_index`,
    [id]
  );

  const playersRes = await pool.query(
    `SELECT nickname, score, rank
     FROM game_players WHERE game_id = $1 ORDER BY rank`,
    [id]
  );

  return {
    ...game,
    questions: questionsRes.rows,
    leaderboard: playersRes.rows,
  };
}

module.exports = { initDb, saveCompletedGame, getRecentGames, getGameById };
