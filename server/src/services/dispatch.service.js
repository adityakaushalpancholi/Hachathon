import mongoose from 'mongoose';
import { Booking, Worker, Cooperative } from '../models/index.js';
import { env } from '../config/env.js';
import { BOOKING_STATUS, BOOKING_TYPE } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { findWithExpandingRadius } from './matching.service.js';
import { haversineKm, estimateEtaMins } from '../utils/geo.js';
import { notifyJobOffer, notifyBookingUpdate } from './notification.service.js';
import { logger } from '../utils/logger.js';

const MAX_ROUNDS = 3;

/**
 * Broadcast dispatch.
 *
 * The job is offered simultaneously to the top-N ranked workers in range and the
 * first to accept wins it — the same shape Rapido uses for captains. The
 * alternative (sequential offers with a per-worker timeout) is fairer-looking
 * but adds N × timeout to the customer's wait, which is unacceptable for an
 * emergency plumbing call.
 *
 * If nobody responds inside the window, `expireDispatch` re-broadcasts to a
 * wider radius, excluding everyone who already declined.
 */
export async function dispatchBooking(bookingId, { round = 1 } = {}) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found');

  if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.EXPIRED, BOOKING_STATUS.DISPATCHING].includes(booking.status)) {
    throw ApiError.conflict(`Cannot dispatch a booking in state '${booking.status}'`);
  }

  const isEmergency = booking.type === BOOKING_TYPE.EMERGENCY;
  const baseRadius = isEmergency ? env.emergencyRadiusKm : env.dispatchRadiusKm;

  // Anyone who already declined or timed out this booking is not asked again.
  const alreadyOffered = booking.dispatch.candidates
    .filter((c) => c.response !== 'pending')
    .map((c) => c.worker);

  const { workers, radiusKm } = await findWithExpandingRadius({
    coordinates: booking.address.location.coordinates,
    skillTag: booking.skillTag,
    radiusKm: baseRadius * (1 + (round - 1) * 0.5),
    limit: env.dispatchCandidates,
    requireOnline: true,
    requireEmergency: isEmergency,
    excludeWorkerIds: alreadyOffered,
  });

  if (!workers.length) {
    booking.status = BOOKING_STATUS.PENDING;
    booking.pushTimeline(
      BOOKING_STATUS.PENDING,
      'system',
      `No available worker within ${radiusKm} km (round ${round})`,
    );
    await booking.save();
    return { booking, candidates: [], exhausted: true, radiusKm };
  }

  const expiresAt = new Date(Date.now() + env.dispatchWindowSec * 1000);

  booking.status = BOOKING_STATUS.DISPATCHING;
  booking.dispatch.round = round;
  booking.dispatch.radiusKm = radiusKm;
  booking.dispatch.expiresAt = expiresAt;
  booking.dispatch.candidates.push(
    ...workers.map((w) => ({
      worker: w._id,
      distanceKm: w.distanceKm,
      etaMins: w.etaMins,
      score: w.matchScore,
      notifiedAt: new Date(),
      response: 'pending',
    })),
  );
  booking.pushTimeline(
    BOOKING_STATUS.DISPATCHING,
    'system',
    `Offered to ${workers.length} worker(s) within ${radiusKm} km`,
  );
  await booking.save();

  await Worker.updateMany(
    { _id: { $in: workers.map((w) => w._id) } },
    { $inc: { 'stats.offersReceived': 1 } },
  );

  await notifyJobOffer(workers.map((w) => w._id), booking, expiresAt);

  logger.info(`dispatch ${booking.code}: round ${round}, ${workers.length} candidates, ${radiusKm}km`);

  return { booking, candidates: workers, exhausted: false, radiusKm };
}

/**
 * Claim a job.
 *
 * The race between two workers tapping Accept at the same instant is resolved by
 * a single conditional update: the filter requires `worker: null` and status
 * `dispatching`, so MongoDB's document-level atomicity makes exactly one of them
 * the winner. No transaction or lock needed.
 */
