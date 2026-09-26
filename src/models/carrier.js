const mongoose = require('mongoose');

const carrierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true },
  },
  { collection: 'carriers', timestamps: true }
);

carrierSchema.index({ normalizedName: 1 }, { unique: true });

module.exports = mongoose.model('Carrier', carrierSchema);
