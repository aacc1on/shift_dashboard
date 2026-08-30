'use strict';

// One-time interactive setup for the Google Drive document backup.
// Run manually on the server: node scripts/google-auth-setup.js
//
// Prerequisites (Google Cloud Console, https://console.cloud.google.com):
//   1. Create a project (or reuse one).
//   2. APIs & Services -> Library -> enable "Google Drive API".
//   3. APIs & Services -> Credentials -> Create Credentials -> OAuth client ID
//        - Application type: Desktop app
//   4. Copy the Client ID and Client Secret into .env as:
//        GOOGLE_CLIENT_ID=...
//        GOOGLE_CLIENT_SECRET=...
//   5. Run this script. It prints a URL — open it, sign in with the Google
//      account backups should go to, approve access, copy the code shown,
//      and paste it back here. This only has to be done once; the resulting
//      refresh token (data/google-token.json) is reused by the running app
//      to back up automatically with no further logins.

require('dotenv').config();
const readline = require('readline');
const { buildOAuthClient, saveToken, SCOPES } = require('../lib/google-drive');

async function main() {
  let client;
  try {
    client = buildOAuthClient();
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }

  const authUrl = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
  console.log('\n1. Open this URL in a browser and sign in with the Google account backups should go to:\n');
  console.log(authUrl);
  console.log('\n2. Approve access, then copy the code it shows you.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Paste the code here: ', async (code) => {
    rl.close();
    try {
      const { tokens } = await client.getToken(code.trim());
      saveToken(tokens);
      console.log('\nSaved. Google Drive backups are now active (data/google-token.json).');
    } catch (err) {
      console.error('\nFailed to exchange the code for a token:', err.message);
      process.exit(1);
    }
  });
}

main();
