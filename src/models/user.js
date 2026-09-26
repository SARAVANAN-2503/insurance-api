const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    normalizedFirstName: { type: String, required: true, trim: true },
    dob: Date,
    address: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true },
    email: { type: String, trim: true },
    gender: { type: String, trim: true },
    userType: { type: String, trim: true },
  },
  { collection: 'users', timestamps: true }
);

userSchema.index({ normalizedFirstName: 1 });
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string', $gt: '' } },
  }
);

module.exports = mongoose.model('User', userSchema);
