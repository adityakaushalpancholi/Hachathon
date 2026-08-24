import mongoose from 'mongoose';
import { REVIEW_TAGS } from '../config/constants.js';

const reviewSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true, index: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },

    rating: { type: Number, required: true, min: 1, max: 5 },
    tags: { type: [String], enum: REVIEW_TAGS, default: [] },
    comment: { type: String, trim: true, maxlength: 1000 },
    photos: { type: [String], default: [] },

    // Worker's right of reply — a fairness affordance the coop insisted on.
    response: {
      text: { type: String, trim: true, maxlength: 500 },
      at: { type: Date },
    },

    isFlagged: { type: Boolean, default: false },
    flagReason: { type: String, trim: true },
  },
  { timestamps: true },
);

reviewSchema.index({ worker: 1, createdAt: -1 });

export const Review = mongoose.model('Review', reviewSchema);
