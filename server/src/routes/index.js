import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from './auth.routes.js';
import serviceRoutes from './service.routes.js';
import workerRoutes from './worker.routes.js';
import bookingRoutes from './booking.routes.js';
import reviewRoutes from './review.routes.js';
import notificationRoutes from './notification.routes.js';
import adminRoutes from './admin.routes.js';
import databaseRoutes from './database.routes.js';
import paymentRoutes from './payment.routes.js';
import insightsRoutes from './insights.routes.js';
import { listCooperatives, getCooperative } from '../controllers/notification.controller.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/schemas.js';
import { ok } from '../utils/respond.js';
import { isEphemeral } from '../config/db.js';
import { areasForClient } from '../config/areas.js';

const router = Router();

/** Liveness + which datastore we are actually talking to. */
router.get('/health', (_req, res) =>
  ok(res, {
    status: 'ok',
    uptimeSec: Math.round(process.uptime()),
    db: {
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState],
      name: mongoose.connection.name,
      // Host distinguishes a real cluster from the throwaway in-memory server,
      // which a bare connection state cannot: both report "connected" to
      // "shramsetu". No credentials appear here — only the resolved host.
      host: mongoose.connection.host,
      ephemeral: isEphemeral(),
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
 *   /database       — raw collection browser           (owner only)
 *   /payments       — Razorpay orders + verification   (role=customer)
 *   /insights       — demand analytics                 (any signed-in role)
 *   /reviews        — ratings                          (public read / customer write)
 *   /notifications  — per-user inbox                   (any signed-in role)
 *   /areas          — serviceable areas + centres        (public)
 *   /cooperatives   — reference data                   (public)
 */
router.use('/auth', authRoutes);
router.use('/services', serviceRoutes);
router.use('/workers', workerRoutes);
router.use('/bookings', bookingRoutes);
router.use('/reviews', reviewRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);
router.use('/database', databaseRoutes);
router.use('/payments', paymentRoutes);
router.use('/insights', insightsRoutes);

/**
 * Where the service operates. Public and unauthenticated because the address
 * form needs it before anyone has signed in, and because it is not a secret —
 * it is the answer to "do you cover my area?".
 */
router.get('/areas', (_req, res) => ok(res, areasForClient()));

router.get('/cooperatives', listCooperatives);
router.get('/cooperatives/:id', validate({ params: idParam }), getCooperative);

export default router;
