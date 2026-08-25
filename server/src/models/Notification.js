import mongoose from 'mongoose';
import { NOTIFICATION_TYPE } from '../config/constants.js';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPE), required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 300 },

    // Deep-link payload the client uses to route on tap. Ids and short strings
    // only — this is a routing hint, not a place to copy a booking into.
    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Job offers expire; the inbox greys them out past this instant.
    expiresAt: { type: Date },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

/**
 * Notifications delete themselves after 60 days.
 *
 * This collection grows with every booking event and nothing ever reads a
 * two-month-old "your professional is on the way". Without expiry it becomes
 * the largest collection in the database and the one carrying the least value.
 * MongoDB's TTL monitor does the deleting, so there is no sweep to schedule and
 * nothing to remember to run.
 */
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 86400, name: 'notification_ttl' },
);

export const Notification = mongoose.model('Notification', notificationSchema);
