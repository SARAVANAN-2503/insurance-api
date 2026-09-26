const mongoose = require('mongoose');

const scheduledMessageSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    scheduledFor: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending', required: true },
    deliveredAt: Date,
    lastError: String,
  },
  { collection: 'scheduled_messages', timestamps: true }
);

scheduledMessageSchema.index({ status: 1, scheduledFor: 1 });
scheduledMessageSchema.index({ status: 1, updatedAt: 1 });

module.exports = mongoose.model('ScheduledMessage', scheduledMessageSchema);
