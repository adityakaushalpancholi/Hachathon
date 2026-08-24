import mongoose from 'mongoose';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/respond.js';
import { isEphemeral } from '../config/db.js';
import { env } from '../config/env.js';

/**
 * Read access to the raw collections, for the operator only.
 *
 * Two rules shape everything here. Collections are addressed through an
 * allowlist of registered models, never by whatever string arrives in the URL,
 * so this cannot be walked sideways into `system.*` or another database. And
 * secret-bearing fields are stripped on the way out, because a panel that
 * displays password hashes has quietly become a way to exfiltrate them.
 */

/** Model name → what the operator calls it. Order is the display order. */
const COLLECTIONS = [
  { model: 'User', label: 'Users', hint: 'Everyone with an account' },
  { model: 'Worker', label: 'Workers', hint: 'Member profiles, skills, verification' },
  { model: 'Cooperative', label: 'Cooperatives', hint: 'Societies and their governance' },
  { model: 'Service', label: 'Services', hint: 'The bookable catalogue' },
  { model: 'Booking', label: 'Bookings', hint: 'Every job, in every state' },
  { model: 'Review', label: 'Reviews', hint: 'Ratings and replies' },
  { model: 'Payout', label: 'Payouts', hint: 'Settlement runs and transfers' },
  { model: 'Notification', label: 'Notifications', hint: 'In-app message log' },
  { model: 'Otp', label: 'Login codes', hint: 'Pending codes; self-expiring' },
];

/**
 * Fields never returned, whatever collection they appear in.
 *
 * Matched by name across nesting depth, so adding a secret to a subdocument
 * later does not require remembering to come back here.
 */
const REDACTED = new Set(['passwordHash', 'codeHash', '__v']);

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (value instanceof mongoose.Types.ObjectId) return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !REDACTED.has(k))
        .map(([k, v]) => [k, redact(v)]),
    );
  }
  return value;
}

const resolve = (name) => {
  const entry = COLLECTIONS.find((c) => c.model.toLowerCase() === String(name).toLowerCase());
  if (!entry) throw ApiError.notFound(`No such collection: ${name}`);
  return { ...entry, Model: mongoose.model(entry.model) };
};

/** Overview: what exists, how much of it, and where it lives. */
export const overview = asyncHandler(async (_req, res) => {
  const counts = await Promise.all(
    COLLECTIONS.map(async (c) => ({
      ...c,
      count: await mongoose.model(c.model).estimatedDocumentCount(),
    })),
  );

  const conn = mongoose.connection;
  let storage = null;
  try {
    const stats = await conn.db.stats();
    storage = {
      dataSizeMb: +(stats.dataSize / 1024 / 1024).toFixed(2),
      storageSizeMb: +(stats.storageSize / 1024 / 1024).toFixed(2),
      indexSizeMb: +(stats.indexSize / 1024 / 1024).toFixed(2),
      objects: stats.objects,
    };
  } catch {
    // dbStats needs a privilege the connection may not hold; the panel is
    // still useful without it, so a failure here is not an error response.
  }

  return ok(res, {
    connection: {
      database: conn.name,
      host: conn.host,
      ephemeral: isEphemeral(),
      readyState: ['disconnected', 'connected', 'connecting', 'disconnecting'][conn.readyState],
    },
    storage,
    collections: counts,
  });
});

/**
 * A page of documents.
 *
 * `q` is matched against the collection's string fields. The term is escaped
 * before it becomes a RegExp — an unescaped one lets a caller write a pattern
 * that backtracks catastrophically and pins the event loop.
 */
export const listDocuments = asyncHandler(async (req, res) => {
  const { Model, label } = resolve(req.params.collection);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const sort = String(req.query.sort || '-createdAt');

  let filter = {};
  const term = String(req.query.q || '').trim();

  if (term) {
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');

    const stringPaths = Object.entries(Model.schema.paths)
      .filter(([name, p]) => p.instance === 'String' && !REDACTED.has(name))
      .map(([name]) => name);

    const or = stringPaths.map((p) => ({ [p]: rx }));
    if (mongoose.Types.ObjectId.isValid(term)) or.push({ _id: term });

    filter = or.length ? { $or: or } : {};
  }

  const [total, docs] = await Promise.all([
    Model.countDocuments(filter),
    Model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
  ]);

  return ok(res, {
    collection: Model.modelName,
    label,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit) || 1,
    documents: docs.map(redact),
  });
});

export const getDocument = asyncHandler(async (req, res) => {
  const { Model } = resolve(req.params.collection);
  const doc = await Model.findById(req.params.id).lean();
  if (!doc) throw ApiError.notFound('Document not found');
  return ok(res, redact(doc));
});

/**
 * Delete one document.
 *
 * Deliberately the only write this panel offers. Editing arbitrary fields from
 * here would route around every validator and hook the models define — the
 * kind of tool that eventually corrupts the data it was built to inspect.
 */
export const deleteDocument = asyncHandler(async (req, res) => {
  const { Model } = resolve(req.params.collection);

  if (String(req.params.id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot delete the account you are signed in with');
  }

  const doc = await Model.findByIdAndDelete(req.params.id).lean();
  if (!doc) throw ApiError.notFound('Document not found');

  return ok(res, { deleted: true, collection: Model.modelName, id: req.params.id });
});

/** Index definitions — the usual first stop when a query has gone slow. */
export const listIndexes = asyncHandler(async (req, res) => {
  const { Model } = resolve(req.params.collection);
  return ok(res, await Model.collection.indexes());
});

/** Runtime configuration, with every secret reduced to whether it is set. */
export const configSummary = asyncHandler(async (_req, res) =>
  ok(res, {
    nodeEnv: env.nodeEnv,
    timezone: env.timezone,
    owners: env.ownerPhones.length,
    otp: { ttlMinutes: env.otp.ttlMinutes, maxAttempts: env.otp.maxAttempts, echo: env.otp.echo },
    sms: { provider: env.sms.provider, configured: env.sms.provider !== 'log' },
    economics: {
      platformFeePct: env.platformFeePct,
      coopCommissionPct: env.coopCommissionPct,
      dividendPoolPct: env.dividendPoolPct,
    },
    dispatch: {
      radiusKm: env.dispatchRadiusKm,
      candidates: env.dispatchCandidates,
      windowSec: env.dispatchWindowSec,
    },
    surge: { min: env.surgeMin, max: env.surgeMax },
    secretsPresent: {
      mongoUri: Boolean(env.mongoUri),
      jwtSecret: Boolean(process.env.JWT_SECRET),
    },
  }),
);
