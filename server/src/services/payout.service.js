import { Booking, Worker, Cooperative, Payout, User } from '../models/index.js';
import { BOOKING_STATUS } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { txnRef } from '../utils/ids.js';
import { notifyPayout } from './notification.service.js';
import { logger } from '../utils/logger.js';
import { TZ, localDateKey, lastNDateKeys } from '../utils/datetime.js';

const isoWeekLabel = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

/**
 * Build a settlement run for one company over a period.
 *
 * A professional's payout is the `workerPayout` line from every booking they
 * completed in the period — already net of commission and platform fee, since
 * the split is computed once at booking time and never recomputed here.
 * Recomputing it at settlement would let a later change to the commission rate
 * silently rewrite what someone was told they would earn.
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

  const lines = rows.map((r) => {
    const share = totalGross ? r.gross / totalGross : 0;
    return {
      worker: r._id,
      bookings: r.bookings,
      jobs: r.jobs,
      gross: Math.round(r.gross),
      coopCommission: Math.round(r.commission),
      platformFee: Math.round(r.platformFee),
      earnings: Math.round(r.net),
      net: Math.round(r.net),
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
    // Settling clears what was owed — the money has actually moved now.
    worker.earnings.pendingPayout = Math.max(0, worker.earnings.pendingPayout - payout.net);
    worker.earnings.totalPaid = (worker.earnings.totalPaid ?? 0) + payout.net;
    await worker.save();
    await notifyPayout(worker.user, payout);
  }

  return payout;
}

/** A member's own earnings view: this month, pending, and recent settlements. */
const EARNINGS_WINDOW_DAYS = 14;

export async function workerEarnings(workerId) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - (EARNINGS_WINDOW_DAYS - 1));
  windowStart.setHours(0, 0, 0, 0);

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
    // A fixed 14-day window, not the last 14 rows: a member who worked
    // sporadically would otherwise get a "last 14 days" chart spanning months.
    Booking.aggregate([
      {
        $match: {
          worker: workerId,
          status: BOOKING_STATUS.COMPLETED,
          'otp.completeVerifiedAt': { $gte: windowStart },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$otp.completeVerifiedAt', timezone: TZ },
          },
          jobs: { $sum: 1 },
          earned: { $sum: '$pricing.workerPayout' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Payout.find({ worker: workerId }).sort({ 'period.to': -1 }).limit(6).lean(),
  ]);

  if (!worker) throw ApiError.notFound('Worker profile not found');

  const month = thisMonth[0] || { jobs: 0, earned: 0 };

  // Fill the gaps, so the chart has a bar for every day rather than only for
  // days that happened to have work. A zero day is information.
  const byDate = new Map(recent.map((r) => [r._id, r]));
  const daily = lastNDateKeys(EARNINGS_WINDOW_DAYS).map((key) => {
    const row = byDate.get(key);
    return { date: key, jobs: row?.jobs ?? 0, earned: Math.round(row?.earned ?? 0) };
  });

  // Daily incentive target, Rapido-style: hit N jobs, unlock a bonus.
  // "Today" is the local day, so the target does not reset at 05:30 IST.
  const dailyTarget = 5;
  const todayRow = byDate.get(localDateKey());

  return {
    lifetime: Math.round(worker.earnings.lifetime),
    thisMonth: Math.round(month.earned),
    jobsThisMonth: month.jobs,
    pendingPayout: Math.round(worker.earnings.pendingPayout),
    today: {
      jobs: todayRow?.jobs ?? 0,
      earned: Math.round(todayRow?.earned ?? 0),
      target: dailyTarget,
      progress: Math.min(100, Math.round(((todayRow?.jobs ?? 0) / dailyTarget) * 100)),
      bonusUnlocked: (todayRow?.jobs ?? 0) >= dailyTarget,
      bonusAmount: 150,
    },
    daily,
    payouts,
  };
}
