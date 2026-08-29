'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const documentsRoutes = require('./routes/documents');
const chatRoutes = require('./routes/chat');
const apiDashboardRoutes = require('./routes/api-dashboard');
const apiAdminRoutes = require('./routes/api-admin');
const apiSwapsRoutes = require('./routes/api-swaps');
const apiExportRoutes = require('./routes/api-export');
const apiReportsRoutes = require('./routes/api-reports');
const apiDocumentsRoutes = require('./routes/api-documents');
const apiUsersRoutes = require('./routes/api-users');
const apiMeRoutes = require('./routes/api-me');
const apiTeamRoutes = require('./routes/api-team');
const apiMessagesRoutes = require('./routes/api-messages');
const { handleLogin, handleLogout } = require('./middleware/auth');
const { migrateFromJsonIfNeeded } = require('./lib/migrate-from-json');

const fs = require('fs');
const generatedAccounts = migrateFromJsonIfNeeded();
if (generatedAccounts.length) {
  const lines = generatedAccounts.map((a) => `  ${a.username.padEnd(12)} ${a.tempPassword}  (${a.displayName})`);
  console.log(`\x1b[36m[SOCGrid]\x1b[0m Migrated ${generatedAccounts.length} operator account(s) from legacy data — temporary passwords (change on first login):`);
  console.log(lines.join('\n'));
  fs.appendFileSync(
    path.join(__dirname, 'audit.log'),
    `[${new Date().toISOString()}] Migrated accounts created:\n${lines.join('\n')}\n`
  );
}

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Auth routes
app.get('/login', (req, res) => {
  res.render('login', {
    error: req.query.error === '1',
    redirect: req.query.redirect || ''
  });
});
app.post('/login', handleLogin);
app.get('/logout', handleLogout);

// App routes
app.use('/', dashboardRoutes);
app.use('/admin', adminRoutes);
app.use('/documents', documentsRoutes);
app.use('/chat', chatRoutes);
app.use('/api/dashboard', apiDashboardRoutes);
app.use('/api/admin', apiAdminRoutes);
app.use('/api/swaps', apiSwapsRoutes);
app.use('/api/export', apiExportRoutes);
app.use('/api/reports', apiReportsRoutes);
app.use('/api/documents', apiDocumentsRoutes);
app.use('/api/users', apiUsersRoutes);
app.use('/api/me', apiMeRoutes);
app.use('/api/team', apiTeamRoutes);
app.use('/api/messages', apiMessagesRoutes);

app.use((req, res) => {
  res.status(404).send('Not Found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\x1b[32m[SOCGrid]\x1b[0m http://localhost:${PORT}`);
  console.log(`\x1b[33m[SOCGrid]\x1b[0m Admin: http://localhost:${PORT}/admin`);
  console.log(`\x1b[33m[SOCGrid]\x1b[0m Default login — user: admin  pass: soc2026`);
});