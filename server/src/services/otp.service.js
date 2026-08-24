import crypto from 'node:crypto';
import { Otp } from '../models/index.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSms } from './sms.service.js';

const hash = (code) => crypto.createHash('sha256').update(code).digest('hex');

/** A uniformly-distributed numeric code — `crypto`, never `Math.random`. */
function generateCode(length = env.otp.length) {
  const max = 10 ** length;
  // Rejection-free: read a 6-byte integer and reduce it modulo `max`. The bias
  // from the modulo is under one part in 2^48/10^6, which is far below what
  // matters against a five-attempt ceiling.
  const n = crypto.randomBytes(6).readUIntBE(0, 6) % max;
  return String(n).padStart(length, '0');
}

/**
 * Issue a code for a phone number.
 *
 * Any earlier live code for the number is invalidated first, so a number never
 * has two working codes at once — otherwise requesting a fresh code would widen
 * the guessing surface rather than narrowing it.
 */
export async function issueOtp({ phone, purpose = 'login', ip }) {
  const cooldownStart = new Date(Date.now() - env.otp.resendCooldownSec * 1000);
  const recent = await Otp.findOne({
    phone,
    consumedAt: null,
    createdAt: { $gt: cooldownStart },
  }).sort({ createdAt: -1 });

  if (recent) {
    const waitSec = Math.ceil((recent.createdAt.getTime() - cooldownStart.getTime()) / 1000);
    throw new ApiError(429, `A code was just sent. Try again in ${waitSec} second${waitSec === 1 ? '' : 's'}.`);
  }

  await Otp.updateMany({ phone, consumedAt: null }, { $set: { consumedAt: new Date() } });

  const code = generateCode();
  await Otp.create({
    phone,
    codeHash: hash(code),
    purpose,
    requestIp: ip,
    expiresAt: new Date(Date.now() + env.otp.ttlMinutes * 60_000),
  });

  const delivery = await sendSms(
    phone,
    `${code} is your ShramSetu verification code. It expires in ${env.otp.ttlMinutes} minutes. Do not share it with anyone.`,
  );

  return {
    expiresInSec: env.otp.ttlMinutes * 60,
    channel: delivery.channel,
    // Only ever populated when OTP_ECHO is on, which production refuses to boot with.
    code: env.otp.echo ? code : undefined,
  };
}

/**
 * Check a code and burn it.
 *
 * Consumed on the first correct match so a code cannot be replayed, and the
 * attempt counter is raised before the comparison so a crash mid-verify still
 * costs the attacker a try.
 */
export async function verifyOtp({ phone, code, purpose = 'login' }) {
  const record = await Otp.findOne({
    phone,
    purpose,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!record) {
    throw ApiError.unauthorized('That code has expired. Request a new one.');
  }

  if (record.attempts >= env.otp.maxAttempts) {
    await Otp.updateOne({ _id: record._id }, { $set: { consumedAt: new Date() } });
    throw new ApiError(429, 'Too many incorrect attempts. Request a new code.');
  }

  await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });

  const supplied = Buffer.from(hash(String(code)));
  const expected = Buffer.from(record.codeHash);
  const matches =
    supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);

  if (!matches) {
    const left = env.otp.maxAttempts - record.attempts - 1;
    throw ApiError.unauthorized(
      left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code. Request a new one.',
    );
  }

  await Otp.updateOne({ _id: record._id }, { $set: { consumedAt: new Date() } });
  return true;
}
