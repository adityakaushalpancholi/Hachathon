import { Service, Worker, Review } from '../models/index.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { ok, paginated } from '../utils/respond.js';

export const listServices = asyncHandler(async (req, res) => {
  const { q, category, emergency, page, limit } = req.query;

  const filter = { isActive: true };
  if (category) filter.category = category;
  if (emergency !== undefined) filter.emergencyAvailable = emergency;
  if (q) {
    filter.$or = [
      { name: new RegExp(q, 'i') },
      { tagline: new RegExp(q, 'i') },
      { category: new RegExp(q, 'i') },
      { skillTag: new RegExp(q, 'i') },
    ];
  }

  const [items, total] = await Promise.all([
    Service.find(filter)
      .sort({ displayOrder: 1, 'stats.bookings': -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Service.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

export const getService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id).lean();
  if (!service) throw ApiError.notFound('Service not found');

  // Show a handful of top members qualified for this skill, so the customer can
  // book a specific professional rather than take pot luck.
  const topWorkers = await Worker.find({
    'skills.skillTag': service.skillTag,
    'verification.status': 'verified',
  })
    .sort({ 'rating.average': -1, 'stats.jobsCompleted': -1 })
    .limit(6)
    .populate('cooperative', 'name code')
    .lean();

  return ok(res, { ...service, topWorkers });
});

/** Category tiles for the landing page, with live counts. */
export const listCategories = asyncHandler(async (_req, res) => {
  const rows = await Service.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$category',
        services: { $sum: 1 },
        bookings: { $sum: '$stats.bookings' },
        minPrice: { $min: '$basePrice' },
        icon: { $first: '$icon' },
        emergency: { $max: '$emergencyAvailable' },
      },
    },
    { $sort: { bookings: -1 } },
  ]);

  return ok(
    res,
    rows.map((r) => ({
      category: r._id,
      services: r.services,
      bookings: r.bookings,
      startingAt: r.minPrice,
      icon: r.icon,
      emergencyAvailable: r.emergency,
    })),
  );
});

export const serviceReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ service: req.params.id })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('customer', 'name avatar')
    .populate('worker', 'displayName photo')
    .lean();

  return ok(res, reviews);
});
