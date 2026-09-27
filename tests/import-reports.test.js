const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const request = require('supertest');

require('dotenv').config();
const uri = new URL(process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/insurance_assessment');
const databaseName = `insurance_import_test_${randomUUID().replace(/-/g, '')}`;
uri.pathname = `/${databaseName}`;
process.env.MONGODB_URI = uri.toString();
const app = require('../src/app');
const jobs = [];

beforeAll(async () => { await mongoose.connect(uri.toString()); });
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  for (const id of jobs) await fs.rm(path.resolve(__dirname, '../work/import-reports', id), { recursive: true, force: true });
});

async function upload(content, filename) {
  const response = await request(app).post('/api/imports').attach('file', content, filename).expect(202);
  jobs.push(response.body.id);
  for (let n = 0; n < 200; n += 1) {
    const { body } = await request(app).get(response.body.statusUrl).expect(200);
    if (body.status !== 'processing') return body;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Worker did not finish');
}

async function report(job) {
  const response = await request(app).get(job.reportUrl).buffer(true).parse((res, callback) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  }).expect(200);
  expect(response.headers['content-disposition']).toContain('import-issues.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(response.body);
  return workbook.getWorksheet('Import issues');
}

const header = 'firstName,email,categoryName,companyName,policyNumber,dob';
const good = 'Alice,alice@example.com,Auto,Example,P1,1990-01-01';

test('CSV report lists duplicates, conflicts and invalid rows with source data', async () => {
  const csv = [header, good, '', good,
    'Other,alice@example.com,Auto,Example,P2,1980-01-01',
    'Bob,bob@example.com,Auto,Example,P3,2000-02-30',
    'Alice,alice@example.com,Home,Example,P1,1990-01-01',
    '=1+1,bad-email,Auto,Example,P4,1990-01-01'].join('\n');
  const job = await upload(Buffer.from(csv), 'sample.csv');
  expect(job).toMatchObject({ status: 'completed', processed: 6, imported: 1, duplicates: 1, skipped: 4 });
  const sheet = await report(job);
  expect(sheet.rowCount).toBe(6);
  expect(sheet.getColumn(1).values.slice(2)).toEqual([4, 5, 6, 7, 8]);
  expect(sheet.getRow(2).getCell(2).value).toBe('Warning');
  expect(sheet.getRow(3).getCell(4).value).toContain('firstName, dob');
  expect(sheet.getRow(4).getCell(4).value).toContain('dob: Invalid date');
  expect(sheet.getRow(5).getCell(4).value).toContain('different: lob');
  expect(sheet.getRow(6).getCell(5).value).toBe('=1+1');
  expect(sheet.getRow(6).getCell(5).type).toBe(ExcelJS.ValueType.String);
  expect(await mongoose.connection.db.collection('policies').countDocuments()).toBe(1);
  const repeat = await upload(Buffer.from([header, good].join('\n')), 'repeat.csv');
  expect(repeat).toMatchObject({ imported: 0, duplicates: 1, skipped: 0 });
}, 20000);

test('XLSX errors retain source row numbers and values', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');
  sheet.addRow(header.split(','));
  sheet.addRow(['Xlsx User', 'xlsx@example.com', 'Auto', 'Example', 'X1', new Date('1991-01-01')]);
  sheet.addRow(['Missing Policy', 'missing@example.com', 'Auto', 'Example', '', '1991-01-01']);
  const job = await upload(Buffer.from(await workbook.xlsx.writeBuffer()), 'sample.xlsx');
  expect(job).toMatchObject({ imported: 1, duplicates: 0, skipped: 1 });
  const issues = await report(job);
  expect(issues.getRow(2).getCell(1).value).toBe(3);
  expect(issues.getRow(2).getCell(4).value).toContain('policyNumber');
}, 20000);

test('bad headers produce a failed import with a downloadable explanation', async () => {
  const job = await upload(Buffer.from('unrecognized\nvalue'), 'bad.csv');
  expect(job.status).toBe('failed');
  expect(job.message).toContain('Missing required column');
  expect((await report(job)).getRow(2).getCell(3).value).toBe('file');
}, 15000);

test('unknown imports and unavailable reports return clear errors', async () => {
  await request(app).get(`/api/imports/${randomUUID()}`).expect(404);
  await request(app).get('/api/imports/invalid/report').expect(404);
  const id = randomUUID();
  jobs.push(id);
  const directory = path.resolve(__dirname, '../work/import-reports', id);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'status.json'), JSON.stringify({ id, status: 'processing' }));
  const { body } = await request(app).get(`/api/imports/${id}`).expect(200);
  expect(body.status).toBe('failed');
  expect(body.message).toContain('restart');
  await request(app).get(`/api/imports/${id}/report`).expect(409);
});
