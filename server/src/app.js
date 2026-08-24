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
import { generalLimiter } from './middleware/rateLimit.js';
import { env, isProd } from './config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || env.corsOrigin.includes(origin)) return cb(null, true);
        cb(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(isProd ? 'combined' : 'dev'));
  app.use('/api', generalLimiter);

  app.use('/api', routes);

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
