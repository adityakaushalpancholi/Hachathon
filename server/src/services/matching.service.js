import { Worker } from '../models/index.js';
import { env } from '../config/env.js';
import { VERIFICATION_STATUS } from '../config/constants.js';
import { estimateEtaMins, kmToMeters } from '../utils/geo.js';

/**
 * Ranking weights. Distance dominates — a plumber 2 km away who arrives in
 * fifteen minutes beats a marginally better-rated one across the city — but
 * rating, reliability and the coop's fairness term all move the order.
 */
const WEIGHTS = {
  proximity: 0.4,
  rating: 0.22,
  reliability: 0.15,
  experience: 0.08,
  fairness: 0.15,
};

/**
 * Fairness term — the cooperative's answer to winner-take-all dispatch.
 *
 * On an investor-owned platform the highest-rated worker in a zone absorbs most
 * of the volume and newcomers starve. Here, a member who has worked fewer jobs
 * this month gets a ranking boost, so work spreads across the membership. It is
 * bounded so it can never override a large distance or a poor rating.
 */
function fairnessScore(worker, medianJobs) {
  const done = worker.stats?.jobsCompleted ?? 0;
  if (medianJobs <= 0) return 1;
  const ratio = done / medianJobs;
  if (ratio <= 0.5) return 1; // well below median — full boost
  if (ratio >= 2) return 0; // well above — no boost
  return 1 - (ratio - 0.5) / 1.5;
}

function scoreWorker(worker, distanceKm, radiusKm, medianJobs) {
  const proximity = Math.max(0, 1 - distanceKm / radiusKm);
  const rating = worker.rating?.count ? worker.rating.average / 5 : 0.6; // neutral prior for new members
  const offers = worker.stats?.offersReceived ?? 0;
  const reliability = offers >= 5 ? (worker.stats.offersAccepted ?? 0) / offers : 0.7;
  const experience = Math.min(1, (worker.experienceYears ?? 0) / 10);
  const fairness = fairnessScore(worker, medianJobs);

  const score =
    WEIGHTS.proximity * proximity +
    WEIGHTS.rating * rating +
    WEIGHTS.reliability * reliability +
    WEIGHTS.experience * experience +
    WEIGHTS.fairness * fairness;

  return {
    score: Math.round(score * 1000) / 1000,
    breakdown: { proximity, rating, reliability, experience, fairness },
  };
}

/**
 * Find bookable workers near a point, ranked.
 *
 * Uses a `$geoNear` aggregation so MongoDB does the distance maths against the
 * 2dsphere index rather than us pulling the collection into memory.
 */
export async function findNearbyWorkers({
  coordinates,
  skillTag,
  radiusKm = env.dispatchRadiusKm,
  limit = 20,
  requireOnline = true,
  requireEmergency = false,
  excludeWorkerIds = [],
}) {
  const match = {
    'verification.status': VERIFICATION_STATUS.VERIFIED,
  };
  if (skillTag) match['skills.skillTag'] = skillTag;
  if (requireOnline) {
    match['availability.isOnline'] = true;
    match['availability.activeBooking'] = null;
  }
  if (requireEmergency) match['availability.acceptsEmergency'] = true;
  if (excludeWorkerIds.length) match._id = { $nin: excludeWorkerIds };

  const results = await Worker.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates },
        distanceField: 'distanceMeters',
        maxDistance: kmToMeters(radiusKm),
        spherical: true,
        query: match,
      },
    },
    { $limit: Math.max(limit * 3, 30) }, // over-fetch, then rank
    {
      $lookup: {
        from: 'cooperatives',
        localField: 'cooperative',
        foreignField: '_id',
        as: 'coop',
      },
    },
    { $unwind: { path: '$coop', preserveNullAndEmptyArrays: true } },
  ]);

  if (!results.length) return [];

  // Median completed-jobs count across this candidate pool, for the fairness term.
  const jobCounts = results.map((w) => w.stats?.jobsCompleted ?? 0).sort((a, b) => a - b);
  const medianJobs = jobCounts[Math.floor(jobCounts.length / 2)] || 1;

  return results
    .map((w) => {
      const distanceKm = Math.round((w.distanceMeters / 1000) * 100) / 100;
      // A worker's own service radius is a hard constraint they set themselves.
      if (distanceKm > (w.serviceRadiusKm ?? radiusKm)) return null;

      const { score, breakdown } = scoreWorker(w, distanceKm, radiusKm, medianJobs);
      return {
        ...w,
        distanceKm,
        etaMins: estimateEtaMins(distanceKm),
        matchScore: score,
        matchBreakdown: breakdown,
        cooperativeName: w.coop?.name,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

/**
 * Widening search — if nobody is bookable inside the normal radius, step out
 * before giving up. An emergency job starts wider and steps further.
 */
export async function findWithExpandingRadius(opts) {
  const start = opts.radiusKm ?? env.dispatchRadiusKm;
  const steps = [start, start * 1.75, start * 2.5];

  for (const radiusKm of steps) {
    const workers = await findNearbyWorkers({ ...opts, radiusKm });
    if (workers.length) return { workers, radiusKm: Math.round(radiusKm * 10) / 10 };
  }
  return { workers: [], radiusKm: steps.at(-1) };
}
