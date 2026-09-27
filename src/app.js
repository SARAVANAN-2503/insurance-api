const express = require('express');
const path = require('node:path');
const AppError = require('./utils/app-error');
const errorHandler = require('./middleware/error-handler');
const imports = require('./routes/imports');
const policies = require('./routes/policies');
const messages = require('./routes/messages');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/imports', imports);
app.use('/api/policies', policies);
app.use('/api/messages', messages);

app.use(express.static(path.join(__dirname, '../public')));

app.use((req, res, next) => {
  next(new AppError('Route not found', 404));
});

app.use(errorHandler);

module.exports = app;
