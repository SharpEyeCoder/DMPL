import { createClient } from "@libsql/client";
import crypto from "node:crypto";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      profile_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS player_stats (
      user_id TEXT PRIMARY KEY,
      matches_played INTEGER DEFAULT 0,
      runs_scored INTEGER DEFAULT 0,
      balls_faced INTEGER DEFAULT 0,
      highest_score INTEGER DEFAULT 0,
      wickets_taken INTEGER DEFAULT 0,
      runs_conceded INTEGER DEFAULT 0,
      balls_bowled INTEGER DEFAULT 0,
      best_bowling_wickets INTEGER DEFAULT 0,
      best_bowling_runs INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
}

// Initialize tables on startup
initDb().catch(console.error);

export async function findOrCreateUserByGoogleId(googleId, email) {
  let result = await db.execute({
    sql: "SELECT * FROM users WHERE google_id = ?",
    args: [googleId]
  });

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  const userId = crypto.randomUUID();
  await db.execute({
    sql: "INSERT INTO users (id, google_id, email) VALUES (?, ?, ?)",
    args: [userId, googleId, email]
  });

  // Initialize stats row
  await db.execute({
    sql: "INSERT INTO player_stats (user_id) VALUES (?)",
    args: [userId]
  });

  result = await db.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [userId]
  });
  return result.rows[0];
}

export async function getUserById(userId) {
  const result = await db.execute({
    sql: `
      SELECT u.id, u.profile_name, u.email,
             s.matches_played, s.runs_scored, s.balls_faced, s.highest_score,
             s.wickets_taken, s.runs_conceded, s.balls_bowled, s.best_bowling_wickets, s.best_bowling_runs
      FROM users u
      LEFT JOIN player_stats s ON u.id = s.user_id
      WHERE u.id = ?
    `,
    args: [userId]
  });
  return result.rows[0];
}

export async function setProfileName(userId, name) {
  await db.execute({
    sql: "UPDATE users SET profile_name = ? WHERE id = ?",
    args: [name, userId]
  });
}

export async function createSession(userId) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  // 30 days from now
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  
  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    args: [sessionId, userId, expiresAt]
  });
  
  return sessionId;
}

export async function getSession(sessionId) {
  const result = await db.execute({
    sql: "SELECT * FROM sessions WHERE id = ? AND expires_at > CURRENT_TIMESTAMP",
    args: [sessionId]
  });
  return result.rows[0];
}

export async function destroySession(sessionId) {
  await db.execute({
    sql: "DELETE FROM sessions WHERE id = ?",
    args: [sessionId]
  });
}

export async function updatePlayerStats(userId, { runsScored, ballsFaced, wicketsTaken, runsConceded, ballsBowled }) {
  const current = await db.execute({
    sql: "SELECT * FROM player_stats WHERE user_id = ?",
    args: [userId]
  });

  if (current.rows.length === 0) return;
  const stats = current.rows[0];

  const newRunsScored = Number(stats.runs_scored) + runsScored;
  const newBallsFaced = Number(stats.balls_faced) + ballsFaced;
  const newHighestScore = Math.max(Number(stats.highest_score), runsScored);
  
  const newWicketsTaken = Number(stats.wickets_taken) + wicketsTaken;
  const newRunsConceded = Number(stats.runs_conceded) + runsConceded;
  const newBallsBowled = Number(stats.balls_bowled) + ballsBowled;
  const newMatchesPlayed = Number(stats.matches_played) + 1;

  // Best bowling figures:
  // Usually sorted by wickets (higher is better), then runs (lower is better).
  let newBestWickets = Number(stats.best_bowling_wickets);
  let newBestRuns = Number(stats.best_bowling_runs);
  
  if (wicketsTaken > newBestWickets || (wicketsTaken === newBestWickets && runsConceded < newBestRuns)) {
    newBestWickets = wicketsTaken;
    newBestRuns = runsConceded;
  }
  // Initialize best bowling runs if it's the first time taking wickets and previous was 0 runs/0 wickets (but actually 0/0 is default, so it would overwrite correctly if wickets are same but runs conceded are higher? Wait.
  // If stats.best_bowling_runs is 0, and we take 0 wickets but concede 10 runs. 
  // It shouldn't update. `wicketsTaken (0) === newBestWickets (0)` AND `runsConceded (10) < newBestRuns (0)` is FALSE. 
  // So it keeps 0/0. Correct.

  await db.execute({
    sql: `
      UPDATE player_stats SET
        matches_played = ?,
        runs_scored = ?,
        balls_faced = ?,
        highest_score = ?,
        wickets_taken = ?,
        runs_conceded = ?,
        balls_bowled = ?,
        best_bowling_wickets = ?,
        best_bowling_runs = ?
      WHERE user_id = ?
    `,
    args: [
      newMatchesPlayed, newRunsScored, newBallsFaced, newHighestScore,
      newWicketsTaken, newRunsConceded, newBallsBowled,
      newBestWickets, newBestRuns, userId
    ]
  });
}
