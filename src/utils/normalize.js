function text(value) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('Expected a text or numeric cell');
  }
  return String(value).trim() || undefined;
}

function normalizeName(value) {
  return text(value)?.replace(/\s+/g, ' ').toLowerCase();
}

function parseDate(value) {
  if (value === null || value === undefined || value === '') return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Invalid date');
    return value;
  }
  const input = text(value);
  if (!input) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z)?$/.exec(input);
  if (!match) throw new Error('Use YYYY-MM-DD or an ISO UTC timestamp for dates');
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)
    || Number(hour || 0) > 23 || Number(minute || 0) > 59 || Number(second || 0) > 59) {
    throw new Error('Invalid date');
  }
  return hour === undefined ? date : new Date(input);
}

module.exports = { text, normalizeName, parseDate };
