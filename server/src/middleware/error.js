import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { fail } from '../utils/respond.js';
import { logger } from '../utils/logger.js';
import { isProd } from '../config/env.js';

export const notFoundHandler = (req, res) =>
  fail(res, 404, `No route matches ${req.method} ${req.originalUrl}`);

/** Translates driver/ODM errors into the API's error envelope. */
export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    return fail(res, err.status, err.message, err.details);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return fail(res, 400, 'Validation failed', details);
  }

  if (err instanceof mongoose.Error.CastError) {
    return fail(res, 400, `Malformed value for '${err.path}'`);
  }

  // Duplicate key on a unique index (phone, booking code, coop code…)
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return fail(res, 409, `A record with this ${field} already exists`);
  }

  logger.error(err.message, isProd ? '' : `\n${err.stack}`);
  return fail(res, 500, isProd ? 'Something went wrong on our side' : err.message);
};
