'use strict';

const fs = require('fs');
const path = require('path');
const { db } = require('../db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 30;

// Every table this app owns. Kept as a plain list (rather than introspected
// from sqlite_master) so a backup is explicit about what it does and doesn't
// cover — a new table needs a one-line addition here, same as a migration.
const TABLES = [
  'users', 'shifts', 'swaps', 'reports', 'documents', 'document_access',
  'messages', 'announcements', 'network_diagrams', 'schema_meta'
];

// A logical (row-level) dump rather than a raw file copy — this is what lets
// the same backup code work whether the database is a local file (dev) or a
// remote Turso database (production on Render, where there's no local file
// to copy in the first place). Written as plain JSON: restorable by hand if
// it's ever actually needed, and directly readable in Drive (see
// lib/drive-backup.js) rather than an opaque blob.
async function backupDatabase() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dump = {};
  for (const table of TABLES) {
    const res = await db.execute(`SELECT * FROM ${table}`);
    dump[table] = res.rows;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `baton-${stamp}.json`);
  fs.writeFileSync(dest, JSON.stringify(dump));
  pruneOldBackups();
  return dest;
}

function pruneOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('baton-') && f.endsWith('.json'))
    .sort();
  while (files.length > MAX_BACKUPS) {
    fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
  }
}

function latestBackupPath() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('baton-') && f.endsWith('.json'))
    .sort();
  return files.length ? path.join(BACKUP_DIR, files[files.length - 1]) : null;
}

module.exports = { backupDatabase, latestBackupPath, BACKUP_DIR };
