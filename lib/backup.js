'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 30;

// Uses better-sqlite3's own backup API rather than copying the file directly —
// a plain fs copy of a live WAL-mode database can catch a write mid-flight,
// db.backup() takes a consistent snapshot safely while the app keeps running.
async function backupDatabase() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `baton-${stamp}.db`);
  await db.backup(dest);
  pruneOldBackups();
  return dest;
}

function pruneOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('baton-') && f.endsWith('.db'))
    .sort();
  while (files.length > MAX_BACKUPS) {
    fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
  }
}

function latestBackupPath() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('baton-') && f.endsWith('.db'))
    .sort();
  return files.length ? path.join(BACKUP_DIR, files[files.length - 1]) : null;
}

module.exports = { backupDatabase, latestBackupPath, BACKUP_DIR };
