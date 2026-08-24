import { Booking, Worker } from '../models/index.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { ok, created, paginated } from '../utils/respond.js';
import {
  quote as quoteBooking,
  createBooking,
  cancelBooking,
  raiseSos,
} from '../services/booking.service.js';
import { dispatchBooking } from '../services/dispatch.service.js';
import { BOOKING_STATUS, PAYMENT_STATUS } from '../config/constants.js';
import { txnRef } from '../utils/ids.js';
import { notifyBookingUpdate } from '../services/notification.service.js';

/** Live price quote — no booking created, no side effects. */
export const getQuote = asyncHandler(async (req, res) => {
  const { serviceId, packageName, location, zone, city, type, couponCode, addOns } = req.body;

  const result = await quoteBooking({
    serviceId,
    packageName,
    coordinates: [location.lng, location.lat],
    zone,
    city,
    type,
    couponCode,
    addOns,
  });

  return ok(res, result);
});

export const create = asyncHandler(async (req, res) =>
  created(res, await createBooking(req.user, req.body)),
);

export const listMine = asyncHandler(async (req, res) => {
  const { status, live, page, limit } = req.query;

  const filter = { customer: req.user._id };
  if (status) filter.status = status;
  if (live) {
    filter.status = {
      $in: [
        BOOKING_STATUS.PENDING,
        BOOKING_STATUS.DISPATCHING,
        BOOKING_STATUS.ACCEPTED,
        BOOKING_STATUS.ENROUTE,
        BOOKING_STATUS.ARRIVED,
        BOOKING_STATUS.IN_PROGRESS,
      ],
    };
  }

  const [items, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('service', 'name icon category')
      .populate({ path: 'worker', select: 'displayName photo rating hourlyRate', populate: { path: 'cooperative', select: 'name code' } })
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/**
 * Booking detail. The start OTP is deliberately included for the customer —
 * they are the one who reads it out — but never for anyone else.
 */
export const getOne = asyncHandler(async (req, res) => {
  const isOwner = { customer: req.user._id };
  const query = Booking.findOne({ _id: req.params.id, ...isOwner })
    .populate('service', 'name icon category checklist equipment')
    .populate({
      path: 'worker',
      select: 'displayName photo rating stats hourlyRate location languages badges',
      populate: { path: 'cooperative', select: 'name code city' },
    })
    .populate('review');

  const booking = await query.select('+otp.start +otp.complete');
  if (!booking) throw ApiError.notFound('Booking not found');

  const json = booking.toObject({ virtuals: true });
  // Only expose the completion code once work is actually underway.
  if (booking.status !== BOOKING_STATUS.IN_PROGRESS) delete json.otp?.complete;

  return ok(res, json);
});

/** Live tracking payload — polled by the customer's tracking screen. */
export const track = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id })
    .select('code status timeline dispatch scheduledFor address worker serviceName')
    .populate('worker', 'displayName photo location rating')
    .lean();

  if (!booking) throw ApiError.notFound('Booking not found');

  const candidate = booking.dispatch?.candidates?.find(
    (c) => String(c.worker) === String(booking.worker?._id),
  );

  return ok(res, {
    code: booking.code,
    status: booking.status,
    serviceName: booking.serviceName,
    scheduledFor: booking.scheduledFor,
    timeline: booking.timeline,
    destination: booking.address.location,
    worker: booking.worker
      ? {
          id: booking.worker._id,
          name: booking.worker.displayName,
          photo: booking.worker.photo,
          rating: booking.worker.rating,
          location: booking.worker.location,
          etaMins: candidate?.etaMins ?? null,
          distanceKm: candidate?.distanceKm ?? null,
        }
      : null,
    dispatch: {
      round: booking.dispatch?.round ?? 0,
      candidatesNotified: booking.dispatch?.candidates?.length ?? 0,
      expiresAt: booking.dispatch?.expiresAt ?? null,
    },
  });
});

export const cancel = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id });
  if (!booking) throw ApiError.notFound('Booking not found');
  return ok(res, await cancelBooking(booking, 'customer', req.body.reason));
});

