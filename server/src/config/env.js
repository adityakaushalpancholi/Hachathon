import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const num = (v, fallback) => (v === undefined || v === '' ? fallback : Number(v));

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),

  // Leave MONGO_URI empty to boot an ephemeral in-memory MongoDB (zero-setup dev).
  mongoUri: process.env.MONGO_URI || '',
  dbName: process.env.DB_NAME || 'shramsetu',

  jwtSecret: process.env.JWT_SECRET || 'shramsetu-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim()),

  // Marketplace economics — cooperative model
  platformFeePct: num(process.env.PLATFORM_FEE_PCT, 0.02), // keeps the lights on
  coopCommissionPct: num(process.env.COOP_COMMISSION_PCT, 0.08), // vs 20-30% on investor-owned apps
  dividendPoolPct: num(process.env.DIVIDEND_POOL_PCT, 0.4), // share of commission returned to members

  // Dispatch engine
  dispatchRadiusKm: num(process.env.DISPATCH_RADIUS_KM, 8),
  dispatchCandidates: num(process.env.DISPATCH_CANDIDATES, 5),
  dispatchWindowSec: num(process.env.DISPATCH_WINDOW_SEC, 45),
  emergencyRadiusKm: num(process.env.EMERGENCY_RADIUS_KM, 15),

  // Surge pricing guardrails (collectively agreed ceiling)
  surgeMin: num(process.env.SURGE_MIN, 1.0),
  surgeMax: num(process.env.SURGE_MAX, 1.8),

  seedOnBoot: process.env.SEED_ON_BOOT !== 'false',
};

export const isProd = env.nodeEnv === 'production';
