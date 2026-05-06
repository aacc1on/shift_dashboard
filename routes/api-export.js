'use strict';
const express = require('express');
const router = express.Router();
const store = require('../data-store');
const { requireAuth } = require('../middleware/auth');

router.get('/csv', requireAuth, async (_req, res) => {
  const data = await store.load();
  const dates = [...data.dates].sort();
  const lines = [];
  lines.push(['Operator', ...dates].join(','));
  for (const person of data.people) {
    lines.push([person, ...dates.map((d) => data.schedule[d]?.[person] || 'X')].join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="schedule.ejs"');
  res.send(lines.join('\n'));
});

module.exports = router;
