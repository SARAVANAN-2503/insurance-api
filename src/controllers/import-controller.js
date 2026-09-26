const fs = require('node:fs/promises');
const { startImport } = require('../services/import-service');

async function createImport(req, res) {
  try {
    startImport(req.file.path, req.uploadDirectory);
  } catch (err) {
    await fs.rm(req.uploadDirectory, { recursive: true, force: true });
    throw err;
  }
  res.status(202).json({ message: 'Import started' });
}

module.exports = { createImport };
