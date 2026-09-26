require('dotenv').config();
const { IANAZone } = require('luxon');

const port = Number(process.env.PORT ?? 3000);
const mongodbUri = process.env.MONGODB_URI?.trim();
const uploadMaxMb = Number(process.env.UPLOAD_MAX_MB ?? 10);
const importMaxRows = Number(process.env.IMPORT_MAX_ROWS ?? 100000);
const appTimezone = process.env.APP_TIMEZONE ?? 'Asia/Kolkata';
const messagePollMs = Number(process.env.MESSAGE_POLL_INTERVAL_MS ?? 1000);
const messageStaleMs = Number(process.env.MESSAGE_STALE_TIMEOUT_MS ?? 60000);

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

if (!IANAZone.isValidZone(appTimezone)) throw new Error('APP_TIMEZONE must be a valid IANA timezone');
if (!Number.isInteger(messagePollMs) || messagePollMs < 100 || messagePollMs > 60000) {
  throw new Error('MESSAGE_POLL_INTERVAL_MS must be an integer between 100 and 60000');
}
if (!Number.isInteger(messageStaleMs) || messageStaleMs < 1000 || messageStaleMs > 3600000) {
  throw new Error('MESSAGE_STALE_TIMEOUT_MS must be an integer between 1000 and 3600000');
}

module.exports = { port, mongodbUri, uploadMaxMb, importMaxRows, appTimezone, messagePollMs, messageStaleMs };
