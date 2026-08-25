import mongoose from 'mongoose';
import { PAYMENT_STATUS } from '../config/constants.js';

/**
 * A payment attempt against a booking, as the gateway sees it.
 *
 * Kept separate from Booking because a booking has one price but can have
 * several payment attempts — a failed card, a retry, a later refund — and
 * folding that history into the booking would either lose it or turn one
 * document into an append-only log that grows without limit.
 *
 * Only the gateway's own identifiers and amounts are stored. Card numbers,
 * UPI handles and bank details never reach this server: Razorpay Checkout
 * collects them in its own iframe, and what comes back is an order id, a
 * payment id and a signature.
 */
const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    provider: { type: String, enum: ['razorpay'], default: 'razorpay' },

    /** Paise, as the gateway counts. Storing rupees invites float error. */
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    orderId: { type: String, required: true, index: true },
    paymentId: { type: String, index: true, sparse: true },
    signature: { type: String },

    status: {
      type: String,
      enum: [
        PAYMENT_STATUS.CREATED,
        PAYMENT_STATUS.PAID,
        PAYMENT_STATUS.FAILED,
        PAYMENT_STATUS.REFUNDED,
      ],
      default: PAYMENT_STATUS.CREATED,
      index: true,
    },

    /** Whatever the gateway said went wrong, for support to read. */
    failureReason: { type: String, trim: true, maxlength: 300 },
    method: { type: String, trim: true, maxlength: 40 },

    paidAt: { type: Date },
    refundedAt: { type: Date },
  },
  { timestamps: true },
);

/** One live order per booking — a retry supersedes rather than accumulates. */
paymentSchema.index({ booking: 1, status: 1 });

/**
 * Abandoned orders clear themselves after a day.
 *
 * Most orders that are never paid are simply a closed tab, and each one is a
 * row nobody will read again. Settled and failed records are kept — those are
 * the financial history — so the TTL is filtered to `created` only.
 */
paymentSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 86400,
    partialFilterExpression: { status: PAYMENT_STATUS.CREATED },
    name: 'abandoned_order_ttl',
  },
);

export const Payment = mongoose.model('Payment', paymentSchema);
