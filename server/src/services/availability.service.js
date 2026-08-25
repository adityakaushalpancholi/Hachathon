import { Booking } from '../models/index.js';
import { BOOKING_STATUS } from '../config/constants.js';
import { env } from '../config/env.js';

/**
 * Is a professional actually free at a given moment?
 *
 * Two questions the ranking engine never asked. Both were already modelled and
 * simply never read: `availability.workingDays` / `shiftStart` / `shiftEnd` sat
 * on the Worker document, and a scheduled booking held a slot nothing checked.
 * The result was a 10pm job offered to someone whose shift ends at six, and two
 * customers given the same 3pm.
 *
 * Only applied to scheduled work. A job happening *now* is already filtered by
 * `availability.isOnline`, which is a stronger signal than any roster — someone
 * online outside their usual hours has chosen to be.
 */

/** How long a job blocks the diary, absent a better estimate. */
const DEFAULT_JOB_MINUTES = 90;

/** Minutes since midnight, in the deployment's reporting timezone. */
function minutesOfDay(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: env.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return hour * 60 + minute;
}

/** Day of week, 0=Sunday, in the deployment's timezone rather than the server's. */
function weekdayIn(date) {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: env.timezone,
    weekday: 'short',
  }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

const toMinutes = (hhmm, fallback) => {
  const [h, m] = String(hhmm ?? '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : fallback;
};

/**
 * Does this moment fall inside the professional's declared roster?
 *
 * A shift whose end is before its start has crossed midnight, and the window
 * has to wrap with it — otherwise a 20:00–04:00 night shift matches nothing at
 * all, which is precisely when emergency work happens.
 */
export function isWithinShift(worker, when) {
  const availability = worker?.availability ?? {};
  const days = availability.workingDays;

  if (Array.isArray(days) && days.length && !days.includes(weekdayIn(when))) return false;

  const start = toMinutes(availability.shiftStart, 0);
  const end = toMinutes(availability.shiftEnd, 24 * 60);
  const at = minutesOfDay(when);

  return start <= end ? at >= start && at <= end : at >= start || at <= end;
}

/**
 * Which of these professionals already have work booked over the window?
 *
 * One query for the whole candidate pool rather than one per candidate — this
 * runs inside ranking, where a per-worker round trip would turn a single
 * dispatch into dozens.
 */
export async function busyWorkerIds(workerIds, when, minutes = DEFAULT_JOB_MINUTES) {
  if (!workerIds.length) return new Set();

  const start = new Date(when);
  const end = new Date(start.getTime() + minutes * 60_000);

  // A booking blocks the slot if its own window overlaps this one. Held slots
  // include work already accepted or under way; cancelled and completed do not.
  const clashes = await Booking.find({
    worker: { $in: workerIds },
    status: {
      $in: [
        BOOKING_STATUS.ACCEPTED,
        BOOKING_STATUS.ENROUTE,
        BOOKING_STATUS.ARRIVED,
        BOOKING_STATUS.IN_PROGRESS,
      ],
    },
    scheduledFor: {
      $gte: new Date(start.getTime() - minutes * 60_000),
      $lt: end,
    },
  })
    .select('worker')
    .lean();

  return new Set(clashes.map((b) => String(b.worker)));
}
