import rateLimit from 'express-rate-limit';
import { fail } from '../utils/respond.js';

const handler = (_req, res) =>
  fail(res, 429, 'Too many requests — please slow down and try again shortly');

/** Baseline ceiling for the whole API. */
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

/** Credential endpoints get a far tighter budget. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler,
});

/**
 * Code requests, keyed by phone number rather than by IP.
 *
 * An IP-keyed limit is the wrong shape here twice over: a shared mobile gateway
 * puts thousands of legitimate users behind one address, while an attacker
 * pumping codes at one number rotates addresses freely. The number being
 * targeted is the thing worth protecting, so that is what we count.
 */
export const otpRequestLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `otp:${req.body?.phone || req.ip}`,
  handler: (_req, res) =>
    fail(res, 429, 'Too many codes requested for this number. Try again in an hour.'),
});

/** Verification attempts. The per-code ceiling lives in otp.service.js. */
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `otpv:${req.body?.phone || req.ip}`,
  handler,
});

/** Booking creation — blunt guard against accidental double-submits and abuse. */
export const bookingLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});
