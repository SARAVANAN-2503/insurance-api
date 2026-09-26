const Agent = require('../models/agent');
const User = require('../models/user');
const Account = require('../models/account');
const LOB = require('../models/lob');
const Carrier = require('../models/carrier');
const Policy = require('../models/policy');
const { normalizeName } = require('../utils/normalize');

const userFields = ['dob', 'address', 'phoneNumber', 'state', 'zipCode', 'gender', 'userType'];

function userIdentity(user) {
  if (user.email) return { email: user.email };
  if (!user.dob && !user.address && !user.phoneNumber) {
    throw new Error('User without email needs DOB, address, or phone number');
  }
  const filter = { normalizedFirstName: user.normalizedFirstName, email: { $in: [null, ''] } };
  for (const field of userFields) filter[field] = user[field] ?? null;
  return filter;
}

async function upsert(model, filter, values) {
  try {
    return await model.findOneAndUpdate(filter, { $setOnInsert: values }, {
      upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const existing = await model.findOne(filter);
    if (!existing) throw err;
    return existing;
  }
}

function hasConflict(existing, incoming, fields) {
  return fields.some((field) => {
    const left = existing[field];
    const right = incoming[field];
    if (left === undefined || left === null || left === '' || right === undefined) return false;
    return left instanceof Date ? left.getTime() !== right.getTime() : String(left) !== String(right);
  });
}

async function namedDocument(model, name) {
  const normalizedName = normalizeName(name);
  return upsert(model, { normalizedName }, { name, normalizedName });
}

async function importRow(row) {
  const userData = { firstName: row.firstName, normalizedFirstName: normalizeName(row.firstName) };
  for (const field of [...userFields, 'email']) {
    if (row[field] !== undefined) userData[field] = row[field];
  }
  const identity = userIdentity(userData);
  const existingUser = await User.findOne(identity);
  if (existingUser && hasConflict(existingUser, userData, ['normalizedFirstName', ...userFields])) {
    return false;
  }
  const user = existingUser || await upsert(User, identity, userData);
  if (hasConflict(user, userData, ['normalizedFirstName', ...userFields])) return false;

  const lob = await namedDocument(LOB, row.categoryName);
  const carrier = await namedDocument(Carrier, row.companyName);
  const policyData = {
    policyNumber: row.policyNumber, user: user._id, lob: lob._id, carrier: carrier._id,
    startDate: row.policyStartDate, endDate: row.policyEndDate,
  };
  if (row.agentName) policyData.agent = (await namedDocument(Agent, row.agentName))._id;
  if (row.accountName) {
    const normalizedName = normalizeName(row.accountName);
    const account = await upsert(Account, { user: user._id, normalizedName }, {
      name: row.accountName, normalizedName, user: user._id,
    });
    policyData.account = account._id;
  }
  const policy = await upsert(Policy, { carrier: carrier._id, policyNumber: row.policyNumber }, policyData);
  return !hasConflict(policy, policyData, ['user', 'lob', 'account', 'agent', 'startDate', 'endDate']);
}

async function initializeModels() {
  for (const model of [Agent, User, Account, LOB, Carrier, Policy]) await model.init();
}

module.exports = { importRow, initializeModels };
