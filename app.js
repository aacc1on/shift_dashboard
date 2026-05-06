'use strict';

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const apiDashboardRoutes = require('./routes/api-dashboard');
const apiAdminRoutes = require('./routes/api-admin');
const apiSwapsRoutes = require('./routes/api-swaps');
const apiExportRoutes = require('./routes/api-export');
const { handleLogin, handleLogout } = require('./middleware/auth');

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
    redirect: req.query.redirect || '/admin'
  });
});
app.post('/login', handleLogin);
app.get('/logout', handleLogout);

// App routes
app.use('/', dashboardRoutes);
app.use('/admin', adminRoutes);
app.use('/api/dashboard', apiDashboardRoutes);
app.use('/api/admin', apiAdminRoutes);
app.use('/api/swaps', apiSwapsRoutes);
app.use('/api/export', apiExportRoutes);

app.use((req, res) => {
  res.status(404).send('Not Found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\x1b[32m[SOC]\x1b[0m http://localhost:${PORT}`);
  console.log(`\x1b[33m[SOC]\x1b[0m Admin: http://localhost:${PORT}/admin`);
  console.log(`\x1b[33m[SOC]\x1b[0m Default login — user: admin  pass: soc2026`);
});