'use strict';

const express = require('express');
const router = express.Router();
const { requireLead } = require('../middleware/auth');
const { backupDatabase } = require('../lib/backup');
const { runDriveBackup, isDriveConfigured, lastDriveBackup } = require('../lib/drive-backup');

router.use(requireLead);

router.get('/status', (req, res) => {
  res.json({
    driveConfigured: isDriveConfigured(),
    lastDriveBackup: lastDriveBackup()
  });
});

router.post('/run', async (req, res) => {
  try {
    await backupDatabase();
  } catch (err) {
    return res.status(500).json({ error: 'Local backup failed: ' + err.message });
  }
  if (!isDriveConfigured()) {
    return res.json({ ok: true, drive: false, note: 'Local snapshot saved. Google Drive is not connected — see scripts/google-auth-setup.js.' });
  }
  try {
    const result = await runDriveBackup();
    res.json({ ok: true, drive: true, result });
  } catch (err) {
    res.status(500).json({ error: 'Drive backup failed: ' + err.message });
  }
});

module.exports = router;
