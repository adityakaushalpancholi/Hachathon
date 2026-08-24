import { User, Worker, Cooperative, Service } from '../models/index.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/respond.js';
import { signToken } from '../middleware/auth.js';
import { ROLES, VERIFICATION_STATUS } from '../config/constants.js';
import { membershipId } from '../utils/ids.js';
import { toPoint } from '../utils/geo.js';
import { issueOtp, verifyOtp } from '../services/otp.service.js';
import { entitledRole, reconcileRole, isOwnerPhone } from '../services/owner.service.js';

const PANEL_LABEL = {
  [ROLES.CUSTOMER]: 'Customer',
  [ROLES.WORKER]: 'Member',
  [ROLES.ADMIN]: 'Cooperative Board',
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
    phoneVerified: Boolean(user.phoneVerifiedAt),
    hasPassword,
    // Which doors this account can actually come through, so the sign-in screen
    // never offers one that cannot work.
    signInMethods: hasPassword ? ['otp', 'password'] : ['otp'],
    membershipId: user.membershipId ?? null,
    memberSince: user.createdAt ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
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

  await reconcileRole(user);
  user.lastLoginAt = new Date();
  await user.save();

  return ok(res, await sessionPayload(user));
});

/* ------------------------------- OTP sign-in ------------------------------ */

/**
 * Step one: send a code.
 *
 * The response is deliberately identical whether or not an account exists.
 * Answering "no account found" here would turn this endpoint into a directory
 * of which numbers are registered, so instead the client is told a code was
 * sent and learns the account's status only after proving it holds the phone.
 */
export const requestOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body;

  const result = await issueOtp({ phone, purpose: 'login', ip: req.ip });

  return ok(res, {
    sent: true,
    phone,
    expiresInSec: result.expiresInSec,
    channel: result.channel,
    ...(result.code ? { devCode: result.code } : {}),
  });
});

/**
 * Step two: exchange a correct code for a session.
 *
 * A first-time number is registered here rather than being turned away, which
 * is what makes a phone number the whole of the sign-up flow. `name` is
 * optional and only consulted when the account is actually new.
 */
export const verifyOtpLogin = asyncHandler(async (req, res) => {
  const { phone, code, name } = req.body;

  await verifyOtp({ phone, code, purpose: 'login' });

  let user = await User.findOne({ phone });
  let isNew = false;

  if (!user) {
    user = new User({
      name: name?.trim() || `Member ${phone.slice(-4)}`,
      phone,
      role: ROLES.CUSTOMER,
    });
    isNew = true;
  }

  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  // Owner numbers become admins here and nowhere else — see owner.service.js.
  user.role = entitledRole(user);
  user.phoneVerifiedAt = new Date();
  user.lastLoginAt = new Date();
  await user.save();

  const payload = await sessionPayload(user);
  return isNew ? created(res, { ...payload, isNew }) : ok(res, { ...payload, isNew });
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
