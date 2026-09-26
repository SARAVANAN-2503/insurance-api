const fs = require('node:fs/promises');
const path = require('node:path');
const request = require('supertest');

require('dotenv').config();
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/insurance_assessment';
process.env.UPLOAD_MAX_MB = '1';
const app = require('../src/app');
const uploadRoot = path.resolve(__dirname, '../work/uploads');
let originalDirectories;

beforeEach(async () => {
  await fs.mkdir(uploadRoot, { recursive: true });
  originalDirectories = await fs.readdir(uploadRoot);
});

afterEach(async () => {
  expect((await fs.readdir(uploadRoot)).sort()).toEqual(originalDirectories.sort());
});

test('missing upload returns 400', async () => {
  await request(app).post('/api/imports').expect(400);
});

test('unsupported extension returns 400', async () => {
  await request(app).post('/api/imports').attach('file', Buffer.from('data'), 'sample.txt').expect(400);
});

test('incorrect multipart field returns 400', async () => {
  await request(app).post('/api/imports').attach('document', Buffer.from('data'), 'sample.csv').expect(400);
});

test('oversized upload returns 413 and removes its temporary directory', async () => {
  await request(app).post('/api/imports').attach('file', Buffer.alloc(1024 * 1024 + 1), 'sample.csv').expect(413);
});

test.each(['multipart/form-data', 'multipart/form-data; boundary=check'])('malformed upload returns 400: %s', async (contentType) => {
  const { body } = await request(app).post('/api/imports').set('Content-Type', contentType)
    .send('--check\r\nContent-Disposition: form-data; name="file"; filename="a.csv"\r\nContent-Type: text/csv\r\n\r\nunfinished')
    .expect(400);
  expect(body).toEqual({ error: { message: 'Malformed multipart upload' } });
});
