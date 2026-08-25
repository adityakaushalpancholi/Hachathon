import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { ApiError } from './utils/ApiError.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { env, isProd } from './config/env.js';
import { webhook as paymentWebhook } from './controllers/payment.controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  /**
   * Content Security Policy, written out rather than left on helmet's default.
   *
   * The default is `default-src 'self'`, which blocks Razorpay Checkout outright
   * — and it blocks it silently, as a console error on a page that otherwise
   * looks fine, which is a miserable thing to debug. Checkout needs to load its
   * script, open its own iframe, and talk to the Razorpay API, so those three
   * origins are named explicitly instead of loosening the policy generally.
   *
   * In development the policy is off: Vite serves modules over its own origin
   * with an inline HMR runtime, and fighting that buys nothing locally.
   */
  const RAZORPAY_ORIGINS = ['https://checkout.razorpay.com', 'https://api.razorpay.com'];

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Checkout opens in an iframe that posts back to the opener.
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", ...RAZORPAY_ORIGINS],
              // Checkout injects inline styles; index.html links Google Fonts.
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'", ...RAZORPAY_ORIGINS],
              frameSrc: ["'self'", ...RAZORPAY_ORIGINS],
              // The stylesheet above pulls its font files from a second origin.
              fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: ["'self'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
    }),
  );
  app.use(compression());

  /**
   * The gateway webhook is mounted before the JSON parser on purpose.
   *
   * Its signature is an HMAC over the exact bytes Razorpay sent. Parsing and
   * re-serialising JSON does not round-trip byte-for-byte — key order, unicode
   * escaping and number formatting can all shift — so a body that has been
   * through `express.json()` will not verify. This route needs the raw Buffer.
   */
  app.post(
    '/api/payments/webhook',
    express.raw({ type: 'application/json', limit: '256kb' }),
    paymentWebhook,
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(isProd ? 'combined' : 'dev'));

  /**
   * A loopback origin on any port — the shape of a local dev server.
   *
   * Vite's proxy is a server-to-server hop, so it forwards the browser's Origin
   * header unchanged while `changeOrigin` rewrites only Host. That makes the
   * same-origin test fail for every Vite port except the one someone remembered
   * to list in CORS_ORIGIN, and the symptom is a CORS error on a request that
   * never left the machine. Development accepts any loopback port; production
   * does not use this at all.
   */
  const isLoopback = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  /**
   * CORS guards the API only — never the static bundle.
   *
   * Vite stamps `crossorigin` onto its module scripts and stylesheet, which puts
   * those requests in CORS mode and makes the browser send an Origin header even
   * same-origin. A global cors() therefore rejected the app's own bundle on the
   * single-service deploy and every asset came back as a 500. Same-origin is
   * always allowed; CORS_ORIGIN only needs setting when the client is hosted
   * somewhere other than this server.
   */
  const corsGuard = cors((req, cb) => {
    const origin = req.headers.origin;
    const allowed =
      !origin ||
      origin === `${req.protocol}://${req.get('host')}` ||
      env.corsOrigin.includes(origin) ||
      (!isProd && isLoopback(origin));

    cb(allowed ? null : new ApiError(403, `Origin ${origin} is not allowed by CORS`), {
      origin: allowed,
      credentials: true,
    });
  });

  /**
   * No API response is ever cacheable.
   *
   * Everything under /api is either per-account or changes minute to minute,
   * and a stale 200 is indistinguishable from a fresh one to whatever reads it
   * — you get yesterday's balance with nothing to indicate it. `private` also
   * keeps a shared proxy from holding one customer's bookings and handing them
   * to the next caller. The static bundle below is untouched by this and keeps
   * its year-long immutable caching, which is where caching actually pays.
   */
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    next();
  });

  app.use('/api', corsGuard, generalLimiter, routes);

  // In production, serve the built React app from ../client/dist.
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (isProd && existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '1y', immutable: true }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  } else {
    app.get('/', (_req, res) =>
      res.json({
        name: 'ShramSetu API',
        version: '1.0.0',
        docs: '/api/health',
        panels: ['customer', 'worker', 'admin'],
      }),
    );
    app.use(notFoundHandler);
  }

  app.use(errorHandler);

  return app;
}
