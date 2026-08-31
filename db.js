'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// TURSO_DATABASE_URL unset -> a plain local SQLite file (same default as
// before), so local dev needs no cloud account. Set TURSO_DATABASE_URL (+
// TURSO_AUTH_TOKEN) in production to point at a Turso cloud database instead
// — same code path either way, libSQL speaks the same wire protocol to both.
// See README.md "Turso (cloud SQLite) setup" for the production side.
const DB_URL = process.env.TURSO_DATABASE_URL || `file:${path.join(DATA_DIR, 'baton.db')}`;

const db = createClient({
  url: DB_URL,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined
});

// One statement per db.execute() call, run in sequence — deliberately not
// db.executeMultiple() with a semicolon-separated block. That worked fine
// locally (the embedded engine does real SQL tokenization), but against a
// remote Turso database it 400'd consistently: its statement-splitter isn't
// comment-aware, and this schema's explanatory `-- ...` comments include a
// semicolon inside a comment (a legal SQL comment, but a false statement
// boundary to a naive splitter). Running each statement on its own sidesteps
// that entirely, on either backend.
async function execAll(statements) {
  for (const sql of statements) {
    await db.execute(sql);
  }
}

async function columnExists(table, column) {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  return info.rows.some((c) => c.name === column);
}

async function tableExists(name) {
  const res = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    args: [name]
  });
  return res.rows.length > 0;
}

// Thin helpers mirroring better-sqlite3's db.prepare(sql).get/all/run shape,
// so model files stay close to their original form — just `async`/`await`
// added around calls, rather than rewritten around {sql, args} objects.
async function get(sql, ...args) {
  const res = await db.execute({ sql, args });
  return res.rows[0];
}
async function all(sql, ...args) {
  const res = await db.execute({ sql, args });
  return res.rows;
}
async function run(sql, ...args) {
  const res = await db.execute({ sql, args });
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.rowsAffected };
}

async function getMeta(key) {
  const res = await db.execute({ sql: 'SELECT value FROM schema_meta WHERE key = ?', args: [key] });
  return res.rows[0]?.value ?? null;
}
async function setMeta(key, value) {
  await db.execute({
    sql: 'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    args: [key, value]
  });
}

