import { Booking, Worker, Service, Cooperative, User } from '../models/index.js';
import {
  BOOKING_STATUS,
  BOOKING_TYPE,
  PAYMENT_STATUS,
  STATUS_TRANSITIONS,
} from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { bookingCode, otpCode, txnRef } from '../utils/ids.js';
import { toPoint } from '../utils/geo.js';
import { buildPricing, computeSurge, cancellationFee, emergencySurchargeFor } from './pricing.service.js';
import { dispatchBooking, dispatchToWorker } from './dispatch.service.js';
import { notifyBookingUpdate, notifyPayment } from './notification.service.js';

/** Guard every state change against the transition table in constants.js. */
export function assertTransition(from, to) {
  const allowed = STATUS_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw ApiError.conflict(`Illegal transition: ${from} → ${to}`, { allowed });
  }
}

/**
 * Price a booking without creating it — powers the live quote on the booking
 * form, so the customer sees surge and the payout split before committing.
 */
export async function quote({ serviceId, packageName, coordinates, zone, city, type, couponCode, addOns = [] }) {
  const service = await Service.findById(serviceId);
  if (!service || !service.isActive) throw ApiError.notFound('Service not available');

  const pkg = packageName ? service.packages.find((p) => p.name === packageName) : null;
  if (packageName && !pkg) throw ApiError.badRequest(`Unknown package '${packageName}'`);

  const basePrice = pkg?.price ?? service.basePrice;

  // Surge is a property of the zone the job is in, not of the worker.
  const surge = await computeSurge({ skillTag: service.skillTag, zone, city });

  const pricing = buildPricing({
    basePrice,
    surgeMultiplier: surge.multiplier,
    emergencySurcharge: emergencySurchargeFor(service, type),
    addOns,
    couponCode,
  });

  return {
    service: {
      id: service._id,
      name: service.name,
      icon: service.icon,
      checklist: service.checklist,
      equipment: service.equipment,
    },
    package: pkg
      ? { name: pkg.name, durationMins: pkg.durationMins, includes: pkg.includes }
      : null,
    durationMins: pkg?.durationMins ?? service.baseDurationMins,
    surge,
    pricing,
  };
}

export async function createBooking(customer, payload) {
  const {
    serviceId,
    packageName,
    address,
    scheduledFor,
    type = BOOKING_TYPE.STANDARD,
    notes,
    couponCode,
    addOns = [],
    paymentMethod = 'upi',
    preferredWorkerId,
  } = payload;

  const service = await Service.findById(serviceId);
  if (!service || !service.isActive) throw ApiError.notFound('Service not available');

  if (type === BOOKING_TYPE.EMERGENCY && !service.emergencyAvailable) {
    throw ApiError.badRequest(`${service.name} is not offered as an emergency service`);
  }

  const location = toPoint(address.location ?? address.coordinates);
  if (!location) throw ApiError.badRequest('A valid service location is required');

  const pkg = packageName ? service.packages.find((p) => p.name === packageName) : null;
  if (packageName && !pkg) throw ApiError.badRequest(`Unknown package '${packageName}'`);

  const when =
    type === BOOKING_TYPE.EMERGENCY ? new Date() : new Date(scheduledFor || Date.now());
  if (Number.isNaN(when.getTime())) throw ApiError.badRequest('scheduledFor is not a valid date');
  if (type === BOOKING_TYPE.SCHEDULED && when < new Date(Date.now() - 60_000)) {
    throw ApiError.badRequest('Scheduled bookings must be in the future');
  }

  const surge = await computeSurge({
    skillTag: service.skillTag,
    zone: address.zone,
    city: address.city,
  });

  const pricing = buildPricing({
    basePrice: pkg?.price ?? service.basePrice,
    surgeMultiplier: surge.multiplier,
    emergencySurcharge: emergencySurchargeFor(service, type),
    addOns,
    couponCode,
  });

  const booking = await Booking.create({
    code: bookingCode(),
    customer: customer._id,
    service: service._id,
    serviceName: service.name,
    skillTag: service.skillTag,
    packageName: pkg?.name,
    notes,
    type,
    status: BOOKING_STATUS.PENDING,
    address: { ...address, location },
    scheduledFor: when,
    durationMins: pkg?.durationMins ?? service.baseDurationMins,
    pricing,
    payment: { method: paymentMethod, status: PAYMENT_STATUS.PENDING },
    otp: { start: otpCode(), complete: otpCode() },
    timeline: [{ status: BOOKING_STATUS.PENDING, by: 'customer', at: new Date(), note: 'Booking created' }],
  });

  await Service.updateOne({ _id: service._id }, { $inc: { 'stats.bookings': 1 } });

  // Immediate and emergency jobs go out now; future-dated ones wait for the
  // scheduler to bring them forward as their slot approaches.
  const dispatchNow =
    type === BOOKING_TYPE.EMERGENCY || when.getTime() - Date.now() < 30 * 60_000;

  if (!dispatchNow) return booking;

  // "Book this professional" short-circuits the auction: the offer goes only to
  // the requested member, and the expiry sweeper falls back to a broadcast if
  // they let it lapse.
  if (preferredWorkerId) {
    const preferred = await Worker.findById(preferredWorkerId);
    if (preferred?.isBookable) {
      await dispatchToWorker(booking._id, preferred._id);
      return Booking.findById(booking._id);
    }
  }

  await dispatchBooking(booking._id, { round: 1 });
  return Booking.findById(booking._id);
}

