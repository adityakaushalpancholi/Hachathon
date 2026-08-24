import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { env, isProd } from './config/env.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // correct client IPs behind a load balancer

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow same-origin/tooling requests that send no Origin header.
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

  app.get('/', (_req, res) =>
    res.json({
      name: 'ShramSetu API',
      version: '1.0.0',
      docs: '/api/health',
      panels: ['customer', 'worker', 'admin'],
    }),
  );

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
