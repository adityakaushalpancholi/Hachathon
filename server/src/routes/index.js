import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from './auth.routes.js';
import serviceRoutes from './service.routes.js';
import workerRoutes from './worker.routes.js';
import bookingRoutes from './booking.routes.js';
import reviewRoutes from './review.routes.js';
import notificationRoutes from './notification.routes.js';
import adminRoutes from './admin.routes.js';
import insightsRoutes from './insights.routes.js';
import { listCooperatives, getCooperative } from '../controllers/notification.controller.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/schemas.js';
import { ok } from '../utils/respond.js';

const router = Router();

/** Liveness + which datastore we are actually talking to. */
router.get('/health', (_req, res) =>
  ok(res, {
    status: 'ok',
    uptimeSec: Math.round(process.uptime()),
    db: {
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState],
      name: mongoose.connection.name,
    },
    time: new Date().toISOString(),
  }),
);

/**
 * Route table.
 *
 *   /auth           — session issue + profile          (public / any role)
 *   /services       — catalogue                        (public)
 *   /workers        — discovery + the WORKER panel     (public / role=worker)
 *   /bookings       — the CUSTOMER panel               (role=customer)
 *   /admin          — the ADMIN panel                  (role=admin)
 *   /insights       — demand analytics                 (any signed-in role)
 *   /reviews        — ratings                          (public read / customer write)
 *   /notifications  — per-user inbox                   (any signed-in role)
 *   /cooperatives   — reference data                   (public)
 */
router.use('/auth', authRoutes);
router.use('/services', serviceRoutes);
router.use('/workers', workerRoutes);
router.use('/bookings', bookingRoutes);
router.use('/reviews', reviewRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);
router.use('/insights', insightsRoutes);

router.get('/cooperatives', listCooperatives);
router.get('/cooperatives/:id', validate({ params: idParam }), getCooperative);

export default router;
