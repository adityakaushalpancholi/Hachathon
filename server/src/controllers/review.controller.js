import { Review, Booking, Worker, Service, Cooperative } from '../models/index.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/respond.js';
import { BOOKING_STATUS } from '../config/constants.js';
import { notifyBookingUpdate } from '../services/notification.service.js';

/**
 * Submit a review.
 *
 * Only the customer on a completed booking may review it, and only once — the
 * unique index on `booking` is the backstop. Ratings recompute the worker's
 * running average incrementally rather than re-aggregating the whole history.
 */
export const create = asyncHandler(async (req, res) => {
  const { bookingId, rating, tags, comment } = req.body;

  const booking = await Booking.findOne({ _id: bookingId, customer: req.user._id });
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.status !== BOOKING_STATUS.COMPLETED) {
    throw ApiError.badRequest('You can only review a completed job');
  }
  if (booking.review) throw ApiError.conflict('You have already reviewed this booking');

  const review = await Review.create({
    booking: booking._id,
    customer: req.user._id,
    worker: booking.worker,
    service: booking.service,
    rating,
    tags,
    comment,
  });

  booking.review = review._id;
  await booking.save();

  const worker = await Worker.findById(booking.worker);
  if (worker) {
    const prevCount = worker.rating.count;
    const nextCount = prevCount + 1;
    worker.rating.average =
      Math.round(((worker.rating.average * prevCount + rating) / nextCount) * 100) / 100;
    worker.rating.count = nextCount;

    for (const tag of tags) {
      worker.rating.tagCounts.set(tag, (worker.rating.tagCounts.get(tag) || 0) + 1);
    }

    // Badge thresholds — earned, and revocable if the average slips.
    const isTopRated = worker.rating.average >= 4.7 && nextCount >= 10;
    const hasBadge = worker.badges.includes('top_rated');
    if (isTopRated && !hasBadge) worker.badges.push('top_rated');
    if (!isTopRated && hasBadge) worker.badges = worker.badges.filter((b) => b !== 'top_rated');

    await worker.save();
    await notifyBookingUpdate(worker.user, booking, `You received a ${rating}★ review`, comment || '');
  }

  // Keep the service-level and cooperative-level averages current.
  const svcAgg = await Review.aggregate([
    { $match: { service: booking.service } },
    { $group: { _id: null, avg: { $avg: '$rating' } } },
  ]);
  if (svcAgg[0]) {
    await Service.updateOne(
      { _id: booking.service },
      { $set: { 'stats.avgRating': Math.round(svcAgg[0].avg * 10) / 10 } },
    );
  }

  if (booking.cooperative) {
    const coopAgg = await Worker.aggregate([
      { $match: { cooperative: booking.cooperative, 'rating.count': { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$rating.average' } } },
    ]);
    if (coopAgg[0]) {
      await Cooperative.updateOne(
        { _id: booking.cooperative },
        { $set: { 'stats.avgRating': Math.round(coopAgg[0].avg * 10) / 10 } },
      );
    }
  }

  return created(res, review);
});

export const listForWorker = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ worker: req.params.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('customer', 'name avatar')
    .lean();

  return ok(res, reviews);
});

export const listMine = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ customer: req.user._id })
    .sort({ createdAt: -1 })
    .populate('worker', 'displayName photo')
    .populate('service', 'name icon')
    .lean();

  return ok(res, reviews);
});
