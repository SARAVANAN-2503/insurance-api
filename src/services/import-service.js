const { Worker } = require('node:worker_threads');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const env = require('../config/env');
const AppError = require('../utils/app-error');

const reportRoot = path.resolve(__dirname, '../../work/import-reports');
let activeImport;
let activeWorker;
let activeId;
let stopping = false;

function reportDirectory(id) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) throw new AppError('Import not found', 404);
  return path.join(reportRoot, id);
}

async function saveStatus(directory, status) {
  const temporary = path.join(directory, 'status.tmp');
  await fs.writeFile(temporary, JSON.stringify(status));
  await fs.rename(temporary, path.join(directory, 'status.json'));
}

async function getImport(id) {
  let status;
  try { status = JSON.parse(await fs.readFile(path.join(reportDirectory(id), 'status.json'), 'utf8')); }
  catch (err) {
    if (err.code === 'ENOENT') throw new AppError('Import not found', 404);
    throw err;
  }
  if (status.status === 'processing' && id !== activeId) {
    return { ...status, status: 'failed', message: 'Import interrupted by server restart; remaining rows were not processed' };
  }
  return status;
}

async function getReport(id) {
  const status = await getImport(id);
  if (!status.reportUrl) throw new AppError('Report is not available for this import', 409);
  return path.join(reportDirectory(id), 'issues.xlsx');
}

async function startImport(filePath, directory) {
  if (stopping || activeImport) throw new AppError('Import temporarily unavailable; try again later', 503);
  let done;
  activeImport = new Promise((resolve) => { done = resolve; });
  const id = randomUUID();
  const outputDirectory = reportDirectory(id);
  activeId = id;
  const initial = { id, status: 'processing', statusUrl: `/api/imports/${id}` };
  try {
    await fs.mkdir(outputDirectory, { recursive: true });
    await saveStatus(outputDirectory, initial);
    if (stopping) throw new AppError('Server is shutting down', 503);
    const worker = new Worker(path.resolve(__dirname, '../workers/import-worker.js'), {
      workerData: { filePath, mongodbUri: env.mongodbUri, maxRows: env.importMaxRows,
        reportPath: path.join(outputDirectory, 'issues.xlsx') },
      env: { ...process.env, TMPDIR: directory, TMP: directory, TEMP: directory },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    activeWorker = worker;
    let result;
    let failed = false;
    worker.on('message', (message) => { result = message; });
    worker.on('error', () => { failed = true; });
    worker.once('exit', async (code) => {
      const available = !failed && code === 0 && result && !result.reportUnavailable;
      const status = { ...initial, ...result, status: available && result.type === 'complete' ? 'completed' : 'failed' };
      delete status.type;
      if (available) status.reportUrl = `/api/imports/${id}/report`;
      else status.message = 'Import interrupted or report generation failed; remaining rows may not have been processed';
      try {
        await saveStatus(outputDirectory, status);
        console.log(`Import ${id}: ${status.status}; ${status.imported ?? 0} imported, ${status.duplicates ?? 0} duplicates, ${status.skipped ?? 0} skipped`);
      } catch { console.error('Unable to save import status'); }
      try { await fs.rm(directory, { recursive: true, force: true }); }
      catch { console.error('Import temporary file cleanup failed'); }
      finally {
        activeImport = undefined;
        activeWorker = undefined;
        activeId = undefined;
        done();
      }
    });
    return initial;
  } catch (err) {
    activeImport = undefined;
    activeId = undefined;
    done();
    throw err;
  }
}

async function stopImports() {
  stopping = true;
  if (!activeImport) return;
  const timeout = setTimeout(() => {
    activeWorker?.terminate().catch(() => console.error('Unable to stop import worker'));
  }, 5000);
  try { await activeImport; } finally { clearTimeout(timeout); }
}

module.exports = { startImport, stopImports, getImport, getReport };
