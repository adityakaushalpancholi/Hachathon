import { User, Worker, Cooperative, Service } from '../models/index.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/respond.js';
import { signToken } from '../middleware/auth.js';
import { ROLES, VERIFICATION_STATUS } from '../config/constants.js';
import { membershipId } from '../utils/ids.js';
import { toPoint } from '../utils/geo.js';

/**
 * The session token is the panel key: its `role` claim decides which of the
 * three panels the client mounts, and every panel-scoped endpoint re-checks it
 * server-side via `requireRole`. The client never decides its own access level.
 */
const sessionPayload = async (user) => {
  const token = signToken(user);
  const payload = { token, user: user.toSafeJSON(), panel: user.role };

  if (user.role === ROLES.WORKER) {
    payload.workerProfile = await Worker.findOne({ user: user._id })
      .populate('cooperative', 'name code city governance')
      .lean();
  }
  if (user.cooperative) {
    payload.cooperative = await Cooperative.findById(user.cooperative).lean();
  }
  return payload;
};

export const register = asyncHandler(async (req, res) => {
  const { name, phone, email, password, role, language, ...extra } = req.body;

  if (await User.exists({ phone })) {
    throw ApiError.conflict('An account with this phone number already exists');
  }

  const user = new User({ name, phone, email, role, language });
  await user.setPassword(password);

  // A worker must belong to a cooperative — that is the whole premise, so we
  // resolve one (or fall back to the first active coop in their city) at signup.
  if (role === ROLES.WORKER) {
    const coop =
      (extra.cooperativeId && (await Cooperative.findById(extra.cooperativeId))) ||
      (await Cooperative.findOne({ city: extra.city, isActive: true })) ||
      (await Cooperative.findOne({ isActive: true }));

    if (!coop) throw ApiError.badRequest('No cooperative available to join in your area');

    user.cooperative = coop._id;
    user.membershipId = membershipId(coop.code, (coop.stats.memberCount || 0) + 1);
  }

  await user.save();

  if (role === ROLES.WORKER) {
    const coop = await Cooperative.findById(user.cooperative);
    const skillTags = extra.skillTags?.length ? extra.skillTags : ['handyman'];
    const services = await Service.find({ skillTag: { $in: skillTags } }).select('_id skillTag');

    const location = toPoint(extra.location) ?? coop.location ?? {
      type: 'Point',
      coordinates: [72.8777, 19.076],
    };

    await Worker.create({
      user: user._id,
      cooperative: coop._id,
      displayName: name,
      city: extra.city || coop.city,
      hourlyRate: Math.max(extra.hourlyRate ?? coop.governance.minHourlyRate, coop.governance.minHourlyRate),
      experienceYears: extra.experienceYears ?? 1,
      skills: skillTags.map((tag) => ({
        skillTag: tag,
        service: services.find((s) => s.skillTag === tag)?._id,
        yearsExperience: extra.experienceYears ?? 1,
      })),
      location,
      // New members start unverified — the cooperative admin reviews documents
      // before they can take a job.
      verification: { status: VERIFICATION_STATUS.PENDING },
    });

    await Cooperative.updateOne({ _id: coop._id }, { $inc: { 'stats.memberCount': 1 } });
  }

  return created(res, await sessionPayload(user));
});

export const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;

  const user = await User.findOne({ phone }).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('No account found for this number');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  const valid = await user.verifyPassword(password);
  if (!valid) throw ApiError.unauthorized('Incorrect password');

  user.lastLoginAt = new Date();
  await user.save();

  return ok(res, await sessionPayload(user));
});

/** Called on app boot to rehydrate the session and decide which panel to mount. */
export const me = asyncHandler(async (req, res) => ok(res, await sessionPayload(req.user)));

export const updateProfile = asyncHandler(async (req, res) => {
  Object.assign(req.user, req.body);
  await req.user.save();

  // Keep the denormalised worker display name in step.
  if (req.body.name && req.workerProfile) {
    req.workerProfile.displayName = req.body.name;
    await req.workerProfile.save();
  }

  return ok(res, req.user.toSafeJSON());
});

export const addAddress = asyncHandler(async (req, res) => {
  const { location, isDefault, ...rest } = req.body;

  if (isDefault) req.user.addresses.forEach((a) => (a.isDefault = false));

  req.user.addresses.push({
    ...rest,
    location: toPoint(location),
    isDefault: isDefault ?? req.user.addresses.length === 0,
  });
  await req.user.save();

  return created(res, req.user.addresses);
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const before = req.user.addresses.length;
  req.user.addresses.pull({ _id: req.params.id });
  if (req.user.addresses.length === before) throw ApiError.notFound('Address not found');
  await req.user.save();
  return ok(res, req.user.addresses);
});
