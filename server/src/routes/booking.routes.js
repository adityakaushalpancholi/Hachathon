import { Router } from 'express';
import * as ctrl from '../controllers/booking.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { bookingLimiter } from '../middleware/rateLimit.js';
import { ROLES } from '../config/constants.js';
import {
  quoteSchema,
  createBookingSchema,
  listBookingsQuery,
  cancelSchema,
  paymentSchema,
  idParam,
} from '../validators/schemas.js';

const router = Router();

/* ----------------------------- CUSTOMER PANEL ---------------------------- */

const customerOnly = [requireAuth, requireRole(ROLES.CUSTOMER)];

// Quoting is open to any signed-in user so a worker can check the going rate too.
router.post('/quote', requireAuth, validate({ body: quoteSchema }), ctrl.getQuote);

router.get('/dashboard', customerOnly, ctrl.customerDashboard);
router.get('/', customerOnly, validate({ query: listBookingsQuery }), ctrl.listMine);
router.post('/', customerOnly, bookingLimiter, validate({ body: createBookingSchema }), ctrl.create);

router.get('/:id', customerOnly, validate({ params: idParam }), ctrl.getOne);
router.get('/:id/track', customerOnly, validate({ params: idParam }), ctrl.track);
router.post('/:id/cancel', customerOnly, validate({ params: idParam, body: cancelSchema }), ctrl.cancel);
router.post('/:id/retry', customerOnly, validate({ params: idParam }), ctrl.retry);
router.post('/:id/pay', customerOnly, validate({ params: idParam, body: paymentSchema }), ctrl.pay);

// SOS is the one booking action either side of the job may take.
router.post('/:id/sos', requireAuth, validate({ params: idParam }), ctrl.sos);

export default router;
