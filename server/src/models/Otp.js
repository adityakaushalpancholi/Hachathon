import mongoose from 'mongoose';

/**
 * A pending one-time passcode.
 *
 * The code is stored as a SHA-256 hash, never in clear text: a read-only leak
 * of this collection must not hand anyone a working login. Hashing is cheap
 * here rather than bcrypt-slow because the secret is six digits with a
 * five-minute life and a five-attempt ceiling — the attempt counter, not the
 * hash cost, is what makes guessing useless.
 *
 * Documents delete themselves via the TTL index on `expiresAt`, so the
 * collection stays small without a sweeper.
 */
const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ['login', 'register'], default: 'login' },

    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date },
    expiresAt: { type: Date, required: true },

    // Kept for abuse investigation, not for identification.
    requestIp: { type: String },
  },
  { timestamps: true },
);

// Mongo's TTL monitor removes documents once expiresAt passes.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Verification always wants the newest live code for a number.
otpSchema.index({ phone: 1, createdAt: -1 });

export const Otp = mongoose.model('Otp', otpSchema);
