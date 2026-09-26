const { DateTime } = require('luxon');
const AppError = require('./app-error');

function parseScheduleTime(day, time, timezone) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new AppError('day must use YYYY-MM-DD', 400);
  }
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new AppError('time must use HH:mm in 24-hour format', 400);
  }
  const input = `${day} ${time}`;
  const date = DateTime.fromFormat(input, 'yyyy-MM-dd HH:mm', { zone: timezone, locale: 'en' });
  if (!date.isValid || date.toFormat('yyyy-MM-dd HH:mm') !== input) {
    throw new AppError('Invalid or nonexistent date/time in the configured timezone', 400);
  }
  if (date.getPossibleOffsets().length > 1) {
    throw new AppError('Ambiguous date/time in the configured timezone; choose another time', 400);
  }
  return date.toJSDate();
}

module.exports = { parseScheduleTime };
