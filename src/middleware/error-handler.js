const AppError = require('../utils/app-error');
const multer = require('multer');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let message = 'Internal server error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof multer.MulterError) {
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the upload size limit' : 'Invalid multipart upload';
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

  if (statusCode >= 500 && !(err instanceof AppError)) {
    console.error(err);
    message = 'Internal server error';
  }

  res.status(statusCode).json({ error: { message } });
}

module.exports = errorHandler;
