import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, LANGUAGES } from '../config/constants.js';

const BCRYPT_ROUNDS = 12;

/**
 * A real hash of a value nobody will guess, compared against when an account has
 * no password at all. It has to be genuinely valid: bcrypt rejects a malformed
 * hash immediately, which would make "no password set" the fast path and leak
 * exactly the fact this is meant to hide.
 */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const MAX_FAILED_LOGINS = 5;
const LOCK_BASE_MINUTES = 5;
const LOCK_MAX_MINUTES = 60;

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number], // [longitude, latitude] — GeoJSON order
      required: true,
      validate: {
        validator: (v) => v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90,
        message: 'coordinates must be [longitude, latitude] within valid ranges',
      },
    },
  },
  { _id: false },
);

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Home', trim: true },
    line1: { type: String, required: true, trim: true },
    landmark: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    zone: { type: String, trim: true }, // demand-forecasting bucket
    location: { type: pointSchema, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'phone must be a 10-digit Indian mobile number'],
    },
    email: { type: String, lowercase: true, trim: true, sparse: true },
    // Never selected by default, so a stray `User.find()` in some future
    // controller cannot serialise it by accident.
    passwordHash: { type: String, select: false },
    passwordChangedAt: { type: Date },

    /**
     * Failed sign-in throttling, per account.
     *
     * The IP-keyed rate limiter guards the endpoint; this guards the account.
     * They protect different things: a limiter stops one machine hammering the
     * API, and does nothing about a botnet spread thin across many addresses
     * all working the same phone number. The lock lives with the account
     * because the account is what is under attack.
     */
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.CUSTOMER, index: true },
    avatar: { type: String },
    language: { type: String, enum: LANGUAGES, default: 'en' },
    addresses: { type: [addressSchema], default: [] },

    // Wallet doubles as the customer refund ledger and the worker earnings float.
    wallet: {
      balance: { type: Number, default: 0, min: 0 },
      currency: { type: String, default: 'INR' },
    },

    // Cooperative membership. Customers may also be members (consumer-members),
    // which is what makes this a multi-stakeholder cooperative rather than a platform.
    cooperative: { type: mongoose.Schema.Types.ObjectId, ref: 'Cooperative', index: true },
    membershipId: { type: String, trim: true },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

userSchema.index({ 'addresses.location': '2dsphere' });

userSchema.virtual('defaultAddress').get(function () {
  if (!this.addresses?.length) return null;
  return this.addresses.find((a) => a.isDefault) || this.addresses[0];
});

userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
  this.passwordChangedAt = new Date();
  this.failedLoginAttempts = 0;
  this.lockedUntil = undefined;
};

userSchema.methods.verifyPassword = async function (plain) {
  // An account with no hash still costs a full bcrypt comparison, so the
  // response time does not sort numbers into "has a password" and "does not".
  if (!this.passwordHash) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, this.passwordHash);
};

/** Is this account currently locked out, and for how much longer? */
userSchema.methods.lockState = function () {
  const until = this.lockedUntil?.getTime() ?? 0;
  const remainingMs = until - Date.now();
  return { locked: remainingMs > 0, remainingSec: Math.ceil(Math.max(remainingMs, 0) / 1000) };
};

/**
 * Count a failed attempt, locking the account once the ceiling is reached.
 *
 * The window doubles each time it trips, so a determined guesser is pushed from
 * minutes to hours without ever permanently locking out the real owner — an
 * account that can be locked forever by a stranger is its own denial of service.
 */
userSchema.methods.registerFailedLogin = async function () {
  this.failedLoginAttempts = (this.failedLoginAttempts ?? 0) + 1;

  if (this.failedLoginAttempts >= MAX_FAILED_LOGINS) {
    const trips = Math.floor(this.failedLoginAttempts / MAX_FAILED_LOGINS);
    const minutes = Math.min(LOCK_BASE_MINUTES * 2 ** (trips - 1), LOCK_MAX_MINUTES);
    this.lockedUntil = new Date(Date.now() + minutes * 60_000);
  }

  await this.save();
  return this.lockState();
};

/** A correct password clears the record — the account is demonstrably in hand. */
userSchema.methods.registerSuccessfulLogin = async function () {
  this.failedLoginAttempts = 0;
  this.lockedUntil = undefined;
  this.lastLoginAt = new Date();
  await this.save();
};

/** Never leak credentials, even if a caller forgets to deselect them. */
userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.passwordHash;
  delete obj.failedLoginAttempts;
  delete obj.lockedUntil;
  return obj;
};

export const User = mongoose.model('User', userSchema);
export { pointSchema, addressSchema };
