import { Worker, Booking, Cooperative, User, Review, Payout } from '../models/index.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { ok, paginated } from '../utils/respond.js';
import { BOOKING_STATUS, VERIFICATION_STATUS } from '../config/constants.js';
import { notifyVerification } from '../services/notification.service.js';
import { buildSettlement, commitSettlement, releasePayout } from '../services/payout.service.js';
import { revenueTrend, workforceGaps, zoneHeatmap } from '../services/forecast.service.js';
import { decorateWorkers } from '../utils/decorate.js';

/** Admin panel overview — the numbers the cooperative board actually asks for. */
export const overview = asyncHandler(async (req, res) => {
  const coopId = req.user.cooperative;
  const scope = coopId ? { cooperative: coopId } : {};
  const since = new Date(Date.now() - 30 * 86400_000);

  const [members, pendingVerification, online, bookingStats, liveJobs, sosOpen, trend, coop] =
    await Promise.all([
      Worker.countDocuments(coopId ? { cooperative: coopId } : {}),
      Worker.countDocuments({
        ...(coopId ? { cooperative: coopId } : {}),
        'verification.status': VERIFICATION_STATUS.PENDING,
      }),
      Worker.countDocuments({
        ...(coopId ? { cooperative: coopId } : {}),
        'availability.isOnline': true,
      }),
      Booking.aggregate([
        { $match: { ...scope, createdAt: { $gte: since } } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            gross: { $sum: '$pricing.total' },
            commission: { $sum: '$pricing.coopCommission' },
            payout: { $sum: '$pricing.workerPayout' },
          },
        },
      ]),
      Booking.countDocuments({
        ...scope,
        status: {
          $in: [
            BOOKING_STATUS.DISPATCHING,
            BOOKING_STATUS.ACCEPTED,
            BOOKING_STATUS.ENROUTE,
            BOOKING_STATUS.ARRIVED,
            BOOKING_STATUS.IN_PROGRESS,
          ],
        },
      }),
      Booking.countDocuments({ ...scope, 'sos.raised': true, 'sos.resolvedAt': null }),
      revenueTrend({ days: 14, cooperative: coopId }),
      coopId ? Cooperative.findById(coopId).lean() : null,
    ]);

  const byStatus = Object.fromEntries(bookingStats.map((r) => [r._id, r.count]));
  const completed = bookingStats.find((r) => r._id === BOOKING_STATUS.COMPLETED);
  const totalBookings = bookingStats.reduce((s, r) => s + r.count, 0);
  const failed = (byStatus.expired || 0) + (byStatus.cancelled || 0);

  return ok(res, {
    cooperative: coop
      ? {
          name: coop.name,
          code: coop.code,
          city: coop.city,
          governance: coop.governance,
          // Virtuals do not survive .lean(), so recompute the pool here.
          dividendPool: Math.max(
            0,
            Math.round(
              coop.stats.commissionEarned * coop.governance.dividendPoolPct -
                coop.stats.dividendsDistributed,
            ),
          ),
          stats: coop.stats,
        }
      : null,
    workforce: { members, online, pendingVerification, offline: members - online },
    operations: {
      liveJobs,
      sosOpen,
      bookings30d: totalBookings,
      completed: completed?.count ?? 0,
      fulfilmentRate: totalBookings ? Math.round(((completed?.count ?? 0) / totalBookings) * 100) : 0,
      failureRate: totalBookings ? Math.round((failed / totalBookings) * 100) : 0,
      byStatus,
    },
    finance: {
      gross30d: Math.round(completed?.gross ?? 0),
      commission30d: Math.round(completed?.commission ?? 0),
      workerPayout30d: Math.round(completed?.payout ?? 0),
      payoutSharePct: completed?.gross
        ? Math.round((completed.payout / completed.gross) * 100)
        : 0,
    },
    trend,
  });
});

/* ------------------------- worker administration ------------------------ */

