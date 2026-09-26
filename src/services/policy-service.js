async function searchPolicies(name, page, limit) {
  // Load models after the server connects; database buffering is disabled.
  const User = require('../models/user');
  const [result] = await User.aggregate([
    { $match: { normalizedFirstName: name } },
    { $lookup: { from: 'policies', localField: '_id', foreignField: 'user', as: 'policy' } },
    { $unwind: '$policy' },
    {
      $project: {
        _id: '$policy._id',
        policyNumber: '$policy.policyNumber',
        startDate: { $ifNull: ['$policy.startDate', null] },
        endDate: { $ifNull: ['$policy.endDate', null] },
        user: { id: '$_id', firstName: '$firstName', email: { $ifNull: ['$email', null] } },
        lob: '$policy.lob', carrier: '$policy.carrier', account: '$policy.account', agent: '$policy.agent',
      },
    },
    {
      $facet: {
        totals: [{ $count: 'total' }],
        policies: [
          { $sort: { _id: 1 } },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $lookup: { from: 'lobs', localField: 'lob', foreignField: '_id', as: 'category' } },
          { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'carriers', localField: 'carrier', foreignField: '_id', as: 'carrier' } },
          { $unwind: { path: '$carrier', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'accounts', localField: 'account', foreignField: '_id', as: 'account' } },
          { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'agents', localField: 'agent', foreignField: '_id', as: 'agent' } },
          { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0, id: '$_id', policyNumber: 1, startDate: 1, endDate: 1, user: 1,
              category: { $cond: ['$category._id', { id: '$category._id', name: '$category.name' }, null] },
              carrier: { $cond: ['$carrier._id', { id: '$carrier._id', name: '$carrier.name' }, null] },
              account: { $cond: ['$account._id', { id: '$account._id', name: '$account.name' }, null] },
              agent: { $cond: ['$agent._id', { id: '$agent._id', name: '$agent.name' }, null] },
            },
          },
        ],
      },
    },
  ]);

  const total = result.totals[0]?.total ?? 0;
  return {
    count: result.policies.length,
    policies: result.policies,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function aggregatePolicies() {
  const Policy = require('../models/policy');
  return await Policy.aggregate([
    { $sort: { _id: 1 } },
    { $lookup: { from: 'lobs', localField: 'lob', foreignField: '_id', as: 'category' } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'carriers', localField: 'carrier', foreignField: '_id', as: 'carrier' } },
    { $unwind: { path: '$carrier', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$user',
        totalPolicies: { $sum: 1 },
        policies: {
          $push: {
            policyNumber: '$policyNumber',
            startDate: { $ifNull: ['$startDate', null] },
            endDate: { $ifNull: ['$endDate', null] },
            category: { $ifNull: ['$category.name', null] },
            carrier: { $ifNull: ['$carrier.name', null] },
          },
        },
      },
    },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    {
      $project: {
        _id: 0,
        user: { id: '$user._id', firstName: '$user.firstName', email: { $ifNull: ['$user.email', null] } },
        totalPolicies: 1,
        policies: 1,
      },
    },
    { $sort: { 'user.firstName': 1, 'user.id': 1 } },
  ]);
}

module.exports = { searchPolicies, aggregatePolicies };
