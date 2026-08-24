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

/** Booking creation — blunt guard against accidental double-submits and abuse. */
export const bookingLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});
