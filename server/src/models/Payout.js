import mongoose from 'mongoose';

/**
 * A settlement run. Worker earnings accrue per completed booking and are swept
 * into a Payout on the coop's settlement cycle, together with the member's share
 * of the dividend pool.
 */
const payoutSchema = new mongoose.Schema(
  {
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true, index: true },
    cooperative: { type: mongoose.Schema.Types.ObjectId, ref: 'Cooperative', required: true, index: true },

    period: {
      label: { type: String, required: true }, // '2026-W12' or '2026-03'
      from: { type: Date, required: true },
      to: { type: Date, required: true },
    },

    bookings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],

    gross: { type: Number, required: true, default: 0 },
    coopCommission: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    adjustments: [{ label: String, amount: Number }],
    dividendShare: { type: Number, default: 0 },
    net: { type: Number, required: true, default: 0 },

    status: {
      type: String,
      enum: ['draft', 'approved', 'paid', 'failed'],
      default: 'draft',
      index: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paidAt: { type: Date },
    reference: { type: String, trim: true },
  },
  { timestamps: true },
);

payoutSchema.index({ worker: 1, 'period.label': 1 }, { unique: true });

export const Payout = mongoose.model('Payout', payoutSchema);
