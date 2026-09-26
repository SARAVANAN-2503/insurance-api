const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { collection: 'accounts', timestamps: true }
);

accountSchema.index({ user: 1, normalizedName: 1 }, { unique: true });

module.exports = mongoose.model('Account', accountSchema);
