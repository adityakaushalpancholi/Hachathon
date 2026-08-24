import mongoose from 'mongoose';
import { pointSchema } from './User.js';
import { env } from '../config/env.js';

/**
 * A worker-owned cooperative. Every worker on ShramSetu belongs to one, and the
 * commission a booking pays flows here rather than to an outside shareholder.
 */
const cooperativeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    registrationNo: { type: String, trim: true }, // state cooperative-society registration
    city: { type: String, required: true, trim: true },
    state: { type: String, trim: true },
    foundedYear: { type: Number },
    about: { type: String, trim: true },
    location: { type: pointSchema },

    contact: {
      phone: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true },
    },

    /**
     * Governance & economics. These are set by member vote, not by the platform,
     * which is why they live on the cooperative rather than in global config.
     */
    governance: {
      commissionPct: { type: Number, default: env.coopCommissionPct, min: 0, max: 0.3 },
      dividendPoolPct: { type: Number, default: env.dividendPoolPct, min: 0, max: 1 },
      // Collectively bargained rate floor — no member may be booked below this.
      minHourlyRate: { type: Number, default: 180 },
      surgeCeiling: { type: Number, default: env.surgeMax },
      lastGeneralBodyMeeting: { type: Date },
    },

    stats: {
      memberCount: { type: Number, default: 0 },
      verifiedCount: { type: Number, default: 0 },
      jobsCompleted: { type: Number, default: 0 },
      grossVolume: { type: Number, default: 0 },
      commissionEarned: { type: Number, default: 0 },
      dividendsDistributed: { type: Number, default: 0 },
      avgRating: { type: Number, default: 0 },
    },

    // Skill-development programmes the coop runs for its members.
    trainingPrograms: [
      {
        name: { type: String, trim: true },
        skill: { type: String, trim: true },
        durationHours: Number,
        certified: { type: Boolean, default: false },
      },
    ],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

cooperativeSchema.index({ location: '2dsphere' });
cooperativeSchema.index({ city: 1, isActive: 1 });

/** Undistributed member dividend pool, in rupees. */
cooperativeSchema.virtual('dividendPool').get(function () {
  const pool = this.stats.commissionEarned * this.governance.dividendPoolPct;
  return Math.max(0, Math.round(pool - this.stats.dividendsDistributed));
});

cooperativeSchema.set('toJSON', { virtuals: true });
cooperativeSchema.set('toObject', { virtuals: true });

export const Cooperative = mongoose.model('Cooperative', cooperativeSchema);
