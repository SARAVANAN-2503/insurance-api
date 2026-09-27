const { parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
const { connectDatabase, disconnectDatabase } = require('../config/database');
const { readRows } = require('../utils/import-rows');
const { mapHeaders, mapRow } = require('../utils/import-mapping');
const { createImportReport } = require('../utils/import-report');

async function run() {
  const counts = { processed: 0, imported: 0, duplicates: 0, skipped: 0 };
  const report = createImportReport(workerData.reportPath);
  let mapping;
  let sourceWidth = 0;
  let rowNumber = 0;
  let importRow;
  let result;
  let stage = 'file';
  let values = [];
  try {
    for await (values of readRows(workerData.filePath, path.extname(workerData.filePath))) {
      rowNumber += 1;
      if (values.every((value) => value == null || String(value).trim() === '')) continue;
      if (!mapping) {
        sourceWidth = values.length;
        report.headers(values);
        mapping = mapHeaders(values);
        stage = 'database';
        await connectDatabase(workerData.mongodbUri);
        const rowService = require('../services/import-row-service');
        await rowService.initializeModels();
        importRow = rowService.importRow;
        stage = 'file';
        continue;
      }
      if (counts.processed >= workerData.maxRows) throw new Error('Import row limit exceeded; remaining rows were not processed');
      counts.processed += 1;
      let row;
      try {
        if (values.length > mapping.length && values.slice(mapping.length).some((value) => value != null && value !== '')) {
          throw new Error('Row has more values than the header');
        }
        row = mapRow(values, mapping);
      } catch (err) {
        counts.skipped += 1;
        report.add(rowNumber, 'validation', err.message, values, sourceWidth);
        continue;
      }
      stage = 'database';
      try {
        const outcome = await importRow(row);
        if (outcome.status === 'imported') counts.imported += 1;
        else {
          if (outcome.status === 'duplicate') counts.duplicates += 1;
          else counts.skipped += 1;
          report.add(rowNumber, outcome.status, outcome.issue, values, sourceWidth);
        }
      } catch (err) {
        if (err.name === 'ValidationError' || err.code === 11000
          || err.message === 'User without email needs DOB, address, or phone number') {
          counts.skipped += 1;
          const issue = err.code === 11000 ? 'A unique database value conflicts with an existing record'
            : err.name === 'ValidationError' ? `Invalid database fields: ${Object.keys(err.errors).join(', ')}` : err.message;
          report.add(rowNumber, 'validation', issue, values, sourceWidth);
        } else throw err;
      }
      stage = 'file';
    }
    if (!mapping) throw new Error('File contains no header');
    result = { type: 'complete', ...counts };
  } catch (err) {
    const message = stage === 'database' ? 'Database operation failed; import stopped'
      : /^(Missing required column:|Duplicate column for|Import row limit|File contains no header)/.test(err.message)
        ? err.message : 'Unable to parse spreadsheet; import stopped';
    report.add(rowNumber || 1, 'file', message, values, sourceWidth);
    result = { type: 'error', message, ...counts };
  } finally {
    await disconnectDatabase();
  }
  await report.finish(counts);
  parentPort.postMessage(result);
}

run().catch(() => {
  parentPort.postMessage({ type: 'error', message: 'Import cleanup or report generation failed', reportUnavailable: true });
  process.exitCode = 1;
});
