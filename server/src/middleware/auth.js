import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { User, Worker } from '../models/index.js';
import { ROLES } from '../config/constants.js';
import { isOwnerPhone } from '../services/owner.service.js';

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

const extractToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

/** Hard requirement — 401 if no valid token. */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Missing bearer token');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Session expired or token is invalid');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not found or deactivated');

  /**
   * Re-derive admin authority from the environment on every request.
   *
   * The token's role claim and the stored role field are both just data — one
   * signed by us, one sitting in Mongo. Neither is evidence of entitlement. An
   * admin account whose number has left OWNER_PHONES, or that was written
   * straight into the database, is refused here regardless of what it carries.
   */
  if (user.role === ROLES.ADMIN && !isOwnerPhone(user.phone)) {
    throw ApiError.forbidden('This account is no longer authorised for administration');
  }

  req.user = user;

  // Workers act on their profile far more often than on their user record,
  // so resolve it once here instead of in every worker-facing controller.
  if (user.role === ROLES.WORKER) {
    req.workerProfile = await Worker.findOne({ user: user._id });
  }

  next();
});

/** Soft — populates req.user when a token is present, never rejects. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = await User.findById(payload.sub);
    if (req.user?.role === ROLES.WORKER) {
      req.workerProfile = await Worker.findOne({ user: req.user._id });
    }
  } catch {
    /* ignore — this route works fine anonymously */
  }
  next();
});

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`This action requires role: ${roles.join(' or ')}`));
    }
    next();
  };

/**
 * The narrowest gate in the app: the operator themselves.
 *
 * Used for surfaces where a compromised admin session would be worse than a
 * compromised customer one — raw database access, in particular.
 */
export const requireOwner = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!isOwnerPhone(req.user.phone)) {
    return next(ApiError.forbidden('This area is restricted to the platform owner'));
  }
  next();
};

/** Worker routes additionally need a provisioned profile. */
export const requireWorkerProfile = (req, _res, next) => {
  if (!req.workerProfile) return next(ApiError.forbidden('No worker profile linked to this account'));
  next();
};
