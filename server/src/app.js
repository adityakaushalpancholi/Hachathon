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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
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
