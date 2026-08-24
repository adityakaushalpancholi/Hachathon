import mongoose from 'mongoose';
import { pointSchema } from './User.js';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_LIST,
  BOOKING_TYPE,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
} from '../config/constants.js';

/**
 * A dispatch candidate — one worker the job was offered to. Kept as an embedded
 * array so the whole broadcast round is one document read, and so an audit of
 * "who was offered this job and who declined" needs no join.
 */
const candidateSchema = new mongoose.Schema(
  {
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true },
    distanceKm: { type: Number, required: true },
    etaMins: { type: Number },
    score: { type: Number }, // ranking score at offer time
    notifiedAt: { type: Date, default: Date.now },
    respondedAt: { type: Date },
    response: { type: String, enum: ['pending', 'accepted', 'declined', 'timeout'], default: 'pending' },
    declineReason: { type: String, trim: true },
  },
  { _id: false },
);

const timelineSchema = new mongoose.Schema(
  {
    status: { type: String, enum: BOOKING_STATUS_LIST, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String, enum: ['customer', 'worker', 'admin', 'system'], default: 'system' },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true }, // SS-8F2K1
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },
    cooperative: { type: mongoose.Schema.Types.ObjectId, ref: 'Cooperative', default: null, index: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true, index: true },

    serviceName: { type: String, required: true }, // denormalised for list views
    skillTag: { type: String, required: true, index: true },
    packageName: { type: String },
    notes: { type: String, trim: true },

    type: { type: String, enum: Object.values(BOOKING_TYPE), default: BOOKING_TYPE.STANDARD, index: true },
    status: {
      type: String,
      enum: BOOKING_STATUS_LIST,
      default: BOOKING_STATUS.PENDING,
      index: true,
    },

    address: {
      label: String,
      line1: { type: String, required: true },
      landmark: String,
      city: { type: String, required: true },
      pincode: String,
      zone: { type: String, index: true }, // forecasting bucket
      location: { type: pointSchema, required: true },
    },

    scheduledFor: { type: Date, required: true, index: true },
    durationMins: { type: Number, default: 60 },

    /**
     * Full price breakdown, stored rather than recomputed so a historical booking
     * always shows the numbers the customer actually agreed to.
     */
    pricing: {
      base: { type: Number, required: true },
      surgeMultiplier: { type: Number, default: 1 },
      surgeAmount: { type: Number, default: 0 },
      emergencySurcharge: { type: Number, default: 0 },
      addOns: [{ name: String, price: Number }],
      discount: { type: Number, default: 0 },
      couponCode: { type: String, uppercase: true, trim: true },
      subtotal: { type: Number, required: true },
      platformFee: { type: Number, default: 0 },
      coopCommission: { type: Number, default: 0 },
      workerPayout: { type: Number, default: 0 },
      total: { type: Number, required: true },
      currency: { type: String, default: 'INR' },
    },

    payment: {
      method: { type: String, enum: Object.values(PAYMENT_METHOD), default: PAYMENT_METHOD.UPI },
      status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
      txnId: { type: String },
      paidAt: { type: Date },
    },

    /**
     * Two one-time codes, Rapido-style. `start` is read out by the customer so a
     * worker cannot mark a job started remotely; `complete` closes it out and
     * releases the payout.
     */
    otp: {
      start: { type: String, select: false },
      complete: { type: String, select: false },
      startVerifiedAt: { type: Date },
      completeVerifiedAt: { type: Date },
    },

    dispatch: {
      round: { type: Number, default: 0 },
      radiusKm: { type: Number },
      candidates: { type: [candidateSchema], default: [] },
      expiresAt: { type: Date, index: true },
      acceptedAt: { type: Date },
    },

    timeline: { type: [timelineSchema], default: [] },

    // Populated once the customer submits a review.
    review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', default: null },

    cancellation: {
      by: { type: String, enum: ['customer', 'worker', 'admin', 'system'] },
      reason: { type: String, trim: true },
      at: { type: Date },
      feeCharged: { type: Number, default: 0 },
    },

    sos: {
      raised: { type: Boolean, default: false },
      raisedBy: { type: String, enum: ['customer', 'worker'] },
      raisedAt: { type: Date },
      resolvedAt: { type: Date },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

bookingSchema.index({ customer: 1, createdAt: -1 });
bookingSchema.index({ worker: 1, status: 1, scheduledFor: -1 });
bookingSchema.index({ status: 1, 'dispatch.expiresAt': 1 }); // dispatch sweeper
bookingSchema.index({ 'address.location': '2dsphere' });
bookingSchema.index({ skillTag: 1, 'address.zone': 1, createdAt: -1 }); // demand forecasting

bookingSchema.virtual('isLive').get(function () {
  return [
    BOOKING_STATUS.DISPATCHING,
    BOOKING_STATUS.ACCEPTED,
    BOOKING_STATUS.ENROUTE,
    BOOKING_STATUS.ARRIVED,
    BOOKING_STATUS.IN_PROGRESS,
  ].includes(this.status);
});

bookingSchema.methods.pushTimeline = function (status, by = 'system', note) {
  this.timeline.push({ status, by, note, at: new Date() });
};

export const Booking = mongoose.model('Booking', bookingSchema);
