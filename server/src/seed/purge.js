import {
  User,
  Worker,
  Booking,
  Review,
  Notification,
  Payout,
  Otp,
} from '../models/index.js';
import { logger } from '../utils/logger.js';

/**
 * Fingerprint of a database whose people are fictional.
 *
 * The demo seed clears every collection before it writes, so a database bearing
 * this mark contains demo data and nothing else — there is no mixture to sort
 * through. The mark is the seeded board account: a specific number carrying a
 * specific cooperative address, a pair no real signup produces. Requiring both
 * is what keeps this from firing on a live database where someone happens to
 * hold that number.
 */
const DEMO_MARKS = [
  { phone: '9876500001', email: 'anjali@mumbaikaamgaar.coop' },
  { phone: '9876500002', email: 'vikram@thaneshramik.coop' },
];

/** Collections the demo seed invents. Cooperatives and services are not here: */
/*  they are the catalogue a real launch needs, and the non-demo seed writes    */
/*  exactly the same rows, so they are kept.                                    */
const INVENTED = [
  ['users', User],
  ['workers', Worker],
  ['bookings', Booking],
  ['reviews', Review],
  ['notifications', Notification],
  ['payouts', Payout],
  ['login codes', Otp],
];

/** Does this database still carry the demo seed's mark? */
export async function hasDemoData() {
  return Boolean(await User.findOne({ $or: DEMO_MARKS }).select('_id').lean());
}

/**
 * Remove the demo population, leaving the catalogue.
 *
 * This deletes people, so it will not run on a database it cannot positively
 * identify as seeded fiction — `force` exists for the case where the marker
 * account was deleted by hand but the rest of the fiction remains, and it is
 * the caller's job to be sure.
 *
 * Idempotent: running it twice is the same as running it once.
 */
export async function purgeDemoData({ force = false, quiet = false } = {}) {
  const log = quiet ? () => {} : (...a) => logger.info(...a);

  if (!force && !(await hasDemoData())) {
    log('no demo data found — nothing to purge');
    return { purged: false, deleted: {} };
  }

  const deleted = {};
  for (const [label, Model] of INVENTED) {
    deleted[label] = (await Model.deleteMany({})).deletedCount ?? 0;
  }

  log(
    `purged demo data — ${Object.entries(deleted)
      .map(([k, n]) => `${n} ${k}`)
      .join(', ')}`,
  );

  return { purged: true, deleted };
}