async function init() {
  await execAll([
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
      active INTEGER NOT NULL DEFAULT 1,
      avatar_emoji TEXT NOT NULL DEFAULT '🧑',
      bio TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('D', 'E', 'N')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_shifts_user_start ON shifts(user_id, start_at)',
    'CREATE INDEX IF NOT EXISTS idx_shifts_start ON shifts(start_at)',

    `CREATE TABLE IF NOT EXISTS swaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS idx_swaps_requester ON swaps(requester_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_swaps_target ON swaps(target_id, status)',

    // Mandatory handover report: one per shift. Submitting it is the only way
    // a shift's status can become 'closed' (the gate lives in models/reports.js).
    `CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL UNIQUE REFERENCES shifts(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      what_done TEXT NOT NULL DEFAULT '',
      unfinished TEXT NOT NULL DEFAULT '',
      open_items TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_reports_author ON reports(author_id)',

    // visibility: 'shift' = private handover note, only the author, the operator
    // holding the chronologically next shift, and leads can see it; 'team' =
    // whole SOC team; 'published' = same as team but locked from further edits;
    // 'restricted' = author + leads + an explicit per-document allow-list
    // (see document_access below, created after the migration further down —
    // it must come after, since renaming this table mid-migration would
    // otherwise drag any earlier-created foreign key along with it).
    `CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'team' CHECK (visibility IN ('shift', 'team', 'published')),
      is_template INTEGER NOT NULL DEFAULT 0,
      shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type)',
    'CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility)'
  ]);

  // --- Migrations for tables that already existed before a given feature ---
  // (CREATE TABLE IF NOT EXISTS above is a no-op once the table already exists,
  // so new columns/constraints on existing tables need to be added explicitly.)

  if (!(await columnExists('users', 'avatar_emoji'))) {
    await db.execute("ALTER TABLE users ADD COLUMN avatar_emoji TEXT NOT NULL DEFAULT '🧑'");
  }
  if (!(await columnExists('users', 'bio'))) {
    await db.execute("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
  }

  // SQLite can't alter a CHECK constraint in place — rebuild the table if
  // 'restricted' isn't already an allowed visibility value. This must run
  // before any table gets a foreign key pointing at `documents`: SQLite's
  // ALTER TABLE RENAME rewrites other tables' FK references to follow the
  // renamed table, so a FK created beforehand would end up dangling once
  // documents_old is dropped.
  const documentsTableSql = await db.execute({
    sql: "SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'",
    args: []
  });
  const docsSql = documentsTableSql.rows[0]?.sql;
  if (docsSql && !docsSql.includes('restricted')) {
    await execAll([
      'ALTER TABLE documents RENAME TO documents_old',
      `CREATE TABLE documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        visibility TEXT NOT NULL DEFAULT 'team' CHECK (visibility IN ('shift', 'team', 'published', 'restricted')),
        is_template INTEGER NOT NULL DEFAULT 0,
        shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
        author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      'INSERT INTO documents SELECT * FROM documents_old',
      'DROP TABLE documents_old',
      'CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type)',
      'CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility)'
    ]);
  }

  // One-time repair: an earlier version of this migration created
  // document_access (FK -> documents) *before* the rename above, so its FK
  // got dragged onto documents_old and left dangling once that was dropped.
  // Drop and let the block below recreate it correctly if that happened.
  if (await tableExists('document_access')) {
    const sqlRes = await db.execute({
      sql: "SELECT sql FROM sqlite_master WHERE name='document_access'",
      args: []
    });
    if (sqlRes.rows[0]?.sql.includes('documents_old')) {
      await db.execute('DROP TABLE document_access');
    }
  }

  await execAll([
    // Explicit per-user allow-list for visibility='restricted' documents.
    // Created after the documents-table migration above — see the comment there.
    `CREATE TABLE IF NOT EXISTS document_access (
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (document_id, user_id)
    )`,

    // recipient_id NULL = team channel (visible to everyone); set = a private
    // direct message, visible only to author_id and recipient_id.
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)',

    // Broadcast announcements: lead-only, shown to everyone on the dashboard
    // as a one-shot typewriter effect, not a persistent banner.
    `CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    // Network topology diagrams (Drawflow canvases). "data" is Drawflow's own
    // exported JSON blob, stored opaque — the app never inspects its shape.
    // Team-shared and team-editable, same trust level as chat.
    `CREATE TABLE IF NOT EXISTS network_diagrams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    'CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)'
  ]);

  if (!(await columnExists('messages', 'recipient_id'))) {
    await db.execute('ALTER TABLE messages ADD COLUMN recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(author_id, recipient_id)');
  }

  // One-time correction: N shifts were originally stored same-day (grid label
  // "July 2" -> real 01:00-09:00 on July 2). The correct convention is that N
  // runs the *following* day (grid label "July 2" -> real 01:00-09:00 on July
  // 3, picking up exactly where that day's E shift ends). Every existing
  // N-type row predates the fix in lib/shift-times.js, so it needs its
  // start_at/end_at pushed forward by exactly one day to match. Computed in
  // JS (not SQL datetime()) to keep the exact same ISO string format the
  // rest of the app expects.
  if (!(await getMeta('n_shift_next_day_fix'))) {
    const nRows = (await db.execute("SELECT id, start_at, end_at FROM shifts WHERE type = 'N'")).rows;
    if (nRows.length) {
      const tx = await db.transaction('write');
      try {
        for (const r of nRows) {
          const newStart = new Date(new Date(r.start_at).getTime() + 86400000).toISOString();
          const newEnd = new Date(new Date(r.end_at).getTime() + 86400000).toISOString();
          await tx.execute({ sql: 'UPDATE shifts SET start_at = ?, end_at = ? WHERE id = ?', args: [newStart, newEnd, r.id] });
        }
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    }
    await setMeta('n_shift_next_day_fix', String(nRows.length));
  }
}

// A brand-new remote Turso database can return a transient error on the very
// first request or two (it isn't necessarily "warm" yet) — retrying the
// whole init is safe because every step in it is idempotent (IF NOT EXISTS /
// columnExists / getMeta guards), so a partially-completed attempt just
// picks up where it left off rather than redoing or duplicating anything.
async function initWithRetry(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await init();
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.error(`[SOCGrid] DB init attempt ${attempt}/${maxAttempts} failed (${err.message}) — retrying...`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

module.exports = { db, ready: initWithRetry(), get, all, run, getMeta, setMeta };
