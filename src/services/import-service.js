const { Worker } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs/promises');
const env = require('../config/env');
const AppError = require('../utils/app-error');

let activeImport;
let activeWorker;
let stopping = false;

function startImport(filePath, directory) {
  if (stopping || activeImport) throw new AppError('Import temporarily unavailable; try again later', 503);
  const worker = new Worker(path.resolve(__dirname, '../workers/import-worker.js'), {
    workerData: { filePath, mongodbUri: env.mongodbUri, maxRows: env.importMaxRows },
    env: { ...process.env, TMPDIR: directory, TMP: directory, TEMP: directory },
    resourceLimits: { maxOldGenerationSizeMb: 256 },
  });
  activeWorker = worker;
  let result;
  let failed = false;
  worker.on('message', (message) => { result = message; });
  worker.on('error', () => {
    failed = true;
    console.error('Import failed: worker error');
  });
  activeImport = new Promise((resolve) => {
    worker.once('exit', async (code) => {
      if (!failed) {
        if (code !== 0 || !result) console.error('Import failed: worker exited unexpectedly');
        else if (result.type === 'error') console.error(`Import failed: ${result.message}`);
        else console.log(`Import completed: ${result.processed} processed, ${result.imported} imported, ${result.skipped} skipped`);
      }
      try {
        await fs.rm(directory, { recursive: true, force: true });
      } catch {
        console.error('Import temporary file cleanup failed');
      } finally {
        activeImport = undefined;
        activeWorker = undefined;
        resolve();
      }
    });
  });
}

async function stopImports() {
  stopping = true;
  if (!activeImport) return;
  const worker = activeWorker;
  const timeout = setTimeout(() => {
    worker.terminate().catch(() => console.error('Unable to stop import worker'));
  }, 5000);
  try {
    await activeImport;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { startImport, stopImports };
