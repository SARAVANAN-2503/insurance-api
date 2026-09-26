const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

mongoose.connection.on('error', () => {
  console.error('MongoDB connection error');
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB connected');
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
