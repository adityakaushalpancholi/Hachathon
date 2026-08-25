import { User, Worker, Cooperative, Service } from '../models/index.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/respond.js';
import { signToken } from '../middleware/auth.js';
import { ROLES, VERIFICATION_STATUS } from '../config/constants.js';
import { membershipId } from '../utils/ids.js';
import { toPoint } from '../utils/geo.js';
import { nearestArea } from '../config/areas.js';
import { entitledRole, reconcileRole, isOwnerPhone } from '../services/owner.service.js';
import { assessPassword } from '../services/password.service.js';

const PANEL_LABEL = {
  [ROLES.CUSTOMER]: 'Customer',
  [ROLES.WORKER]: 'Professional',
  [ROLES.ADMIN]: 'Admin',
};

/**
 * What this account *is*, stated by the server.
 *
 * The client should never work out an account's nature by inspecting fields —
 * whether it can use a password, whether its number is proven, what it is
 * allowed to see. Those are all server facts, so the server says them outright
 * and the client only renders the answer.
 *
 * `passwordHash` is `select: false`, so a document loaded by `requireAuth` does
 * not carry it. Its absence is not evidence either way, hence the one-field
 * lookup rather than a guess.
 */
const describeAccount = async (user) => {
  const hasPassword =
    user.passwordHash !== undefined
      ? Boolean(user.passwordHash)
      : Boolean(
          (await User.findById(user._id).select('+passwordHash').lean())?.passwordHash,
        );

  return {
    role: user.role,
    label: PANEL_LABEL[user.role] ?? user.role,
    isOwner: isOwnerPhone(user.phone),
    hasPassword,
    membershipId: user.membershipId ?? null,
    memberSince: user.createdAt ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    passwordChangedAt: user.passwordChangedAt ?? null,
  };
};

/**
 * The session token is the panel key: its `role` claim decides which of the
 * three panels the client mounts, and every panel-scoped endpoint re-checks it
 * server-side via `requireRole`. The client never decides its own access level.
 */
const sessionPayload = async (user) => {
  const token = signToken(user);
  const account = await describeAccount(user);

  const payload = {
    token,
    user: user.toSafeJSON(),
    panel: user.role,
    // The full description of who is signed in. `isOwner` is repeated at the top
    // level for the callers that only need that one bit; both are display hints,
    // and every owner route re-checks server-side regardless.
    account,
    isOwner: account.isOwner,
  };

  if (user.role === ROLES.WORKER) {
    payload.workerProfile = await Worker.findOne({ user: user._id })
      .populate('cooperative', 'name code city governance')
      .lean();
    payload.account.verification = payload.workerProfile?.verification?.status ?? null;
  }
  if (user.cooperative) {
    payload.cooperative = await Cooperative.findById(user.cooperative).lean();
    payload.account.cooperative = payload.cooperative?.name ?? null;
  }
  return payload;
};

export const register = asyncHandler(async (req, res) => {
  const { name, phone, email, password, role, language, ...extra } = req.body;

  if (await User.exists({ phone })) {
    throw ApiError.conflict('An account with this phone number already exists');
  }

  const verdict = assessPassword(password, { name, phone });
  if (!verdict.ok) throw ApiError.badRequest(verdict.problems.join(' '));

  // `role` is constrained to customer or worker by the schema; an owner number
  // is upgraded here so the operator's own account works however it was made.
  const user = new User({ name, phone, email, role, language });
  user.role = entitledRole(user);
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
      baseArea: nearestArea(location.coordinates[1], location.coordinates[0])?.zone,
      // A new professional starts unverified — an administrator reviews the
      // documents before they can take a job.
      verification: { status: VERIFICATION_STATUS.PENDING },
    });

    await Cooperative.updateOne({ _id: coop._id }, { $inc: { 'stats.memberCount': 1 } });
  }

  return created(res, await sessionPayload(user));
});

/**
 * Password sign-in.
 *
 * "No account" and "wrong password" deliberately return the same message. The
 * distinction is only useful to someone working out which numbers are
 * registered; a person who owns the number knows perfectly well whether they
 * have signed up.
 */
export const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;

  const user = await User.findOne({ phone }).select(
    '+passwordHash +failedLoginAttempts +lockedUntil',
  );

  if (!user) {
    // Spend roughly what a real comparison costs, so the timing of this branch
    // does not answer the question the message refuses to.
    await new User({ phone: '9000000000', name: 'x' }).verifyPassword(password);
    throw ApiError.unauthorized('That phone number and password do not match');
  }

  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  const lock = user.lockState();
  if (lock.locked) {
    throw new ApiError(
      429,
      `Too many failed attempts. Try again in ${Math.ceil(lock.remainingSec / 60)} minute(s).`,
    );
  }

  if (!(await user.verifyPassword(password))) {
    const state = await user.registerFailedLogin();
    throw ApiError.unauthorized(
      state.locked
        ? `Too many failed attempts. This account is locked for ${Math.ceil(state.remainingSec / 60)} minute(s).`
        : 'That phone number and password do not match',
    );
  }

  await reconcileRole(user);
  await user.registerSuccessfulLogin();

  return ok(res, await sessionPayload(user));
});

/**
 * Change a password, proving the current one first.
 *
 * Requiring the old password is what stops a borrowed unlocked phone from
 * becoming a permanent takeover: a session alone is not enough to lock the
 * real owner out.
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found');

  if (!(await user.verifyPassword(currentPassword))) {
    throw ApiError.unauthorized('Your current password is not correct');
  }

  const verdict = assessPassword(newPassword, { name: user.name, phone: user.phone });
  if (!verdict.ok) throw ApiError.badRequest(verdict.problems.join(' '));

  if (await user.verifyPassword(newPassword)) {
    throw ApiError.badRequest('The new password must differ from the current one');
  }

  await user.setPassword(newPassword);
  await user.save();

  // The old token stays valid until it expires; hand back a fresh one so the
  // client is not holding a session minted before the credential changed.
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

  /* An address captured by GPS arrives with coordinates but no zone, and the
     zone is what demand forecasting buckets on. Fill it from the nearest
     serviceable area rather than leaving the bucket empty — a booking with no
     zone is invisible to every planning screen in the admin panel. */
  const area = rest.zone ? null : nearestArea(location.lat, location.lng);

  req.user.addresses.push({
    ...rest,
    zone: rest.zone || area?.zone,
    city: rest.city || area?.city,
    location: toPoint(location),
    // The first address a customer saves is their default, whatever they ticked.
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
