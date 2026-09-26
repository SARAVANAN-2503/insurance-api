const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const { DateTime } = require('luxon');

require('dotenv').config();
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/insurance_assessment';
process.env.APP_TIMEZONE = 'Asia/Kolkata';
process.env.MESSAGE_STALE_TIMEOUT_MS = '60000';
const app = require('../src/app');
require('../src/config/database');
const { runSchedulerOnce, startMessageScheduler, stopMessageScheduler } = require('../src/jobs/message-scheduler');
const { parseScheduleTime } = require('../src/utils/date-time');

const databaseName = `insurance_message_test_${randomUUID().replace(/-/g, '')}`;
let ScheduledMessage;
let Message;

function futureRequest() {
  return {
    message: ' Follow up with customer ',
    day: DateTime.now().setZone('Asia/Kolkata').plus({ days: 1 }).toISODate(),
    time: '10:30',
  };
}

beforeAll(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || process.env.MONGODB_URI, {
    dbName: databaseName, serverSelectionTimeoutMS: 5000,
  });
  ScheduledMessage = require('../src/models/scheduled-message');
  Message = require('../src/models/message');
  await Promise.all([ScheduledMessage.init(), Message.init()]);
}, 15000);

beforeEach(async () => {
  await stopMessageScheduler();
  await ScheduledMessage.deleteMany({});
  await Message.deleteMany({});
});

afterAll(async () => {
  await stopMessageScheduler();
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName) {
      await mongoose.connection.dropDatabase();
    }
  } finally {
    await mongoose.disconnect();
  }
});

describe('POST /api/messages/schedule', () => {
  test.each([undefined, '', '   ', 123, {}])('rejects invalid message: %p', async (message) => {
    await request(app).post('/api/messages/schedule').send({ ...futureRequest(), message }).expect(400);
  });

  test.each([undefined, '2026-02-30', '2026-2-03', '28-09-2026', '2026-09-28 '])('rejects invalid day: %p', async (day) => {
    await request(app).post('/api/messages/schedule').send({ ...futureRequest(), day }).expect(400);
  });

  test.each([undefined, '24:00', '10:60', '9:30', '10:30:00'])('rejects invalid time: %p', async (time) => {
    await request(app).post('/api/messages/schedule').send({ ...futureRequest(), time }).expect(400);
  });

  test('rejects a past schedule', async () => {
    await request(app).post('/api/messages/schedule').send({ ...futureRequest(), day: '2000-01-01' }).expect(400);
  });

  test('persists only the pending schedule and interprets time in Asia/Kolkata', async () => {
    const input = futureRequest();
    const { body } = await request(app).post('/api/messages/schedule').send(input).expect(202);
    expect(body.message).toBe('Message scheduled');
    expect(body.schedule).toMatchObject({ message: 'Follow up with customer', status: 'pending',
      scheduledFor: `${input.day}T05:00:00.000Z` });
    expect(await ScheduledMessage.countDocuments()).toBe(1);
    expect((await ScheduledMessage.findById(body.schedule.id)).status).toBe('pending');
    expect(await Message.countDocuments()).toBe(0);
    await runSchedulerOnce();
    expect(await Message.countDocuments()).toBe(0);
  });
});

describe('timezone conversion', () => {
  test('respects a configured timezone other than the default', () => {
    expect(parseScheduleTime('2030-01-01', '10:30', 'UTC').toISOString()).toBe('2030-01-01T10:30:00.000Z');
  });

  test.each([['2026-03-08', '02:30'], ['2026-11-01', '01:30']])('rejects nonexistent or ambiguous DST time %s %s', (day, time) => {
    expect(() => parseScheduleTime(day, time, 'America/New_York')).toThrow();
  });
});

