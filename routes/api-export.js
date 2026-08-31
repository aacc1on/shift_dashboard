'use strict';
const express = require('express');
const router = express.Router();
const usersModel = require('../models/users');
const shiftsModel = require('../models/shifts');
const { requireAuth } = require('../middleware/auth');
const { defaultAdminDateRange } = require('../lib/shift-times');

router.get('/csv', requireAuth, async (req, res) => {
  const users = await usersModel.listUsers({ activeOnly: true, role: 'member' });
  const dates = defaultAdminDateRange();
  const gridByUserId = await shiftsModel.getGridForDates(dates);

  const lines = [];
  lines.push(['Operator', ...dates].join(','));
  for (const user of users) {
    lines.push([user.display_name, ...dates.map((d) => gridByUserId[d]?.[user.id] || 'X')].join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="schedule.csv"');
  res.send(lines.join('\n'));
});

module.exports = router;