export async function acceptOffer(bookingId, workerId) {
  const worker = await Worker.findById(workerId);
  if (!worker) throw ApiError.notFound('Worker profile not found');
  if (worker.availability.activeBooking) {
    throw ApiError.conflict('Finish your current job before accepting another');
  }

  const now = new Date();

  const booking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      status: BOOKING_STATUS.DISPATCHING,
      worker: null,
      'dispatch.expiresAt': { $gt: now },
      'dispatch.candidates.worker': new mongoose.Types.ObjectId(String(workerId)),
    },
    {
      $set: {
        worker: worker._id,
        cooperative: worker.cooperative,
        status: BOOKING_STATUS.ACCEPTED,
        'dispatch.acceptedAt': now,
        'dispatch.candidates.$[mine].response': 'accepted',
        'dispatch.candidates.$[mine].respondedAt': now,
      },
      $push: {
        timeline: {
          status: BOOKING_STATUS.ACCEPTED,
          by: 'worker',
          at: now,
          note: `Accepted by ${worker.displayName}`,
        },
      },
    },
    {
      new: true,
      arrayFilters: [{ 'mine.worker': new mongoose.Types.ObjectId(String(workerId)) }],
    },
  );

  if (!booking) {
    // Distinguish "someone beat you to it" from "you were never offered this".
    const current = await Booking.findById(bookingId).select('status worker dispatch.expiresAt');
    if (!current) throw ApiError.notFound('Booking not found');
    if (current.worker) throw ApiError.conflict('This job was just taken by another member');
    if (current.dispatch?.expiresAt && current.dispatch.expiresAt <= now) {
      throw ApiError.conflict('This offer has expired');
    }
    throw ApiError.forbidden('This job was not offered to you');
  }

  // Mark the losers, so their inbox reflects reality.
  await Booking.updateOne(
    { _id: booking._id },
    { $set: { 'dispatch.candidates.$[others].response': 'timeout', 'dispatch.candidates.$[others].respondedAt': now } },
    { arrayFilters: [{ 'others.response': 'pending' }] },
  );

  const responseSecs = booking.dispatch.candidates.find(
    (c) => String(c.worker) === String(workerId),
  );
  const elapsed = responseSecs ? Math.round((now - responseSecs.notifiedAt) / 1000) : 0;

  worker.availability.activeBooking = booking._id;
  worker.stats.offersAccepted += 1;
  // Rolling average of response latency, used for the 'quick_responder' badge.
  const n = worker.stats.offersAccepted;
  worker.stats.responseSeconds = Math.round(
    (worker.stats.responseSeconds * (n - 1) + elapsed) / n,
  );
  await worker.save();

  await notifyBookingUpdate(
    booking.customer,
    booking,
    `${worker.displayName} accepted your booking`,
    `Arriving in about ${responseSecs?.etaMins ?? 20} minutes · ${booking.code}`,
  );

  logger.success(`dispatch ${booking.code}: accepted by ${worker.displayName} in ${elapsed}s`);
  return booking;
}

export async function declineOffer(bookingId, workerId, reason) {
  const now = new Date();
  const booking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      status: BOOKING_STATUS.DISPATCHING,
      'dispatch.candidates.worker': new mongoose.Types.ObjectId(String(workerId)),
    },
    {
      $set: {
        'dispatch.candidates.$[mine].response': 'declined',
        'dispatch.candidates.$[mine].respondedAt': now,
        'dispatch.candidates.$[mine].declineReason': reason,
      },
    },
    { new: true, arrayFilters: [{ 'mine.worker': new mongoose.Types.ObjectId(String(workerId)) }] },
  );

  if (!booking) throw ApiError.notFound('No pending offer found for you on this booking');

  // Everyone declined — do not make the customer wait out the timer.
  const stillPending = booking.dispatch.candidates.some((c) => c.response === 'pending');
  if (!stillPending && booking.dispatch.round < MAX_ROUNDS) {
    await dispatchBooking(booking._id, { round: booking.dispatch.round + 1 });
  }

  return booking;
}

