'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'baton.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
    active INTEGER NOT NULL DEFAULT 1,
    avatar_emoji TEXT NOT NULL DEFAULT '🧑',
    bio TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('D', 'E', 'N')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_shifts_user_start ON shifts(user_id, start_at);
  CREATE INDEX IF NOT EXISTS idx_shifts_start ON shifts(start_at);

  CREATE TABLE IF NOT EXISTS swaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_swaps_requester ON swaps(requester_id, status);
  CREATE INDEX IF NOT EXISTS idx_swaps_target ON swaps(target_id, status);

  -- Mandatory handover report: one per shift. Submitting it is the only way
  -- a shift's status can become 'closed' (the gate lives in models/reports.js).
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL UNIQUE REFERENCES shifts(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    what_done TEXT NOT NULL DEFAULT '',
    unfinished TEXT NOT NULL DEFAULT '',
    open_items TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_reports_author ON reports(author_id);

  -- visibility: 'shift' = private handover note, only the author, the operator
  -- holding the chronologically next shift, and leads can see it; 'team' =
  -- whole SOC team; 'published' = same as team but locked from further edits;
  -- 'restricted' = author + leads + an explicit per-document allow-list
  -- (see document_access below, created after the migration further down —
  -- it must come after, since renaming this table mid-migration would
  -- otherwise drag any earlier-created foreign key along with it).
  CREATE TABLE IF NOT EXISTS documents (
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
  );

  CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
  CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility);
`);

// --- Migrations for tables that already existed before a given feature ---
// (CREATE TABLE IF NOT EXISTS above is a no-op once the table already exists,
// so new columns/constraints on existing tables need to be added explicitly.)

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

if (!columnExists('users', 'avatar_emoji')) {
  db.exec("ALTER TABLE users ADD COLUMN avatar_emoji TEXT NOT NULL DEFAULT '🧑'");
}
if (!columnExists('users', 'bio')) {
  db.exec("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
}

// SQLite can't alter a CHECK constraint in place — rebuild the table if
// 'restricted' isn't already an allowed visibility value. This must run
// before any table gets a foreign key pointing at `documents`: SQLite's
// ALTER TABLE RENAME rewrites other tables' FK references to follow the
// renamed table, so a FK created beforehand would end up dangling once
// documents_old is dropped.
const documentsTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'").get();
if (documentsTableSql && !documentsTableSql.sql.includes('restricted')) {
  db.exec(`
    ALTER TABLE documents RENAME TO documents_old;

    CREATE TABLE documents (
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
    );

    INSERT INTO documents SELECT * FROM documents_old;
    DROP TABLE documents_old;

    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
    CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility);
  `);
}

// One-time repair: an earlier version of this migration created
// document_access (FK -> documents) *before* the rename above, so its FK
// got dragged onto documents_old and left dangling once that was dropped.
// Drop and let the block below recreate it correctly if that happened.
if (tableExists('document_access')) {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name='document_access'").get().sql;
  if (sql.includes('documents_old')) {
    db.exec('DROP TABLE document_access');
  }
}

db.exec(`
  -- Explicit per-user allow-list for visibility='restricted' documents.
  -- Created after the documents-table migration above — see the comment there.
  CREATE TABLE IF NOT EXISTS document_access (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, user_id)
  );

  -- recipient_id NULL = team channel (visible to everyone); set = a private
  -- direct message, visible only to author_id and recipient_id.
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
`);

if (!columnExists('messages', 'recipient_id')) {
  db.exec('ALTER TABLE messages ADD COLUMN recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(author_id, recipient_id)');
}

module.exports = db;
