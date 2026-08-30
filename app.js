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
const apiAnnouncementsRoutes = require('./routes/api-announcements');
const { handleLogin, handleLogout } = require('./middleware/auth');
const { ensureDefaultAdmin } = require('./lib/bootstrap');

const fs = require('fs');
const createdAdmin = ensureDefaultAdmin();
if (createdAdmin) {
  console.log(`\x1b[36m[SOCGrid]\x1b[0m Fresh install — created the first account:`);
  console.log(`  ${createdAdmin.username.padEnd(12)} ${createdAdmin.password}`);
  console.log(`\x1b[33m[SOCGrid]\x1b[0m Log in and change this password right away (your profile menu, top of any page).`);
  fs.appendFileSync(
    path.join(__dirname, 'audit.log'),
    `[${new Date().toISOString()}] Fresh install — created initial admin account "${createdAdmin.username}"\n`
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
app.use('/api/announcements', apiAnnouncementsRoutes);

app.use((req, res) => {
  res.status(404).send('Not Found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\x1b[32m[SOCGrid]\x1b[0m http://localhost:${PORT}`);
  console.log(`\x1b[33m[SOCGrid]\x1b[0m Admin: http://localhost:${PORT}/admin`);
});