import mongoose from 'mongoose';
import { pointSchema } from './User.js';
import { VERIFICATION_STATUS } from '../config/constants.js';

/**
 * Worker profile — the professional identity attached to a `User` with role
 * `worker`. Kept separate from `User` because it is queried on completely
 * different axes (geo + skill + availability) and carries a 2dsphere index that
 * the dispatch engine hits on every booking.
 */
const documentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['aadhaar', 'pan', 'police_verification', 'skill_certificate', 'bank'], required: true },
    number: { type: String, trim: true }, // masked at rest in the seed; real PII belongs in a vault
    fileUrl: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    note: { type: String, trim: true },
    reviewedAt: { type: Date },
  },
  { _id: true },
);

const workerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    cooperative: { type: mongoose.Schema.Types.ObjectId, ref: 'Cooperative', required: true, index: true },

    // Denormalised for list rendering — avoids populating User on every search hit.
    displayName: { type: String, required: true, trim: true },
    photo: { type: String },
    bio: { type: String, trim: true },
    languages: { type: [String], default: ['hi', 'en'] },

    skills: [
      {
        service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
        skillTag: { type: String, required: true, index: true },
        level: { type: String, enum: ['apprentice', 'skilled', 'expert'], default: 'skilled' },
        yearsExperience: { type: Number, default: 1 },
      },
    ],

    hourlyRate: { type: Number, required: true, min: 0 },
    experienceYears: { type: Number, default: 1 },

    verification: {
      status: {
        type: String,
        enum: Object.values(VERIFICATION_STATUS),
        default: VERIFICATION_STATUS.PENDING,
        index: true,
      },
      documents: { type: [documentSchema], default: [] },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      verifiedAt: { type: Date },
      note: { type: String, trim: true },
      backgroundCheckClear: { type: Boolean, default: false },
    },

    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
      // Tag frequencies, e.g. { punctual: 42, polite: 31 } — powers the profile chips.
      tagCounts: { type: Map, of: Number, default: {} },
    },

    stats: {
      jobsCompleted: { type: Number, default: 0 },
      jobsCancelled: { type: Number, default: 0 },
      offersReceived: { type: Number, default: 0 },
      offersAccepted: { type: Number, default: 0 },
      onTimeCount: { type: Number, default: 0 },
      repeatCustomers: { type: Number, default: 0 },
      responseSeconds: { type: Number, default: 0 }, // rolling average
    },

    earnings: {
      lifetime: { type: Number, default: 0 },
      thisMonth: { type: Number, default: 0 },
      pendingPayout: { type: Number, default: 0 },
      dividendsReceived: { type: Number, default: 0 },
    },

    availability: {
      isOnline: { type: Boolean, default: false, index: true },
      // Rapido-style: a worker holding an active job is not offered another.
      activeBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
      workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] }, // 0=Sun
      shiftStart: { type: String, default: '08:00' },
      shiftEnd: { type: String, default: '20:00' },
      acceptsEmergency: { type: Boolean, default: false },
    },

    location: { type: pointSchema, required: true },
    serviceRadiusKm: { type: Number, default: 8, min: 1, max: 50 },
    baseArea: { type: String, trim: true },
    city: { type: String, trim: true, index: true },

    badges: { type: [String], default: [] }, // e.g. 'top_rated', 'coop_trained', 'quick_responder'
    trainingCompleted: { type: [String], default: [] },

    joinedCoopAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

// The index the dispatch engine depends on.
workerSchema.index({ location: '2dsphere' });
workerSchema.index({ 'skills.skillTag': 1, 'verification.status': 1, 'availability.isOnline': 1 });
workerSchema.index({ 'rating.average': -1, 'stats.jobsCompleted': -1 });

workerSchema.virtual('acceptanceRate').get(function () {
  const { offersReceived, offersAccepted } = this.stats;
  if (!offersReceived) return 0;
  return Math.round((offersAccepted / offersReceived) * 100);
});

workerSchema.virtual('onTimeRate').get(function () {
  const { jobsCompleted, onTimeCount } = this.stats;
  if (!jobsCompleted) return 0;
  return Math.round((onTimeCount / jobsCompleted) * 100);
});

workerSchema.virtual('isBookable').get(function () {
  return (
    this.verification.status === VERIFICATION_STATUS.VERIFIED &&
    this.availability.isOnline &&
    !this.availability.activeBooking
  );
});

export const Worker = mongoose.model('Worker', workerSchema);
