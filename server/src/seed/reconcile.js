import { Cooperative, Worker, Booking } from '../models/index.js';
import { BOOKING_STATUS, VERIFICATION_STATUS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Recompute each company's cached counters from the collections they summarise.
 *
 * `Cooperative.stats` is denormalised — a copy kept so a landing page does not
 * aggregate the whole booking collection on every request. Denormalised numbers
 * drift: they are maintained by `$inc` at a dozen call sites, and any path that
 * deletes rows without decrementing leaves a figure with nothing behind it. The
 * purge did exactly that, and the result was a live site advertising 34
 * professionals and 443 completed jobs to an empty database.
 *
 * Cheap enough to run on every boot — one grouped aggregation per collection
 * over a handful of companies — and it makes the counters self-healing rather
 * than something to remember to fix by hand.
 */
export async function reconcileCompanyStats({ quiet = false } = {}) {
  const companies = await Cooperative.find().select('_id name stats').lean();
  if (!companies.length) return { reconciled: 0 };

  const byId = (rows) => new Map(rows.map((r) => [String(r._id), r]));

  const [workers, verified, jobs, ratings] = await Promise.all([
    Worker.aggregate([{ $group: { _id: '$cooperative', n: { $sum: 1 } } }]),
    Worker.aggregate([
      { $match: { 'verification.status': VERIFICATION_STATUS.VERIFIED } },
      { $group: { _id: '$cooperative', n: { $sum: 1 } } },
    ]),
    Booking.aggregate([
      { $match: { status: BOOKING_STATUS.COMPLETED } },
      {
        $group: {
          _id: '$cooperative',
          n: { $sum: 1 },
          gross: { $sum: '$pricing.total' },
          commission: { $sum: '$pricing.coopCommission' },
        },
      },
    ]),
    Worker.aggregate([
      { $match: { 'rating.count': { $gt: 0 } } },
      { $group: { _id: '$cooperative', avg: { $avg: '$rating.average' } } },
    ]),
  ]);

  const [w, v, j, r] = [byId(workers), byId(verified), byId(jobs), byId(ratings)];

  let changed = 0;

  for (const company of companies) {
    const id = String(company._id);
    const next = {
      memberCount: w.get(id)?.n ?? 0,
      verifiedCount: v.get(id)?.n ?? 0,
      jobsCompleted: j.get(id)?.n ?? 0,
      grossVolume: Math.round(j.get(id)?.gross ?? 0),
      commissionEarned: Math.round(j.get(id)?.commission ?? 0),
      avgRating: Math.round((r.get(id)?.avg ?? 0) * 10) / 10,
    };

    // Only write where something actually moved, so a healthy boot is a read.
    const drifted = Object.entries(next).filter(
      ([key, value]) => (company.stats?.[key] ?? 0) !== value,
    );
    if (!drifted.length) continue;

    await Cooperative.updateOne(
      { _id: company._id },
      { $set: Object.fromEntries(Object.entries(next).map(([k, val]) => [`stats.${k}`, val])) },
    );
    changed += 1;

    if (!quiet) {
      logger.info(
        `reconciled ${company.name}: ${drifted
          .map(([k, val]) => `${k} ${company.stats?.[k] ?? 0}→${val}`)
          .join(', ')}`,
      );
    }
  }

  return { reconciled: changed };
}
