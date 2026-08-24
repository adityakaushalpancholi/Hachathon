import { Booking, Worker, Cooperative, Payout, User } from '../models/index.js';
import { BOOKING_STATUS } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { txnRef } from '../utils/ids.js';
import { notifyPayout } from './notification.service.js';
import { logger } from '../utils/logger.js';

const isoWeekLabel = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

/**
 * Build a settlement run for a cooperative.
 *
 * Two components make up a member's payout:
 *
 *   1. Job earnings  — the `workerPayout` line from every booking they completed
 *                      in the period, already net of commission and platform fee.
 *   2. Dividend      — their share of the cooperative's undistributed commission
 *                      pool. This is the part that does not exist on an
 *                      investor-owned platform: the margin comes back to the
 *                      people who generated it.
 *
 * Dividend is apportioned by contribution (each member's share of the period's
 * gross), not equally, so a member who worked more receives more — a rule the
 * general body sets and can change.
 */
export async function buildSettlement(cooperativeId, { from, to } = {}) {
  const coop = await Cooperative.findById(cooperativeId);
  if (!coop) throw ApiError.notFound('Cooperative not found');

  const periodTo = to ? new Date(to) : new Date();
  const periodFrom = from ? new Date(from) : new Date(periodTo.getTime() - 7 * 86400_000);
  const label = isoWeekLabel(periodTo);

  const rows = await Booking.aggregate([
    {
      $match: {
        cooperative: coop._id,
        status: BOOKING_STATUS.COMPLETED,
        'otp.completeVerifiedAt': { $gte: periodFrom, $lte: periodTo },
      },
    },
    {
      $group: {
        _id: '$worker',
        bookings: { $push: '$_id' },
        jobs: { $sum: 1 },
        gross: { $sum: '$pricing.total' },
        net: { $sum: '$pricing.workerPayout' },
        commission: { $sum: '$pricing.coopCommission' },
        platformFee: { $sum: '$pricing.platformFee' },
      },
    },
  ]);

  if (!rows.length) {
    return { cooperative: coop.name, period: { label, from: periodFrom, to: periodTo }, lines: [], totals: null };
  }

  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const dividendPool = Math.round(totalCommission * coop.governance.dividendPoolPct);

  const lines = rows.map((r) => {
    const share = totalGross ? r.gross / totalGross : 0;
    const dividendShare = Math.round(dividendPool * share);
    return {
      worker: r._id,
      bookings: r.bookings,
      jobs: r.jobs,
      gross: Math.round(r.gross),
      coopCommission: Math.round(r.commission),
      platformFee: Math.round(r.platformFee),
      earnings: Math.round(r.net),
      dividendShare,
      net: Math.round(r.net) + dividendShare,
      contributionPct: Math.round(share * 1000) / 10,
    };
  });

  return {
    cooperative: coop.name,
    cooperativeId: coop._id,
    period: { label, from: periodFrom, to: periodTo },
    lines: lines.sort((a, b) => b.net - a.net),
    totals: {
      members: lines.length,
      jobs: lines.reduce((s, l) => s + l.jobs, 0),
      gross: Math.round(totalGross),
      commission: Math.round(totalCommission),
      dividendPool,
      payable: lines.reduce((s, l) => s + l.net, 0),
    },
  };
}

/** Persist a settlement as draft Payout documents, ready for admin approval. */
export async function commitSettlement(cooperativeId, adminId, { from, to } = {}) {
  const settlement = await buildSettlement(cooperativeId, { from, to });
  if (!settlement.lines.length) throw ApiError.badRequest('No completed jobs in this period');

  const created = [];
  for (const line of settlement.lines) {
    // Idempotent: re-running the same period updates the draft rather than
    // creating a duplicate, which the unique (worker, period.label) index enforces.
    const payout = await Payout.findOneAndUpdate(
      { worker: line.worker, 'period.label': settlement.period.label },
      {
        $set: {
          cooperative: cooperativeId,
          period: settlement.period,
          bookings: line.bookings,
          gross: line.gross,
          coopCommission: line.coopCommission,
          platformFee: line.platformFee,
          dividendShare: line.dividendShare,
          net: line.net,
          status: 'draft',
          approvedBy: adminId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    created.push(payout);
  }

  logger.info(`settlement ${settlement.period.label}: ${created.length} draft payouts`);
  return { settlement, payouts: created };
}

/** Approve and disburse. Moves money off the worker's pending balance. */
export async function releasePayout(payoutId, adminId) {
  const payout = await Payout.findById(payoutId);
  if (!payout) throw ApiError.notFound('Payout not found');
  if (payout.status === 'paid') throw ApiError.conflict('This payout is already settled');

  payout.status = 'paid';
  payout.approvedBy = adminId;
  payout.paidAt = new Date();
  payout.reference = txnRef('PAY');
  await payout.save();

  const worker = await Worker.findById(payout.worker);
  if (worker) {
    // Job earnings leave the pending balance; the dividend is additive, so it is
    // recorded separately rather than deducted from anything.
    const jobEarnings = payout.net - payout.dividendShare;
    worker.earnings.pendingPayout = Math.max(0, worker.earnings.pendingPayout - jobEarnings);
    worker.earnings.dividendsReceived += payout.dividendShare;
    await worker.save();
    await notifyPayout(worker.user, payout);
  }

  await Cooperative.updateOne(
    { _id: payout.cooperative },
    { $inc: { 'stats.dividendsDistributed': payout.dividendShare } },
  );

  return payout;
}

/** A member's own earnings view: this month, pending, and recent settlements. */
export async function workerEarnings(workerId) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [worker, thisMonth, recent, payouts] = await Promise.all([
    Worker.findById(workerId).lean(),
    Booking.aggregate([
      {
        $match: {
          worker: workerId,
          status: BOOKING_STATUS.COMPLETED,
          'otp.completeVerifiedAt': { $gte: monthStart },
        },
      },
      { $group: { _id: null, jobs: { $sum: 1 }, earned: { $sum: '$pricing.workerPayout' } } },
    ]),
    Booking.aggregate([
      { $match: { worker: workerId, status: BOOKING_STATUS.COMPLETED } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$otp.completeVerifiedAt' } },
          jobs: { $sum: 1 },
          earned: { $sum: '$pricing.workerPayout' },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 14 },
    ]),
    Payout.find({ worker: workerId }).sort({ 'period.to': -1 }).limit(6).lean(),
  ]);

  if (!worker) throw ApiError.notFound('Worker profile not found');

  const month = thisMonth[0] || { jobs: 0, earned: 0 };

  // Daily incentive target, Rapido-style: hit N jobs, unlock a bonus.
  const dailyTarget = 5;
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = recent.find((r) => r._id === today);

  return {
    lifetime: Math.round(worker.earnings.lifetime),
    thisMonth: Math.round(month.earned),
    jobsThisMonth: month.jobs,
    pendingPayout: Math.round(worker.earnings.pendingPayout),
    dividendsReceived: Math.round(worker.earnings.dividendsReceived),
    today: {
      jobs: todayRow?.jobs ?? 0,
      earned: Math.round(todayRow?.earned ?? 0),
      target: dailyTarget,
      progress: Math.min(100, Math.round(((todayRow?.jobs ?? 0) / dailyTarget) * 100)),
      bonusUnlocked: (todayRow?.jobs ?? 0) >= dailyTarget,
      bonusAmount: 150,
    },
    daily: recent
      .map((r) => ({ date: r._id, jobs: r.jobs, earned: Math.round(r.earned) }))
      .reverse(),
    payouts,
  };
}
