const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const env = require('../config/env');
const AppError = require('../utils/app-error');

const uploadRoot = path.resolve(__dirname, '../../work/uploads');
const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, req.uploadDirectory);
  },
  filename(req, file, callback) {
    callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});
const receiveFile = multer({
  storage,
  limits: { fileSize: env.uploadMaxMb * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  fileFilter(req, file, callback) {
    if (!['.csv', '.xlsx'].includes(path.extname(file.originalname).toLowerCase())) {
      return callback(new AppError('Only .xlsx and .csv files are supported', 400));
    }
    callback(null, true);
  },
}).single('file');

async function upload(req, res, next) {
  await fs.mkdir(uploadRoot, { recursive: true });
  req.uploadDirectory = await fs.mkdtemp(path.join(uploadRoot, 'import-'));
  try {
    await new Promise((resolve, reject) => {
      receiveFile(req, res, (err) => (err ? reject(err) : resolve()));
    });
    if (!req.file) throw new AppError('A file is required in multipart field "file"', 400);
    if (req.aborted || res.destroyed) throw new AppError('Upload interrupted', 400);
    next();
  } catch (err) {
    await fs.rm(req.uploadDirectory, { recursive: true, force: true });
    next(err);
  }
}

module.exports = upload;
