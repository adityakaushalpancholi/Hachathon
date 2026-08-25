import { Notification, Worker } from '../models/index.js';
import { NOTIFICATION_TYPE } from '../config/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Notification fan-out.
 *
 * Everything is persisted to Mongo and read back by the client's polling inbox.
 * A production deployment would additionally hand each record to FCM/APNs and a
 * websocket channel — `deliver()` is the single seam where that plugs in.
 */
async function deliver(docs) {
  if (!docs.length) return [];
  const created = await Notification.insertMany(docs);
  logger.debug(`notified ${created.length} recipient(s): ${docs[0].type}`);
  return created;
}

export const notify = (userId, payload) =>
  deliver([{ user: userId, ...payload }]).then((r) => r[0]);

export const notifyMany = (userIds, payload) =>
  deliver(userIds.map((user) => ({ user, ...payload })));

/* ------------------------------------------------------------------ */
/* Domain-specific helpers — one per event the platform actually emits  */
/* ------------------------------------------------------------------ */

export async function notifyJobOffer(workerIds, booking, expiresAt) {
  // Job offers address the worker's *user* account, not the worker profile.
  const workers = await Worker.find({ _id: { $in: workerIds } }).select('user');
  return notifyMany(
    workers.map((w) => w.user),
    {
      type: NOTIFICATION_TYPE.JOB_OFFER,
      title: `New ${booking.serviceName} job`,
      body: `${booking.address.zone || booking.address.city} · ₹${booking.pricing.workerPayout} payout`,
      data: { bookingId: String(booking._id), code: booking.code, action: 'job_offer' },
      expiresAt,
    },
  );
}

export const notifyBookingUpdate = (userId, booking, title, body) =>
  notify(userId, {
    type: NOTIFICATION_TYPE.BOOKING_UPDATE,
    title,
    body,
    data: { bookingId: String(booking._id), code: booking.code, status: booking.status },
  });

export const notifyPayment = (userId, booking) =>
  notify(userId, {
    type: NOTIFICATION_TYPE.PAYMENT,
    title: `Payment received · ₹${booking.pricing.total}`,
    body: `${booking.serviceName} (${booking.code}) settled via ${booking.payment.method.toUpperCase()}`,
    data: { bookingId: String(booking._id), code: booking.code },
  });

export const notifyVerification = (userId, status, note) =>
  notify(userId, {
    type: NOTIFICATION_TYPE.VERIFICATION,
    title:
      status === 'verified'
        ? 'You are verified — you can start accepting jobs'
        : `Verification ${status}`,
    body: note || 'Your cooperative reviewed your documents.',
    data: { status },
  });

export const notifyPayout = (userId, payout) =>
  notify(userId, {
    type: NOTIFICATION_TYPE.PAYOUT,
    title: `Payout ₹${payout.net} for ${payout.period.label}`,
    body: 'Settled to your registered bank account',
    data: { payoutId: String(payout._id) },
  });

/** Someone else changed how far this professional travels — always tell them. */
export const notifyCoverageChange = (userId, changed, note) =>
  notify(userId, {
    type: NOTIFICATION_TYPE.SYSTEM,
    title: 'Your work area was updated',
    body: `${changed}. ${note}`.slice(0, 300),
    data: { changed },
  });

export const notifySos = (userIds, booking, raisedBy) =>
  notifyMany(userIds, {
    type: NOTIFICATION_TYPE.SOS,
    title: 'SOS raised',
    body: `${raisedBy} raised an alert on booking ${booking.code}`,
    data: { bookingId: String(booking._id), code: booking.code },
  });
