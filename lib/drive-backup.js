'use strict';

const fs = require('fs');
const path = require('path');
const { get, all, getMeta, setMeta } = require('../db');
const { isConfigured, getDriveClient } = require('./google-drive');
const { latestBackupPath } = require('./backup');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const EXPORT_DIR = path.join(DATA_DIR, 'drive-export');
const ROOT_FOLDER_NAME = 'SOCGrid Backups';
const DOCS_FOLDER_NAME = 'documents';

function isDriveConfigured() {
  return isConfigured();
}

// Finds the folder by its cached id (verifying it still exists — it may have
// been deleted from Drive by someone), or creates it and caches the new id.
async function getOrCreateFolder(drive, metaKey, name, parentId) {
  const cachedId = await getMeta(metaKey);
  if (cachedId) {
    try {
      const res = await drive.files.get({ fileId: cachedId, fields: 'id, trashed' });
      if (res.data && !res.data.trashed) return cachedId;
    } catch (_) {
      // fell through the cache miss (deleted, or id no longer valid) — recreate below
    }
  }
  const fileMetadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : undefined
  };
  const res = await drive.files.create({ requestBody: fileMetadata, fields: 'id' });
  await setMeta(metaKey, res.data.id);
  return res.data.id;
}

// Uploads localPath as `name` inside folderId, updating an existing file of
// the same name in place (so re-running backups doesn't pile up duplicates —
// Drive keeps its own revision history on files.update automatically).
async function upsertFile(drive, folderId, name, localPath, mimeType) {
  const existing = await drive.files.list({
    q: `'${folderId}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id)'
  });
  const media = { mimeType, body: fs.createReadStream(localPath) };
  if (existing.data.files.length) {
    await drive.files.update({ fileId: existing.data.files[0].id, media });
  } else {
    await drive.files.create({
      requestBody: { name, parents: [folderId] },
      media,
      fields: 'id'
    });
  }
}

function slugify(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
}

async function exportDocumentsToDisk() {
  fs.rmSync(EXPORT_DIR, { recursive: true, force: true });
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const docs = await all(`
    SELECT d.*, u.display_name AS author_name
    FROM documents d JOIN users u ON u.id = d.author_id
    WHERE d.is_template = 0
    ORDER BY d.id
  `);

  const files = [];
  docs.forEach((doc) => {
    const fileName = `${doc.id}-${slugify(doc.title)}.md`;
    const frontmatter = [
      '---',
      `title: ${doc.title.replace(/\n/g, ' ')}`,
      `type: ${doc.type}`,
      `visibility: ${doc.visibility}`,
      `tags: ${doc.tags || ''}`,
      `author: ${doc.author_name}`,
      `created_at: ${doc.created_at}`,
      `updated_at: ${doc.updated_at}`,
      '---',
      ''
    ].join('\n');
    const localPath = path.join(EXPORT_DIR, fileName);
    fs.writeFileSync(localPath, frontmatter + doc.content);
    files.push({ name: fileName, localPath });
  });
  return files;
}

// Full backup run: DB snapshot (see lib/backup.js — a row-level JSON dump,
// not a file copy, since there's no local file at all once TURSO_DATABASE_URL
// points at a remote database) + all documents as readable markdown, both
// mirrored into a Drive folder. Safe to call repeatedly (idempotent — same
// filenames get updated in place, not duplicated).
async function runDriveBackup() {
  if (!isConfigured()) {
    throw new Error('Google Drive is not connected — run scripts/google-auth-setup.js first.');
  }
  const drive = getDriveClient();
  const rootId = await getOrCreateFolder(drive, 'drive_backup_folder_id', ROOT_FOLDER_NAME, null);
  const docsFolderId = await getOrCreateFolder(drive, 'drive_documents_folder_id', DOCS_FOLDER_NAME, rootId);

  const files = await exportDocumentsToDisk();
  for (const f of files) {
    await upsertFile(drive, docsFolderId, f.name, f.localPath, 'text/markdown');
  }
  fs.rmSync(EXPORT_DIR, { recursive: true, force: true });

  const dbBackupPath = latestBackupPath();
  if (dbBackupPath) {
    await upsertFile(drive, rootId, 'database-latest.json', dbBackupPath, 'application/json');
  }

  const result = { time: new Date().toISOString(), documentCount: files.length, ok: true };
  await setMeta('last_drive_backup', JSON.stringify(result));
  return result;
}

async function lastDriveBackup() {
  const raw = await getMeta('last_drive_backup');
  return raw ? JSON.parse(raw) : null;
}

module.exports = { runDriveBackup, isDriveConfigured, lastDriveBackup };
