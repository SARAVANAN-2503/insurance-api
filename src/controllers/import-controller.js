const fs = require('node:fs/promises');
const { startImport, getImport, getReport } = require('../services/import-service');

async function createImport(req, res) {
  let job;
  try {
    job = await startImport(req.file.path, req.uploadDirectory);
  } catch (err) {
    await fs.rm(req.uploadDirectory, { recursive: true, force: true });
    throw err;
  }
  res.status(202).json({ message: 'Import started', ...job });
}

async function importStatus(req, res) {
  res.set('Cache-Control', 'no-store').json(await getImport(req.params.id));
}

async function downloadReport(req, res, next) {
  const filename = await getReport(req.params.id);
  res.set('Cache-Control', 'no-store');
  res.download(filename, 'import-issues.xlsx', (err) => { if (err) next(err); });
}

module.exports = { createImport, importStatus, downloadReport };
