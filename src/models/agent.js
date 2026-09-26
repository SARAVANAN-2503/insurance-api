const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true },
  },
  { collection: 'agents', timestamps: true }
);

agentSchema.index({ normalizedName: 1 }, { unique: true });

module.exports = mongoose.model('Agent', agentSchema);
