const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const request = require('supertest');

require('dotenv').config();
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/insurance_assessment';
const app = require('../src/app');
require('../src/config/database');

const databaseName = `insurance_policy_test_${randomUUID().replace(/-/g, '')}`;
let User;
let john;
let otherJohn;
let jane;

beforeAll(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || process.env.MONGODB_URI, {
    dbName: databaseName, serverSelectionTimeoutMS: 5000,
  });
  User = require('../src/models/user');
  const Policy = require('../src/models/policy');
  const LOB = require('../src/models/lob');
  const Carrier = require('../src/models/carrier');
  const Account = require('../src/models/account');
  const Agent = require('../src/models/agent');
  await Promise.all([User, Policy, LOB, Carrier, Account, Agent].map((model) => model.init()));

  [john, otherJohn, jane] = await User.create([
    { firstName: 'John Smith', normalizedFirstName: 'john smith', email: 'john@example.com' },
    { firstName: 'John Smith', normalizedFirstName: 'john smith', email: 'other@example.com' },
    { firstName: 'Jane', normalizedFirstName: 'jane' },
    { firstName: 'No Policies', normalizedFirstName: 'no policies' },
  ]);
  const category = await LOB.create({ name: 'Auto', normalizedName: 'auto' });
  const carrier = await Carrier.create({ name: 'Example Insurance', normalizedName: 'example insurance' });
  const account = await Account.create({ name: 'Personal', normalizedName: 'personal', user: john._id });
  const agent = await Agent.create({ name: 'Agent A', normalizedName: 'agent a' });
  const common = { lob: category._id, carrier: carrier._id };
  await Policy.create([
    { ...common, policyNumber: 'POL001', user: john._id, account: account._id, agent: agent._id,
      startDate: new Date('2025-01-01'), endDate: new Date('2026-01-01') },
    { ...common, policyNumber: 'POL002', user: john._id },
    { ...common, policyNumber: 'POL003', user: otherJohn._id },
    { ...common, policyNumber: 'POL004', user: jane._id },
  ]);
}, 15000);

afterAll(async () => {
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName) {
      await mongoose.connection.dropDatabase();
    }
  } finally {
    await mongoose.disconnect();
  }
});

describe('GET /api/policies/search', () => {
  test.each(['', '?name=', '?name=%20%20', '?name=John&name=Jane'])('rejects missing or invalid name: %s', async (query) => {
    const response = await request(app).get(`/api/policies/search${query}`).expect(400);
    expect(response.body.error.message).toBeDefined();
  });

  test.each(['page=0', 'page=-1', 'page=1.5', 'page=abc', 'page=1&page=2',
    'limit=0', 'limit=101', 'limit=1.5', 'limit=', 'page=9007199254740991&limit=100'])('rejects invalid pagination: %s', async (query) => {
    await request(app).get(`/api/policies/search?name=Jane&${query}`).expect(400);
  });

  test('returns policy information and optional relationships', async () => {
    const { body } = await request(app).get('/api/policies/search').query({ name: 'John Smith' }).expect(200);
    const policy = body.policies.find((item) => item.policyNumber === 'POL001');
    expect(policy.user).toEqual({ id: john.id, firstName: 'John Smith', email: 'john@example.com' });
    expect(policy.category.name).toBe('Auto');
    expect(policy.carrier.name).toBe('Example Insurance');
    expect(policy.account.name).toBe('Personal');
    expect(policy.agent.name).toBe('Agent A');
    expect(policy.startDate).toBe('2025-01-01T00:00:00.000Z');
    expect(JSON.stringify(body)).not.toContain('normalized');
  });

  test('normalizes case and whitespace and includes both users with the same name', async () => {
    const { body } = await request(app).get('/api/policies/search').query({ name: '  JOHN   Smith  ' }).expect(200);
    expect(body.count).toBe(3);
    expect(new Set(body.policies.map((policy) => policy.user.id))).toEqual(new Set([john.id, otherJohn.id]));
    expect(body.pagination).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
  });

  test.each(['Unknown', 'No Policies', '.*', 'John'])('returns an empty exact-match result for %s', async (name) => {
    const { body } = await request(app).get('/api/policies/search').query({ name }).expect(200);
    expect(body.count).toBe(0);
    expect(body.policies).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });

  test('paginates consistently and preserves the total count beyond the last page', async () => {
    const first = await request(app).get('/api/policies/search').query({ name: 'John Smith', limit: 2 }).expect(200);
    const second = await request(app).get('/api/policies/search').query({ name: 'John Smith', limit: 2, page: 2 }).expect(200);
    expect(first.body.count).toBe(2);
    expect(second.body.count).toBe(1);
    expect(new Set([...first.body.policies, ...second.body.policies].map((policy) => policy.id)).size).toBe(3);
    expect(second.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    const beyond = await request(app).get('/api/policies/search').query({ name: 'John Smith', page: 3, limit: 2 }).expect(200);
    expect(beyond.body.count).toBe(0);
    expect(beyond.body.pagination.total).toBe(3);
  });

  test('retains a policy without optional dates, account, agent, or user email', async () => {
    const { body } = await request(app).get('/api/policies/search').query({ name: 'Jane' }).expect(200);
    expect(body.policies[0]).toMatchObject({ policyNumber: 'POL004', startDate: null, endDate: null,
      account: null, agent: null, user: { id: jane.id, email: null } });
  });

  test('passes unexpected database errors to the centralized handler', async () => {
    const aggregate = jest.spyOn(User, 'aggregate').mockRejectedValueOnce(new Error('Private database detail'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { body } = await request(app).get('/api/policies/search?name=Jane').expect(500);
      expect(body).toEqual({ error: { message: 'Internal server error' } });
    } finally {
      aggregate.mockRestore();
      log.mockRestore();
    }
  });
});

describe('GET /api/policies/aggregate', () => {
  test('groups by user id, counts policies, and includes category and carrier names', async () => {
    const { body } = await request(app).get('/api/policies/aggregate').expect(200);
    expect(body.count).toBe(3);
    const group = body.users.find((item) => item.user.id === john.id);
    expect(group.user).toEqual({ id: john.id, firstName: 'John Smith', email: 'john@example.com' });
    expect(group.totalPolicies).toBe(2);
    expect(group.policies.map((policy) => policy.policyNumber).sort()).toEqual(['POL001', 'POL002']);
    expect(body.users.find((item) => item.user.id === otherJohn.id).totalPolicies).toBe(1);
    expect(body.users.find((item) => item.user.id === jane.id).user.email).toBeNull();
    for (const user of body.users) {
      expect(user.totalPolicies).toBe(user.policies.length);
      for (const policy of user.policies) {
        expect(policy.category).toBe('Auto');
        expect(policy.carrier).toBe('Example Insurance');
      }
    }
    expect(JSON.stringify(body)).not.toContain('normalized');
  });
});