describe('message scheduler', () => {
  async function dueSchedule(values = {}) {
    return await ScheduledMessage.create({ message: 'Due message', scheduledFor: new Date(Date.now() - 60000), ...values });
  }

  async function makeStale(schedule) {
    await ScheduledMessage.collection.updateOne({ _id: schedule._id }, {
      $set: { status: 'processing', updatedAt: new Date(Date.now() - 120000) },
    });
  }

  test('delivers due pending messages and completes their schedules', async () => {
    const schedule = await dueSchedule();
    await runSchedulerOnce();
    const message = await Message.findOne({ schedule: schedule._id });
    const completed = await ScheduledMessage.findById(schedule._id);
    expect(message.message).toBe('Due message');
    expect(message.deliveredAt.getTime()).toBeGreaterThanOrEqual(schedule.scheduledFor.getTime());
    expect(completed.status).toBe('completed');
    expect(completed.deliveredAt).toEqual(message.deliveredAt);
  });

  test('concurrent and repeated iterations cannot create duplicate final messages', async () => {
    const schedule = await dueSchedule();
    await Promise.all([runSchedulerOnce(), runSchedulerOnce(), runSchedulerOnce()]);
    await runSchedulerOnce();
    expect(await Message.countDocuments({ schedule: schedule._id })).toBe(1);
    const delivered = await Message.findOne({ schedule: schedule._id });
    await expect(Message.create({ message: delivered.message, scheduledFor: delivered.scheduledFor,
      deliveredAt: delivered.deliveredAt, schedule: schedule._id })).rejects.toMatchObject({ code: 11000 });
  });

  test('delivers persisted overdue pending work immediately when the scheduler starts', async () => {
    await dueSchedule();
    startMessageScheduler();
    await runSchedulerOnce();
    await stopMessageScheduler();
    expect(await Message.countDocuments()).toBe(1);
  });

  test('recovers stale processing work that has not inserted a message', async () => {
    const schedule = await dueSchedule();
    await makeStale(schedule);
    await runSchedulerOnce();
    expect(await Message.countDocuments()).toBe(1);
    expect((await ScheduledMessage.findById(schedule._id)).status).toBe('completed');
  });

  test('recovers a crash after insertion without changing the original delivery timestamp', async () => {
    const schedule = await dueSchedule();
    const deliveredAt = new Date(Date.now() - 30000);
    await Message.create({ message: schedule.message, scheduledFor: schedule.scheduledFor, deliveredAt, schedule: schedule._id });
    await makeStale(schedule);
    await runSchedulerOnce();
    expect(await Message.countDocuments()).toBe(1);
    const completed = await ScheduledMessage.findById(schedule._id);
    expect(completed.status).toBe('completed');
    expect(completed.deliveredAt).toEqual(deliveredAt);
  });

  test('does not steal a fresh processing claim', async () => {
    await dueSchedule({ status: 'processing' });
    await runSchedulerOnce();
    expect(await Message.countDocuments()).toBe(0);
  });

  test('recovers a transient failure while marking an inserted message completed', async () => {
    const schedule = await dueSchedule();
    const update = jest.spyOn(ScheduledMessage, 'updateOne').mockRejectedValueOnce(new Error('Transient write failure'));
    try {
      await expect(runSchedulerOnce()).rejects.toThrow('Transient write failure');
    } finally {
      update.mockRestore();
    }
    expect(await Message.countDocuments()).toBe(1);
    expect((await ScheduledMessage.findById(schedule._id)).status).toBe('processing');
    await makeStale(schedule);
    await runSchedulerOnce();
    expect(await Message.countDocuments()).toBe(1);
    expect((await ScheduledMessage.findById(schedule._id)).status).toBe('completed');
  });

  test('marks invalid stored payloads failed instead of retrying forever', async () => {
    await ScheduledMessage.collection.insertOne({ message: '', scheduledFor: new Date(0), status: 'pending',
      createdAt: new Date(), updatedAt: new Date() });
    await runSchedulerOnce();
    expect(await Message.countDocuments()).toBe(0);
    const schedule = await ScheduledMessage.findOne();
    expect(schedule.status).toBe('failed');
    expect(schedule.lastError).toBe('Message validation failed');
  });

  test('GET /api/messages returns only delivered messages, newest first', async () => {
    const earlier = await dueSchedule();
    const later = await dueSchedule();
    await dueSchedule({ scheduledFor: new Date(Date.now() + 60000) });
    for (const [schedule, deliveredAt] of [[earlier, new Date(1000)], [later, new Date(2000)]]) {
      await Message.create({ schedule: schedule._id, message: schedule.message, scheduledFor: schedule.scheduledFor, deliveredAt });
    }
    const { body } = await request(app).get('/api/messages').expect(200);
    expect(body.count).toBe(2);
    expect(body.messages.map((message) => message.schedule)).toEqual([later.id, earlier.id]);
  });
});
