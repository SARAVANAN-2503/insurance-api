const AppError = require('../utils/app-error');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let message = 'Internal server error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON body';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
  } else if (err.status === 415) {
    statusCode = 415;
    message = 'Unsupported request encoding';
  }

  if (statusCode >= 500) {
    console.error(err);
    message = 'Internal server error';
  }

  res.status(statusCode).json({ error: { message } });
}

module.exports = errorHandler;
