require('dotenv').config();

const port = Number(process.env.PORT ?? 3000);
const mongodbUri = process.env.MONGODB_URI?.trim();

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

if (!mongodbUri || !/^mongodb(?:\+srv)?:\/\//.test(mongodbUri)) {
  throw new Error('MONGODB_URI must be a valid MongoDB connection URI');
}

module.exports = { port, mongodbUri };
