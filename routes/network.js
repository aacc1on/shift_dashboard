'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  res.render('network', {
    system: 'SOCGrid',
    authRole: req.authRole,
    authUserId: req.authUserId
  });
});

module.exports = router;
