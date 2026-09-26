const express = require('express');
const AppError = require('./utils/app-error');
const errorHandler = require('./middleware/error-handler');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use((req, res, next) => {
  next(new AppError('Route not found', 404));
});

app.use(errorHandler);

module.exports = app;
