import { Worker, Booking, Review, Service, User, Cooperative } from '../models/index.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { ok, paginated } from '../utils/respond.js';
import { findNearbyWorkers, explainNoMatches } from '../services/matching.service.js';
import { pendingOffersFor, acceptOffer, declineOffer } from '../services/dispatch.service.js';
import { workerEarnings } from '../services/payout.service.js';
import { advanceStatus, startJob, completeJob, cancelBooking } from '../services/booking.service.js';
import { BOOKING_STATUS, VERIFICATION_STATUS } from '../config/constants.js';
import { toPoint } from '../utils/geo.js';
import { nearestArea } from '../config/areas.js';
import { decorateWorker, decorateWorkers } from '../utils/decorate.js';

/* ------------------------- public / discovery ------------------------ */

export const listWorkers = asyncHandler(async (req, res) => {
  const { q, skillTag, city, minRating, sort, page, limit } = req.query;

  const filter = { 'verification.status': VERIFICATION_STATUS.VERIFIED };
  if (skillTag) filter['skills.skillTag'] = skillTag;
  if (city) filter.city = new RegExp(`^${city}$`, 'i');
  if (minRating) filter['rating.average'] = { $gte: minRating };
  if (q) filter.$or = [{ displayName: new RegExp(q, 'i') }, { baseArea: new RegExp(q, 'i') }];

  const sortMap = {
    rating: { 'rating.average': -1, 'rating.count': -1 },
    experience: { experienceYears: -1 },
    jobs: { 'stats.jobsCompleted': -1 },
    rate_asc: { hourlyRate: 1 },
    rate_desc: { hourlyRate: -1 },
  };

  const [items, total] = await Promise.all([
    Worker.find(filter)
      .sort(sortMap[sort])
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('cooperative', 'name code city')
      .lean(),
    Worker.countDocuments(filter),
  ]);

  return paginated(res, decorateWorkers(items), { page, limit, total });
});

