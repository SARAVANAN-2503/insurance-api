const policyService = require('../services/policy-service');
const AppError = require('../utils/app-error');
const { normalizeName } = require('../utils/normalize');

function positiveInteger(value, fallback, field) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new AppError(`${field} must be a positive integer`, 400);
  }
  return Number(value);
}

async function searchPolicies(req, res) {
  if (typeof req.query.name !== 'string' || !req.query.name.trim()) {
    throw new AppError('name must be a nonempty string', 400);
  }
  const name = normalizeName(req.query.name);
  const page = positiveInteger(req.query.page, 1, 'page');
  const limit = positiveInteger(req.query.limit, 20, 'limit');
  if (limit > 100) throw new AppError('limit must not exceed 100', 400);
  if (!Number.isSafeInteger((page - 1) * limit)) throw new AppError('page is too large', 400);

  const result = await policyService.searchPolicies(name, page, limit);
  res.status(200).json(result);
}

async function aggregatePolicies(req, res) {
  const users = await policyService.aggregatePolicies();
  res.status(200).json({ count: users.length, users });
}

module.exports = { searchPolicies, aggregatePolicies };
