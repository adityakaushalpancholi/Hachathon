import { Notification, Cooperative } from '../models/index.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/respond.js';

export const list = asyncHandler(async (req, res) => {
  const items = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const unread = items.filter((n) => !n.read).length;
  return ok(res, items, { unread });
});

export const markRead = asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { read: true, readAt: new Date() } },
    { new: true },
  );
  if (!n) throw ApiError.notFound('Notification not found');
  return ok(res, n);
});

export const markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user._id, read: false },
    { $set: { read: true, readAt: new Date() } },
  );
  return ok(res, { updated: result.modifiedCount });
});

/* Cooperatives are public reference data — used by the worker signup form and
   the "about the coop" panel on a worker profile. */

export const listCooperatives = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.city) filter.city = new RegExp(`^${req.query.city}$`, 'i');

  const items = await Cooperative.find(filter).sort({ 'stats.memberCount': -1 }).lean();

  return ok(
    res,
    items.map((c) => ({
      ...c,
      dividendPool: Math.max(
        0,
        Math.round(
          c.stats.commissionEarned * c.governance.dividendPoolPct - c.stats.dividendsDistributed,
        ),
      ),
    })),
  );
});

export const getCooperative = asyncHandler(async (req, res) => {
  const coop = await Cooperative.findById(req.params.id).lean();
  if (!coop) throw ApiError.notFound('Cooperative not found');
  return ok(res, coop);
});
