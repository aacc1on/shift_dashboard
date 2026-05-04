const express = require('express');
const path = require('path');

const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const apiDashboardRoutes = require('./routes/api-dashboard');
const apiAdminRoutes = require('./routes/api-admin');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.use('/', dashboardRoutes);
app.use('/admin', adminRoutes);
app.use('/api/dashboard', apiDashboardRoutes);
app.use('/api/admin', apiAdminRoutes);

app.use((req, res) => {
  res.status(404).send('Not Found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\x1b[32m[SOC]\x1b[0m http://localhost:${PORT}`);
});
