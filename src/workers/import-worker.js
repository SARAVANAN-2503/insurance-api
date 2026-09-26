const { parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
const { connectDatabase, disconnectDatabase } = require('../config/database');
const { readRows } = require('../utils/import-rows');
const { mapHeaders, mapRow } = require('../utils/import-mapping');

async function run() {
  const counts = { processed: 0, imported: 0, skipped: 0 };
  let mapping;
  let importRow;
  let result;
  let stage = 'file';
  try {
    for await (const values of readRows(workerData.filePath, path.extname(workerData.filePath))) {
      if (values.every((value) => value === null || value === undefined || String(value).trim() === '')) continue;
      if (!mapping) {
        mapping = mapHeaders(values);
        stage = 'database';
        await connectDatabase(workerData.mongodbUri);
        const rowService = require('../services/import-row-service');
        await rowService.initializeModels();
        importRow = rowService.importRow;
        stage = 'file';
        continue;
      }
      counts.processed += 1;
      if (counts.processed > workerData.maxRows) throw new Error('Import row limit exceeded');
      let row;
      try {
        if (values.length > mapping.length && values.slice(mapping.length).some((value) => value != null && value !== '')) {
          throw new Error('Row has more values than the header');
        }
        row = mapRow(values, mapping);
      } catch {
        counts.skipped += 1;
        continue;
      }
      stage = 'database';
      try {
        if (await importRow(row)) counts.imported += 1;
        else counts.skipped += 1;
      } catch (err) {
        if (err.name === 'ValidationError' || err.code === 11000
          || err.message === 'User without email needs DOB, address, or phone number') {
          counts.skipped += 1;
        } else {
          throw err;
        }
      }
      stage = 'file';
    }
    if (!mapping) throw new Error('File contains no header');
    result = { type: 'complete', ...counts };
  } catch (err) {
    const message = stage === 'database' ? `Database operation failed (${err.name}, code ${err.code ?? 'unknown'})` :
      (err.message.startsWith('Missing required column:') || err.message.startsWith('Duplicate column for')
        || ['Import row limit exceeded', 'File contains no header'].includes(err.message)
        ? err.message : 'Unable to parse spreadsheet');
    result = { type: 'error', message, ...counts };
  } finally {
    await disconnectDatabase();
  }
  parentPort.postMessage(result);
}

run().catch(() => {
  parentPort.postMessage({ type: 'error', message: 'Worker cleanup failed' });
  process.exitCode = 1;
});