/** Manual re-dispatch when the customer would rather wait than cancel. */
export const retry = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id });
  if (!booking) throw ApiError.notFound('Booking not found');

  if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.EXPIRED].includes(booking.status)) {
    throw ApiError.conflict('This booking is not waiting for a worker');
  }

  const result = await dispatchBooking(booking._id, { round: (booking.dispatch.round || 0) + 1 });
  return ok(res, { booking: result.booking, notified: result.candidates.length, radiusKm: result.radiusKm });
});

/**
 * Payment capture.
 *
 * A real deployment swaps the body of this handler for a Razorpay/PayU order +
 * webhook confirmation. The booking's payment sub-document is already shaped for
 * that: `txnId` holds the gateway reference and `status` mirrors its lifecycle.
 */
export const pay = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id });
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.payment.status === PAYMENT_STATUS.PAID) {
    throw ApiError.conflict('This booking is already paid');
  }

  booking.payment.method = req.body.method;
  booking.payment.status = PAYMENT_STATUS.PAID;
  booking.payment.txnId = txnRef();
  booking.payment.paidAt = new Date();
  await booking.save();

  if (booking.worker) {
    const worker = await Worker.findById(booking.worker).select('user');
    if (worker) {
      await notifyBookingUpdate(
        worker.user,
        booking,
        `Payment confirmed · ₹${booking.pricing.workerPayout} to you`,
        booking.code,
      );
    }
  }

  return ok(res, { payment: booking.payment, pricing: booking.pricing });
});

export const sos = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({
    _id: req.params.id,
    $or: [{ customer: req.user._id }, { worker: req.workerProfile?._id }],
  });
  if (!booking) throw ApiError.notFound('Booking not found');

  const raisedBy = String(booking.customer) === String(req.user._id) ? 'customer' : 'worker';
  return ok(res, await raiseSos(booking, raisedBy));
});

/** Customer panel summary — one call on mount. */
export const customerDashboard = asyncHandler(async (req, res) => {
  const [live, upcoming, past, stats] = await Promise.all([
    Booking.find({
      customer: req.user._id,
      status: {
        $in: [
          BOOKING_STATUS.PENDING,
          BOOKING_STATUS.DISPATCHING,
          BOOKING_STATUS.ACCEPTED,
          BOOKING_STATUS.ENROUTE,
          BOOKING_STATUS.ARRIVED,
          BOOKING_STATUS.IN_PROGRESS,
        ],
      },
    })
      .sort({ createdAt: -1 })
      .populate('service', 'name icon')
      .populate('worker', 'displayName photo rating')
      .lean(),
    Booking.find({
      customer: req.user._id,
      status: BOOKING_STATUS.ACCEPTED,
      scheduledFor: { $gt: new Date() },
    })
      .sort({ scheduledFor: 1 })
      .limit(5)
      .populate('service', 'name icon')
      .lean(),
    Booking.find({ customer: req.user._id, status: BOOKING_STATUS.COMPLETED })
      .sort({ createdAt: -1 })
      .limit(6)
      .populate('service', 'name icon')
      .populate('worker', 'displayName photo')
      .populate('review', 'rating')
      .lean(),
    Booking.aggregate([
      { $match: { customer: req.user._id, status: BOOKING_STATUS.COMPLETED } },
      {
        $group: {
          _id: null,
          jobs: { $sum: 1 },
          spent: { $sum: '$pricing.total' },
          toWorkers: { $sum: '$pricing.workerPayout' },
          saved: { $sum: '$pricing.discount' },
        },
      },
    ]),
  ]);

  const s = stats[0] || { jobs: 0, spent: 0, toWorkers: 0, saved: 0 };

  return ok(res, {
    live,
    upcoming,
    past,
    stats: {
      jobs: s.jobs,
      spent: Math.round(s.spent),
      saved: Math.round(s.saved),
      // The headline number of the cooperative model, shown to the customer.
      toWorkers: Math.round(s.toWorkers),
      toWorkersPct: s.spent ? Math.round((s.toWorkers / s.spent) * 100) : 0,
    },
  });
});
