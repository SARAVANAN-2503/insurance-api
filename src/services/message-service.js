const env = require('../config/env');
const AppError = require('../utils/app-error');
const { parseScheduleTime } = require('../utils/date-time');

async function scheduleMessage(input) {
  if (typeof input?.message !== 'string' || !input.message.trim()) {
    throw new AppError('message must be a nonempty string', 400);
  }
  const scheduledFor = parseScheduleTime(input.day, input.time, env.appTimezone);
  if (scheduledFor.getTime() <= Date.now()) {
    throw new AppError('Scheduled date/time must be in the future', 400);
  }
  const ScheduledMessage = require('../models/scheduled-message');
  const schedule = await ScheduledMessage.create({ message: input.message.trim(), scheduledFor });
  return { id: schedule.id, message: schedule.message, scheduledFor: schedule.scheduledFor, status: schedule.status };
}

async function listMessages() {
  const Message = require('../models/message');
  const messages = await Message.find().sort({ deliveredAt: -1, _id: -1 }).limit(100)
    .select('message scheduledFor deliveredAt schedule').lean();
  return messages.map(({ _id, ...message }) => ({ id: _id, ...message }));
}

module.exports = { scheduleMessage, listMessages };
