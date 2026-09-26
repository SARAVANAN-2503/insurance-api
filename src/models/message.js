const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    scheduledFor: { type: Date, required: true },
    deliveredAt: { type: Date, required: true },
    schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledMessage', required: true },
  },
  { collection: 'messages', timestamps: true }
);

messageSchema.index({ schedule: 1 }, { unique: true });
messageSchema.index({ deliveredAt: -1, _id: -1 });

module.exports = mongoose.model('Message', messageSchema);