export const listWorkers = asyncHandler(async (req, res) => {
  const { q, skillTag, status, city, sort, page, limit } = req.query;

  const filter = {};
  if (req.user.cooperative) filter.cooperative = req.user.cooperative;
  if (status) filter['verification.status'] = status;
  if (skillTag) filter['skills.skillTag'] = skillTag;
  if (city) filter.city = new RegExp(`^${city}$`, 'i');
  if (q) filter.displayName = new RegExp(q, 'i');

  const sortMap = {
    rating: { 'rating.average': -1 },
    experience: { experienceYears: -1 },
    jobs: { 'stats.jobsCompleted': -1 },
    rate_asc: { hourlyRate: 1 },
    rate_desc: { hourlyRate: -1 },
  };

  const [items, total] = await Promise.all([
    Worker.find(filter)
      .sort(sortMap[sort] ?? { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name phone email membershipId createdAt')
      .lean(),
    Worker.countDocuments(filter),
  ]);

  return paginated(res, decorateWorkers(items), { page, limit, total });
});

/**
 * Verification decision. This is the cooperative's core governance act — it is
 * members admitting members, which is why it is scoped to the admin's own coop
 * and recorded with the deciding user's id.
 */
export const setVerification = asyncHandler(async (req, res) => {
  const { status, note, backgroundCheckClear } = req.body;

  const filter = { _id: req.params.id };
  if (req.user.cooperative) filter.cooperative = req.user.cooperative;

  const worker = await Worker.findOne(filter);
  if (!worker) throw ApiError.notFound('Worker not found in your cooperative');

  const wasVerified = worker.verification.status === VERIFICATION_STATUS.VERIFIED;

  worker.verification.status = status;
  worker.verification.note = note;
  worker.verification.verifiedBy = req.user._id;
  worker.verification.verifiedAt = new Date();
  if (backgroundCheckClear !== undefined) {
    worker.verification.backgroundCheckClear = backgroundCheckClear;
  }

  // A suspended or rejected member must not stay in the dispatch pool.
  if (status !== VERIFICATION_STATUS.VERIFIED) worker.availability.isOnline = false;
  if (status === VERIFICATION_STATUS.VERIFIED && !worker.badges.includes('coop_verified')) {
    worker.badges.push('coop_verified');
  }

  await worker.save();

  const delta = (status === VERIFICATION_STATUS.VERIFIED ? 1 : 0) - (wasVerified ? 1 : 0);
  if (delta !== 0) {
    await Cooperative.updateOne(
      { _id: worker.cooperative },
      { $inc: { 'stats.verifiedCount': delta } },
    );
  }

  await notifyVerification(worker.user, status, note);
  return ok(res, worker);
});

export const reviewDocument = asyncHandler(async (req, res) => {
  const { docId } = req.params;
  const { status, note } = req.body;

  const worker = await Worker.findById(req.params.id);
  if (!worker) throw ApiError.notFound('Worker not found');

  const doc = worker.verification.documents.id(docId);
  if (!doc) throw ApiError.notFound('Document not found');

  doc.status = status;
  doc.note = note;
  doc.reviewedAt = new Date();
  await worker.save();

  return ok(res, worker.verification);
});

/* ------------------------------ bookings ------------------------------- */

export const listBookings = asyncHandler(async (req, res) => {
  const { status, page, limit } = req.query;

  const filter = {};
  if (req.user.cooperative) filter.cooperative = req.user.cooperative;
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customer', 'name phone')
      .populate('worker', 'displayName')
      .populate('service', 'name icon')
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/** Open SOS alerts — the top item on the admin panel when non-empty. */
export const listSos = asyncHandler(async (req, res) => {
  const filter = { 'sos.raised': true, 'sos.resolvedAt': null };
  if (req.user.cooperative) filter.cooperative = req.user.cooperative;

  const items = await Booking.find(filter)
    .sort({ 'sos.raisedAt': -1 })
    .populate('customer', 'name phone')
    .populate('worker', 'displayName')
    .lean();

  return ok(res, items);
});

export const resolveSos = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking?.sos?.raised) throw ApiError.notFound('No open SOS on this booking');

  booking.sos.resolvedAt = new Date();
  booking.pushTimeline(booking.status, 'admin', `SOS resolved: ${req.body.reason || 'handled'}`);
  await booking.save();

  return ok(res, booking.sos);
});

/* ------------------------------ settlement ----------------------------- */

export const previewSettlement = asyncHandler(async (req, res) => {
  const coopId = req.body.cooperativeId || req.user.cooperative;
  if (!coopId) throw ApiError.badRequest('cooperativeId is required');
  return ok(res, await buildSettlement(coopId, req.body));
});

export const runSettlement = asyncHandler(async (req, res) => {
  const coopId = req.body.cooperativeId || req.user.cooperative;
  if (!coopId) throw ApiError.badRequest('cooperativeId is required');
  return ok(res, await commitSettlement(coopId, req.user._id, req.body));
});

export const listPayouts = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.cooperative) filter.cooperative = req.user.cooperative;

  const items = await Payout.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('worker', 'displayName photo')
    .lean();

  return ok(res, items);
});

export const approvePayout = asyncHandler(async (req, res) =>
  ok(res, await releasePayout(req.params.id, req.user._id)),
);

/* ------------------------------- insights ------------------------------ */

export const workforceReport = asyncHandler(async (req, res) => {
  const coop = req.user.cooperative ? await Cooperative.findById(req.user.cooperative) : null;
  return ok(res, await workforceGaps({ city: coop?.city }));
});

export const heatmap = asyncHandler(async (req, res) => ok(res, await zoneHeatmap(req.query)));

export const flaggedReviews = asyncHandler(async (req, res) => {
  const items = await Review.find({ $or: [{ isFlagged: true }, { rating: { $lte: 2 } }] })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('worker', 'displayName')
    .populate('customer', 'name')
    .lean();

  return ok(res, items);
});
