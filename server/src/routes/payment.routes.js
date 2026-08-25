import { Router } from 'express';
import * as ctrl from '../controllers/payment.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { paymentLimiter } from '../middleware/rateLimit.js';
import { createOrderSchema, verifyPaymentSchema, idParam } from '../validators/schemas.js';

const router = Router();

/** Public: lets the client know whether to render a Pay button at all. */
router.get('/config', ctrl.config);

router.post(
  '/order',
  requireAuth,
  paymentLimiter,
  validate({ body: createOrderSchema }),
  ctrl.order,
);

router.post(
  '/verify',
  requireAuth,
  validate({ body: verifyPaymentSchema }),
  ctrl.verify,
);

router.get('/booking/:id', requireAuth, validate({ params: idParam }), ctrl.forBooking);

export default router;
