'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TOKEN_PATH = path.join(DATA_DIR, 'google-token.json');

// drive.file: the app can only see/manage files *it* creates (the backup
// folder and what goes in it) — never the rest of the connected account's
// Drive. Least privilege for an unattended backup job.
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && fs.existsSync(TOKEN_PATH));
}

function buildOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in .env — see scripts/google-auth-setup.js');
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
}

function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
}

function saveToken(token) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

// Authenticated Drive client, ready to use. Throws with a clear message if
// setup hasn't been completed yet.
function getDriveClient() {
  const token = loadToken();
  if (!token) {
    throw new Error('Google Drive is not connected yet — run "node scripts/google-auth-setup.js" once.');
  }
  const client = buildOAuthClient();
  client.setCredentials(token);
  return google.drive({ version: 'v3', auth: client });
}

module.exports = { isConfigured, buildOAuthClient, loadToken, saveToken, getDriveClient, SCOPES, TOKEN_PATH };
