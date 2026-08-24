import { Booking } from '../models/index.js';
import { BOOKING_STATUS, BOOKING_TYPE } from '../config/constants.js';
import { expireStaleDispatches, dispatchBooking } from './dispatch.service.js';
import { logger } from '../utils/logger.js';

/**
 * Background jobs.
 *
 * Deliberately plain `setInterval` rather than a queue: the workload is small,
 * idempotent and safe to miss a beat. Moving to BullMQ/Agenda is a swap of this
 * one file once there is more than one API instance — with several replicas
 * these timers would each fire, so a distributed lock or a real scheduler
 * becomes necessary at that point.
 */

const timers = [];

/** Bring scheduled bookings forward into dispatch as their slot approaches. */
async function dispatchUpcoming() {
  const horizon = new Date(Date.now() + 30 * 60_000);

  const due = await Booking.find({
    status: BOOKING_STATUS.PENDING,
    type: { $ne: BOOKING_TYPE.EMERGENCY },
    scheduledFor: { $lte: horizon },
    'dispatch.round': 0,
  })
    .select('_id code')
    .limit(25);

  for (const booking of due) {
    try {
      await dispatchBooking(booking._id, { round: 1 });
    } catch (err) {
      logger.warn(`scheduled dispatch failed for ${booking.code}: ${err.message}`);
    }
  }

  if (due.length) logger.info(`scheduler: dispatched ${due.length} upcoming booking(s)`);
}

/** Reset the monthly earnings counter on the 1st. */
async function rollMonthlyEarnings() {
  const now = new Date();
  if (now.getDate() !== 1 || now.getHours() !== 0) return;

  const { Worker } = await import('../models/index.js');
  const result = await Worker.updateMany({}, { $set: { 'earnings.thisMonth': 0 } });
  logger.info(`scheduler: reset monthly earnings for ${result.modifiedCount} member(s)`);
}

const safely = (name, fn) => async () => {
  try {
    await fn();
  } catch (err) {
    logger.error(`scheduler:${name} — ${err.message}`);
  }
};

export function startScheduler() {
  timers.push(setInterval(safely('dispatch-sweep', expireStaleDispatches), 15_000));
  timers.push(setInterval(safely('upcoming', dispatchUpcoming), 60_000));
  timers.push(setInterval(safely('month-roll', rollMonthlyEarnings), 60 * 60_000));

  // Do not hold the event loop open on shutdown.
  timers.forEach((t) => t.unref?.());

  logger.success('scheduler started (dispatch sweep 15s · upcoming 60s)');
}

export function stopScheduler() {
  timers.forEach(clearInterval);
  timers.length = 0;
}