/**
 * Sweep expired dispatch windows. Called on an interval by the scheduler; also
 * safe to invoke directly from a test.
 */
export async function expireStaleDispatches() {
  const now = new Date();
  const stale = await Booking.find({
    status: BOOKING_STATUS.DISPATCHING,
    'dispatch.expiresAt': { $lte: now },
  }).select('_id code dispatch customer serviceName');

  if (!stale.length) return { expired: 0, redispatched: 0 };

  let redispatched = 0;

  for (const booking of stale) {
    await Booking.updateOne(
      { _id: booking._id, status: BOOKING_STATUS.DISPATCHING },
      {
        $set: {
          status: BOOKING_STATUS.EXPIRED,
          'dispatch.candidates.$[p].response': 'timeout',
          'dispatch.candidates.$[p].respondedAt': now,
        },
        $push: {
          timeline: {
            status: BOOKING_STATUS.EXPIRED,
            by: 'system',
            at: now,
            note: `Dispatch round ${booking.dispatch.round} timed out`,
          },
        },
      },
      { arrayFilters: [{ 'p.response': 'pending' }] },
    );

    if (booking.dispatch.round < MAX_ROUNDS) {
      try {
        await dispatchBooking(booking._id, { round: booking.dispatch.round + 1 });
        redispatched += 1;
      } catch (err) {
        logger.warn(`re-dispatch failed for ${booking.code}: ${err.message}`);
      }
    } else {
      await notifyBookingUpdate(
        booking.customer,
        booking,
        'No worker available right now',
        `We could not match your ${booking.serviceName} request. Try a wider time slot.`,
      );
    }
  }

  logger.info(`dispatch sweep: ${stale.length} expired, ${redispatched} re-dispatched`);
  return { expired: stale.length, redispatched };
}

/**
 * Targeted dispatch — the customer picked one specific worker from a profile
 * page (Urban Company's "book this professional"). The offer goes only to them
 * and gets a longer window, since there is no auction racing it.
 */
export async function dispatchToWorker(bookingId, workerId) {
  const [booking, worker] = await Promise.all([
    Booking.findById(bookingId),
    Worker.findById(workerId),
  ]);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (!worker) throw ApiError.notFound('Worker not found');

  const distanceKm = haversineKm(
    booking.address.location.coordinates,
    worker.location.coordinates,
  );
  const expiresAt = new Date(Date.now() + env.dispatchWindowSec * 2 * 1000);

  booking.status = BOOKING_STATUS.DISPATCHING;
  booking.dispatch.round = 1;
  booking.dispatch.radiusKm = Math.round(distanceKm * 10) / 10;
  booking.dispatch.expiresAt = expiresAt;
  booking.dispatch.candidates.push({
    worker: worker._id,
    distanceKm: Math.round(distanceKm * 100) / 100,
    etaMins: estimateEtaMins(distanceKm),
    score: 1,
    notifiedAt: new Date(),
    response: 'pending',
  });
  booking.pushTimeline(
    BOOKING_STATUS.DISPATCHING,
    'customer',
    `Requested ${worker.displayName} directly`,
  );
  await booking.save();

  await Worker.updateOne({ _id: worker._id }, { $inc: { 'stats.offersReceived': 1 } });
  await notifyJobOffer([worker._id], booking, expiresAt);

  logger.info(`dispatch ${booking.code}: direct request to ${worker.displayName}`);
  return booking;
}

/** Live offers for a worker's inbox, newest first. */
export async function pendingOffersFor(workerId) {
  return Booking.find({
    status: BOOKING_STATUS.DISPATCHING,
    'dispatch.expiresAt': { $gt: new Date() },
    'dispatch.candidates': {
      $elemMatch: { worker: new mongoose.Types.ObjectId(String(workerId)), response: 'pending' },
    },
  })
    .populate('service', 'name icon category checklist equipment')
    .populate('customer', 'name phone')
    .sort({ 'dispatch.expiresAt': 1 })
    .lean();
}

export { MAX_ROUNDS };
