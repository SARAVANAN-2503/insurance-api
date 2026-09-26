require('dotenv').config();

const port = Number(process.env.PORT ?? 3000);
const mongodbUri = process.env.MONGODB_URI?.trim();
const uploadMaxMb = Number(process.env.UPLOAD_MAX_MB ?? 10);
const importMaxRows = Number(process.env.IMPORT_MAX_ROWS ?? 100000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

if (!mongodbUri || !/^mongodb(?:\+srv)?:\/\//.test(mongodbUri)) {
  throw new Error('MONGODB_URI must be a valid MongoDB connection URI');
}

if (!Number.isInteger(uploadMaxMb) || uploadMaxMb < 1 || uploadMaxMb > 100) {
  throw new Error('UPLOAD_MAX_MB must be an integer between 1 and 100');
}
if (!Number.isInteger(importMaxRows) || importMaxRows < 1) {
  throw new Error('IMPORT_MAX_ROWS must be a positive integer');
}

module.exports = { port, mongodbUri, uploadMaxMb, importMaxRows };
