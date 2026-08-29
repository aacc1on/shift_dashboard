'use strict';

const express = require('express');
const router = express.Router();
const usersModel = require('../models/users');
const shiftsModel = require('../models/shifts');
const { requireAuth, requireLead } = require('../middleware/auth');
const { SHIFT_META, defaultAdminDateRange } = require('../lib/shift-times');

router.get('/', requireAuth, (req, res) => {
  const users = usersModel.listUsers({ activeOnly: true, role: 'member' });
  const dates = defaultAdminDateRange();
  const gridByUserId = shiftsModel.getGridForDates(dates);

  const schedule = {};
  dates.forEach((d) => {
    schedule[d] = {};
    users.forEach((u) => {
      const code = gridByUserId[d]?.[u.id];
      if (code) schedule[d][u.display_name] = code;
    });
  });

  res.render('admin', {
    system: 'SOCGrid',
    people: users.map((u) => ({ id: u.id, name: u.display_name })),
    dates,
    schedule,
    shiftTimes: SHIFT_META,
    authRole: req.authRole
  });
});

// Account management — lead-only for viewing too, not just editing, since
// it exposes usernames/roles for every account and gates password resets.
router.get('/users', requireLead, (req, res) => {
  res.render('admin-users', { system: 'SOCGrid' });
});

module.exports = router;
