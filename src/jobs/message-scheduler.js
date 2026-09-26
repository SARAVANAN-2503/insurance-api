const env = require('../config/env');

let running = false;
let timer;
let iteration;

async function processDueMessages() {
  const ScheduledMessage = require('../models/scheduled-message');
  const Message = require('../models/message');
  await ScheduledMessage.init();
  await Message.init();

  for (let count = 0; count < 25; count += 1) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - env.messageStaleMs);
    const schedule = await ScheduledMessage.findOneAndUpdate(
      {
        scheduledFor: { $lte: now },
        $or: [{ status: 'pending' }, { status: 'processing', updatedAt: { $lte: staleBefore } }],
      },
      { $set: { status: 'processing' }, $unset: { lastError: 1 } },
      { new: true, sort: { scheduledFor: 1, _id: 1 } }
    );
    if (!schedule) break;

    // updatedAt identifies this claim, so an expired owner cannot update a newer claim.
    const claim = { _id: schedule._id, status: 'processing', updatedAt: schedule.updatedAt };
    try {
      let message;
      try {
        message = await Message.findOneAndUpdate(
          { schedule: schedule._id },
          { $setOnInsert: { message: schedule.message, scheduledFor: schedule.scheduledFor, deliveredAt: new Date() } },
          { upsert: true, new: true, runValidators: true }
        );
      } catch (err) {
        if (err.code !== 11000) throw err;
        message = await Message.findOne({ schedule: schedule._id });
        if (!message) throw err;
      }
      await ScheduledMessage.updateOne(claim, {
        $set: { status: 'completed', deliveredAt: message.deliveredAt },
        $unset: { lastError: 1 },
      });
    } catch (err) {
      const invalid = err.name === 'ValidationError';
      await ScheduledMessage.updateOne(claim, {
        $set: {
          status: invalid ? 'failed' : 'processing',
          lastError: invalid ? 'Message validation failed' : 'Delivery interrupted; waiting for stale-claim recovery',
        },
      }, { timestamps: false });
      if (!invalid) throw err;
    }
  }
}

function runSchedulerOnce() {
  if (!iteration) {
    iteration = processDueMessages().finally(() => { iteration = undefined; });
  }
  return iteration;
}

async function poll() {
  try {
    await runSchedulerOnce();
  } catch (err) {
    console.error(`Message scheduler failed: ${err.name}`);
  } finally {
    if (running) timer = setTimeout(poll, env.messagePollMs);
  }
}

function startMessageScheduler() {
  if (running) return;
  running = true;
  void poll();
}

async function stopMessageScheduler() {
  running = false;
  clearTimeout(timer);
  try {
    await iteration;
  } catch {
    // The polling loop logs failures; unfinished claims remain recoverable.
  }
}

module.exports = { startMessageScheduler, stopMessageScheduler, runSchedulerOnce };
