import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, LANGUAGES } from '../config/constants.js';

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
    // Optional: accounts created through the OTP flow never set one, and a
    // verified phone is the credential. Present only for password sign-in.
    passwordHash: { type: String, select: false },
    phoneVerifiedAt: { type: Date },
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
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.verifyPassword = async function (plain) {
  // An OTP-only account has no hash. Compare against a dummy anyway so the
  // response time does not reveal which numbers have passwords set.
  if (!this.passwordHash) {
    await bcrypt.compare(plain, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    return false;
  }
  return bcrypt.compare(plain, this.passwordHash);
};

/** Never leak the hash, even if a caller forgets `.select('-passwordHash')`. */
userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.passwordHash;
  return obj;
};

export const User = mongoose.model('User', userSchema);
export { pointSchema, addressSchema };
