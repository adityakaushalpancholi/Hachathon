import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const num = (v, fallback) => (v === undefined || v === '' ? fallback : Number(v));
const bool = (v, fallback) => (v === undefined || v === '' ? fallback : v === 'true');
const list = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const DEV_JWT_SECRET = 'shramsetu-dev-secret-change-me';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),

  // Leave MONGO_URI empty to boot an ephemeral in-memory MongoDB (zero-setup dev).
  mongoUri: process.env.MONGO_URI || '',
  dbName: process.env.DB_NAME || 'shramsetu',

  jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  /**
   * Owner allowlist — the root of admin authority.
   *
   * Only these phone numbers can hold or grant the admin role. An admin cannot
   * promote anyone, not even another admin: authority comes from this list
   * alone, which lives in the deployment environment and not in the database,
   * so gaining write access to Mongo does not gain you an admin account.
   *
   * Empty means nobody can be an admin. That is the deliberate default: an
   * unconfigured deployment fails closed rather than leaving a door open.
   */
  ownerPhones: list(process.env.OWNER_PHONES),

  /**
   * Razorpay. Absent keys mean payments are simply unavailable rather than
   * half-working: the API says so plainly and the client hides the pay button,
   * which is a far better failure than a checkout that opens and then dies.
   */
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    get configured() {
      return Boolean(this.keyId && this.keySecret);
    },
  },

  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim()),

  // Marketplace economics. Split once at booking time and never recomputed.
  platformFeePct: num(process.env.PLATFORM_FEE_PCT, 0.02), // runs the platform
  coopCommissionPct: num(process.env.COMMISSION_PCT, 0.08), // the company's margin

  // Dispatch engine
  dispatchRadiusKm: num(process.env.DISPATCH_RADIUS_KM, 8),
  dispatchCandidates: num(process.env.DISPATCH_CANDIDATES, 5),
  dispatchWindowSec: num(process.env.DISPATCH_WINDOW_SEC, 45),
  emergencyRadiusKm: num(process.env.EMERGENCY_RADIUS_KM, 15),

  // Surge pricing guardrails (collectively agreed ceiling)
  surgeMin: num(process.env.SURGE_MIN, 1.0),
  surgeMax: num(process.env.SURGE_MAX, 1.8),

  /**
   * Reporting timezone.
   *
   * Every date-bucketing aggregation must name this explicitly: MongoDB's
   * $hour/$dayOfWeek/$dateToString default to UTC, so on an IST deployment an
   * 18:00 booking buckets into hour 12 and the "busiest hour" comes out 5.5
   * hours wrong. See forecast.service.js.
   */
  timezone: process.env.REPORT_TZ || 'Asia/Kolkata',

  /** Catalogue seeding: services and cooperatives, the data a real launch needs. */
  seedOnBoot: bool(process.env.SEED_ON_BOOT, true),

  /**
   * Fictional users, bookings and reviews. Off unless asked for — a production
   * database must never be populated with invented people and fake earnings.
   */
  seedDemo: bool(process.env.SEED_DEMO, false),

  /**
   * Delete seeded demo people on boot, keeping the catalogue.
   *
   * For the deployment that was demo-seeded once and now needs to be real. The
   * alternative is reaching the database directly, which an operator often
   * cannot do — managed clusters are firewalled to the platform, so a
   * redeployable switch is the only lever they actually have. Safe to leave on
   * (the purge is idempotent and refuses a database without the demo mark), but
   * turn it off once it has run so a real signup can never meet it.
   */
  purgeDemo: bool(process.env.PURGE_DEMO, false),
};

export const isProd = env.nodeEnv === 'production';

/**
 * Refuse to start a production process that is only pretending to be secure.
 *
 * Each of these is a silent failure in the worst way: the app runs, looks
 * healthy, and is trivially compromised. Better to not boot at all — the
 * platform surfaces a crashed deploy, whereas it cannot surface a weak secret.
 */
export function assertProductionConfig() {
  if (!isProd) return;

  const problems = [];

  if (env.jwtSecret === DEV_JWT_SECRET) {
    problems.push('JWT_SECRET is unset, so the built-in development secret is in use — anyone who has read the source can mint an admin token.');
  } else if (env.jwtSecret.length < 24) {
    problems.push(`JWT_SECRET is only ${env.jwtSecret.length} characters; use at least 24.`);
  }

  if (!env.mongoUri) {
    problems.push('MONGO_URI is unset, so this would run on a throwaway in-memory database that is wiped on every restart.');
  }

  if (env.seedDemo) {
    problems.push('SEED_DEMO is on, which would write fictional users and bookings into the production database.');
  }

  if (problems.length) {
    throw new Error(
      `Refusing to start in production:\n${problems.map((p) => `  · ${p}`).join('\n')}`,
    );
  }
}
