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

/**
 * Credential endpoints — sign-in, sign-up, password change.
 *
 * Keyed by phone number where the body carries one, falling back to the address.
 * An IP-keyed limit is the wrong shape twice over: a shared mobile gateway puts
 * thousands of legitimate users behind one address, while an attacker guessing
 * at one account rotates addresses freely. The account under attack is what
 * deserves the budget. Successful requests are not counted, so a person signing
 * in correctly all day never meets the ceiling.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `auth:${req.body?.phone || req.ip}`,
  handler: (_req, res) =>
    fail(res, 429, 'Too many attempts for this account. Try again in a few minutes.'),
});

/**
 * Order creation. Each one is a call out to the gateway, so this protects
 * Razorpay's rate limits and our own bill as much as it protects the API.
 */
export const paymentLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
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