/** Generic worker-driven status advance (enroute → arrived). */
export async function advanceStatus(booking, to, actor, note) {
  assertTransition(booking.status, to);
  booking.status = to;
  booking.pushTimeline(to, actor, note);
  await booking.save();
  return booking;
}

/**
 * Start the job. The customer reads out a 4-digit code — this is what stops a
 * worker marking a job started from the other side of the city, and it is the
 * anchor for the on-time statistic.
 */
export async function startJob(bookingId, workerId, code) {
  const booking = await Booking.findOne({ _id: bookingId, worker: workerId }).select('+otp.start');
  if (!booking) throw ApiError.notFound('Booking not found or not assigned to you');

  assertTransition(booking.status, BOOKING_STATUS.IN_PROGRESS);

  if (String(code) !== booking.otp.start) {
    throw ApiError.badRequest('Incorrect start code — ask the customer to read it again');
  }

  booking.status = BOOKING_STATUS.IN_PROGRESS;
  booking.otp.startVerifiedAt = new Date();
  booking.pushTimeline(BOOKING_STATUS.IN_PROGRESS, 'worker', 'Start code verified');
  await booking.save();

  // On time = started within 15 minutes of the promised slot.
  const lateMs = booking.otp.startVerifiedAt - booking.scheduledFor;
  if (lateMs <= 15 * 60_000) {
    await Worker.updateOne({ _id: workerId }, { $inc: { 'stats.onTimeCount': 1 } });
  }

  await notifyBookingUpdate(booking.customer, booking, 'Work has started', `${booking.serviceName} · ${booking.code}`);
  return booking;
}

/**
 * Complete the job and settle the money.
 *
 * This is the only place worker earnings and cooperative ledgers move, so the
 * accounting stays in one auditable block.
 */
export async function completeJob(bookingId, workerId, code) {
  const booking = await Booking.findOne({ _id: bookingId, worker: workerId }).select('+otp.complete');
  if (!booking) throw ApiError.notFound('Booking not found or not assigned to you');

  assertTransition(booking.status, BOOKING_STATUS.COMPLETED);

  if (String(code) !== booking.otp.complete) {
    throw ApiError.badRequest('Incorrect completion code');
  }

  const now = new Date();
  booking.status = BOOKING_STATUS.COMPLETED;
  booking.otp.completeVerifiedAt = now;
  booking.payment.status = PAYMENT_STATUS.PAID;
  booking.payment.paidAt = now;
  booking.payment.txnId = booking.payment.txnId || txnRef();
  booking.pushTimeline(BOOKING_STATUS.COMPLETED, 'worker', 'Completion code verified');
  await booking.save();

  const { workerPayout, coopCommission, total } = booking.pricing;

  await Worker.updateOne(
    { _id: workerId },
    {
      $inc: {
        'stats.jobsCompleted': 1,
        'earnings.lifetime': workerPayout,
        'earnings.thisMonth': workerPayout,
        'earnings.pendingPayout': workerPayout,
      },
      $set: { 'availability.activeBooking': null },
    },
  );

  if (booking.cooperative) {
    await Cooperative.updateOne(
      { _id: booking.cooperative },
      {
        $inc: {
          'stats.jobsCompleted': 1,
          'stats.grossVolume': total,
          'stats.commissionEarned': coopCommission,
        },
      },
    );
  }

  await notifyPayment(booking.customer, booking);
  await notifyBookingUpdate(
    booking.customer,
    booking,
    'Job completed — rate your experience',
    `${booking.serviceName} by your cooperative member`,
  );

  return booking;
}

export async function cancelBooking(booking, actor, reason) {
  if ([BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(booking.status)) {
    throw ApiError.conflict(`Booking is already ${booking.status}`);
  }

  const fee = actor === 'customer' ? cancellationFee(booking) : 0;

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancellation = { by: actor, reason, at: new Date(), feeCharged: fee };
  booking.pushTimeline(BOOKING_STATUS.CANCELLED, actor, reason);
  await booking.save();

  if (booking.worker) {
    await Worker.updateOne(
      { _id: booking.worker },
      {
        $set: { 'availability.activeBooking': null },
        ...(actor === 'worker' ? { $inc: { 'stats.jobsCancelled': 1 } } : {}),
      },
    );

    const worker = await Worker.findById(booking.worker).select('user displayName');
    if (worker && actor !== 'worker') {
      await notifyBookingUpdate(worker.user, booking, 'Booking cancelled', reason || 'The customer cancelled this job');
    }
    if (worker && actor === 'worker') {
      await notifyBookingUpdate(
        booking.customer,
        booking,
        'Your worker cancelled — finding a replacement',
        reason || '',
      );
      // Give the customer another shot rather than a dead end.
      booking.status = BOOKING_STATUS.PENDING;
      booking.worker = null;
      await booking.save();
      await dispatchBooking(booking._id, { round: (booking.dispatch.round || 0) + 1 });
    }
  }

  return booking;
}

export async function raiseSos(booking, raisedBy) {
  booking.sos = { raised: true, raisedBy, raisedAt: new Date() };
  booking.pushTimeline(booking.status, raisedBy, 'SOS raised');
  await booking.save();

  const admins = await User.find({ role: 'admin' }).select('_id');
  const { notifySos } = await import('./notification.service.js');
  await notifySos(admins.map((a) => a._id), booking, raisedBy);

  return booking;
}
