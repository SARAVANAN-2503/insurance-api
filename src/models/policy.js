const mongoose = require('mongoose');

const policySchema = new mongoose.Schema(
  {
    policyNumber: { type: String, required: true, trim: true },
    startDate: Date,
    endDate: Date,
    lob: { type: mongoose.Schema.Types.ObjectId, ref: 'LOB', required: true },
    carrier: { type: mongoose.Schema.Types.ObjectId, ref: 'Carrier', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
  },
  { collection: 'policies', timestamps: true }
);

policySchema.index({ user: 1 });
policySchema.index({ policyNumber: 1 });
policySchema.index({ carrier: 1, policyNumber: 1 }, { unique: true });

module.exports = mongoose.model('Policy', policySchema);
