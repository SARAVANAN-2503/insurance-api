const mongoose = require('mongoose');

const lobSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true },
  },
  { collection: 'lobs', timestamps: true }
);

lobSchema.index({ normalizedName: 1 }, { unique: true });

module.exports = mongoose.model('LOB', lobSchema);
