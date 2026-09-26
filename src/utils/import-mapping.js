const { text, parseDate } = require('./normalize');

const aliases = {
  agentName: ['agent'],
  firstName: [],
  dob: ['date of birth', 'birth date'],
  address: [],
  phoneNumber: ['phone'],
  state: [],
  zipCode: ['zip'],
  email: ['email address'],
  gender: [],
  userType: [],
  accountName: ['account'],
  categoryName: ['category', 'lob'],
  companyName: ['company', 'carrier'],
  policyNumber: [],
  policyStartDate: ['start date'],
  policyEndDate: ['end date'],
};
const requiredFields = ['firstName', 'categoryName', 'companyName', 'policyNumber'];
const dateFields = new Set(['dob', 'policyStartDate', 'policyEndDate']);
const headerKey = (value) => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
const fieldByHeader = new Map();
for (const [field, alternatives] of Object.entries(aliases)) {
  for (const name of [field, ...alternatives]) fieldByHeader.set(headerKey(name), field);
}

function mapHeaders(headers) {
  const seen = new Set();
  const mapping = Array.from(headers, (header) => {
    const field = fieldByHeader.get(headerKey(header));
    if (field && seen.has(field)) throw new Error(`Duplicate column for ${field}`);
    if (field) seen.add(field);
    return field;
  });
  for (const field of requiredFields) {
    if (!seen.has(field)) throw new Error(`Missing required column: ${field}`);
  }
  return mapping;
}

function mapRow(values, mapping) {
  const row = {};
  mapping.forEach((field, index) => {
    if (field) row[field] = dateFields.has(field) ? parseDate(values[index]) : text(values[index]);
  });
  for (const field of requiredFields) {
    if (!row[field]) throw new Error(`Missing required value: ${field}`);
  }
  if (row.email) {
    row.email = row.email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) throw new Error('Invalid email');
  }
  if (row.policyStartDate && row.policyEndDate && row.policyEndDate < row.policyStartDate) {
    throw new Error('Policy end date precedes start date');
  }
  return row;
}

module.exports = { mapHeaders, mapRow };