export const getWorker = asyncHandler(async (req, res) => {
  const worker = await Worker.findById(req.params.id)
    .populate('cooperative', 'name code city governance stats')
    .populate('skills.service', 'name icon category basePrice')
    .lean();

  if (!worker) throw ApiError.notFound('Worker not found');

  const reviews = await Review.find({ worker: worker._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('customer', 'name avatar')
    .lean();

  return ok(res, { ...decorateWorker(worker), reviews });
});

/** Geo search — the map/nearby view and the "who is around me now" panel. */
export const nearby = asyncHandler(async (req, res) => {
  const { lat, lng, skillTag, radiusKm, limit, online, emergency } = req.query;

  const workers = await findNearbyWorkers({
    coordinates: [lng, lat],
    skillTag,
    radiusKm,
    limit,
    requireOnline: online ?? false,
    requireEmergency: emergency ?? false,
  });

  /* An empty list is the one answer that explains nothing, so when it happens
     we work out which filter emptied it and say so. */
  const explanation = workers.length
    ? null
    : await explainNoMatches({ coordinates: [lng, lat], skillTag, radiusKm });

  return ok(res, workers, {
    radiusKm,
    center: [lng, lat],
    count: workers.length,
    ...(explanation ? { empty: explanation } : {}),
  });
});

/* --------------------------- worker panel ---------------------------- */

/** Everything the worker panel needs on mount, in one round trip. */
export const workerDashboard = asyncHandler(async (req, res) => {
  const worker = req.workerProfile;

  const [offers, active, upcoming, recent, earnings, reviews] = await Promise.all([
    pendingOffersFor(worker._id),
    Booking.findOne({
      worker: worker._id,
      status: {
        $in: [
          BOOKING_STATUS.ACCEPTED,
          BOOKING_STATUS.ENROUTE,
          BOOKING_STATUS.ARRIVED,
          BOOKING_STATUS.IN_PROGRESS,
        ],
      },
    })
      .populate('customer', 'name phone')
      .populate('service', 'name icon checklist equipment')
      .lean(),
    Booking.find({
      worker: worker._id,
      status: BOOKING_STATUS.ACCEPTED,
      scheduledFor: { $gt: new Date() },
    })
      .sort({ scheduledFor: 1 })
      .limit(5)
      .populate('customer', 'name')
      .lean(),
    Booking.find({ worker: worker._id, status: BOOKING_STATUS.COMPLETED })
      .sort({ 'otp.completeVerifiedAt': -1 })
      .limit(8)
      .populate('customer', 'name')
      .lean(),
    workerEarnings(worker._id),
    Review.find({ worker: worker._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('customer', 'name')
      .lean(),
  ]);

  return ok(res, {
    profile: {
      ...worker.toObject({ virtuals: true }),
      acceptanceRate: worker.acceptanceRate,
      onTimeRate: worker.onTimeRate,
    },
    offers,
    activeJob: active,
    upcoming,
    recent,
    earnings,
    reviews,
  });
});

/**
 * Edit your own profile.
 *
 * The hourly rate is floored at the company's agreed minimum rather than
 * rejected outright — someone entering 150 against a floor of 200 means "as
 * cheap as I am allowed to be", and refusing the whole save over it teaches
 * nothing. The stored value is the floor and the response says what happened.
 *
 * `displayName` is denormalised onto the Worker so search results do not have
 * to populate User, so both copies move together or the two disagree.
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const worker = req.workerProfile;
  const {
    displayName, bio, languages, skillTags, hourlyRate, experienceYears,
    acceptsEmergency, workingDays, shiftStart, shiftEnd,
  } = req.body;

  const notes = [];

  if (displayName !== undefined) {
    worker.displayName = displayName;
    await User.updateOne({ _id: worker.user }, { $set: { name: displayName } });
  }
  if (bio !== undefined) worker.bio = bio;
  if (languages !== undefined) worker.languages = languages;
  if (experienceYears !== undefined) worker.experienceYears = experienceYears;
  if (acceptsEmergency !== undefined) worker.availability.acceptsEmergency = acceptsEmergency;

  if (workingDays !== undefined) {
    if (!workingDays.length) throw ApiError.badRequest('Choose at least one working day');
    worker.availability.workingDays = [...new Set(workingDays)].sort();
  }
  if (shiftStart !== undefined) worker.availability.shiftStart = shiftStart;
  if (shiftEnd !== undefined) worker.availability.shiftEnd = shiftEnd;

  if (hourlyRate !== undefined) {
    const coop = await Cooperative.findById(worker.cooperative).select('governance');
    const floor = coop?.governance?.minHourlyRate ?? 0;
    worker.hourlyRate = Math.max(hourlyRate, floor);
    if (hourlyRate < floor) notes.push(`Raised to the ${floor} minimum rate for your company.`);
  }

  if (skillTags !== undefined) {
    const services = await Service.find({ skillTag: { $in: skillTags } }).select('_id skillTag');
    const known = new Set(services.map((x) => x.skillTag));

    const unknown = skillTags.filter((t) => !known.has(t));
    if (unknown.length) throw ApiError.badRequest(`Not a service we offer: ${unknown.join(', ')}`);

    // Keep the years already recorded against a trade someone is re-selecting.
    const previous = new Map(worker.skills.map((sk) => [sk.skillTag, sk]));
    worker.skills = skillTags.map((tag) => ({
      skillTag: tag,
      service: services.find((x) => x.skillTag === tag)?._id,
      level: previous.get(tag)?.level ?? 'skilled',
      yearsExperience: previous.get(tag)?.yearsExperience ?? (experienceYears ?? worker.experienceYears ?? 1),
    }));
  }

  await worker.save();

  return ok(res, { profile: worker.toObject(), notes });
});

export const setAvailability = asyncHandler(async (req, res) => {
  const worker = req.workerProfile;
  const { isOnline, acceptsEmergency, serviceRadiusKm, location } = req.body;

  if (isOnline === true && worker.verification.status !== VERIFICATION_STATUS.VERIFIED) {
    throw ApiError.forbidden('Your profile must be verified before you can go online');
  }

  if (isOnline !== undefined) worker.availability.isOnline = isOnline;
  if (acceptsEmergency !== undefined) worker.availability.acceptsEmergency = acceptsEmergency;
  if (serviceRadiusKm !== undefined) worker.serviceRadiusKm = serviceRadiusKm;

  /* `baseArea` is the human-readable label for the same fact as `location`, and
     it is what the worker's own panel and the customer search both display. It
     has to move with the coordinates or the two disagree — the panel saying
     "within 12 km of Bandra West" while dispatch matches from Malad. */
  if (location) {
    worker.location = toPoint(location);
    worker.baseArea = nearestArea(location.lat, location.lng)?.zone ?? worker.baseArea;
  }

  await worker.save();
  return ok(res, { availability: worker.availability, location: worker.location, serviceRadiusKm: worker.serviceRadiusKm });
});

/** Live GPS ping — keeps the dispatch index fresh while a worker is online. */
export const pingLocation = asyncHandler(async (req, res) => {
  const point = toPoint(req.body.location ?? req.body);
  if (!point) throw ApiError.badRequest('A valid location is required');

  await Worker.updateOne({ _id: req.workerProfile._id }, { $set: { location: point } });
  return ok(res, { location: point, at: new Date() });
});

export const listOffers = asyncHandler(async (req, res) =>
  ok(res, await pendingOffersFor(req.workerProfile._id)),
);

export const accept = asyncHandler(async (req, res) =>
  ok(res, await acceptOffer(req.params.id, req.workerProfile._id)),
);

export const decline = asyncHandler(async (req, res) =>
  ok(res, await declineOffer(req.params.id, req.workerProfile._id, req.body.reason)),
);

/** Load a job the worker owns, or 404/403 trying. */
async function ownedBooking(req) {
  const booking = await Booking.findOne({ _id: req.params.id, worker: req.workerProfile._id });
  if (!booking) throw ApiError.notFound('Booking not found or not assigned to you');
  return booking;
}

export const markEnroute = asyncHandler(async (req, res) => {
  const booking = await ownedBooking(req);
  return ok(res, await advanceStatus(booking, BOOKING_STATUS.ENROUTE, 'worker', 'On the way'));
});

export const markArrived = asyncHandler(async (req, res) => {
  const booking = await ownedBooking(req);
  return ok(res, await advanceStatus(booking, BOOKING_STATUS.ARRIVED, 'worker', 'Reached location'));
});

export const start = asyncHandler(async (req, res) =>
  ok(res, await startJob(req.params.id, req.workerProfile._id, req.body.code)),
);

export const complete = asyncHandler(async (req, res) =>
  ok(res, await completeJob(req.params.id, req.workerProfile._id, req.body.code)),
);

export const workerCancel = asyncHandler(async (req, res) => {
  const booking = await ownedBooking(req);
  return ok(res, await cancelBooking(booking, 'worker', req.body.reason));
});

export const earnings = asyncHandler(async (req, res) =>
  ok(res, await workerEarnings(req.workerProfile._id)),
);

/** Reply to a review — the worker's right of response. */
export const respondToReview = asyncHandler(async (req, res) => {
  const review = await Review.findOne({ _id: req.params.id, worker: req.workerProfile._id });
  if (!review) throw ApiError.notFound('Review not found');

  review.response = { text: req.body.text, at: new Date() };
  await review.save();
  return ok(res, review);
});
