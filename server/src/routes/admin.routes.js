import { Router } from 'express';
import * as ctrl from '../controllers/admin.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';
import {
  listWorkersQuery,
  listBookingsQuery,
  verifyWorkerSchema,
  settlementSchema,
  trendQuery,
  cancelSchema,
  idParam,
} from '../validators/schemas.js';

const router = Router();

/* ------------------------------ ADMIN PANEL ------------------------------ */
/* Every route here requires a token with role=admin. Results are additionally
   scoped to the admin's own cooperative inside each controller, so one coop's
   board cannot read another's members, bookings or ledgers.                   */

router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get('/overview', ctrl.overview);

router.get('/workers', validate({ query: listWorkersQuery }), ctrl.listWorkers);
router.patch('/workers/:id/verification', validate({ params: idParam, body: verifyWorkerSchema }), ctrl.setVerification);
router.patch('/workers/:id/documents/:docId', validate({ params: idParam }), ctrl.reviewDocument);

router.get('/bookings', validate({ query: listBookingsQuery }), ctrl.listBookings);

router.get('/sos', ctrl.listSos);
router.post('/sos/:id/resolve', validate({ params: idParam, body: cancelSchema.partial() }), ctrl.resolveSos);

router.post('/settlements/preview', validate({ body: settlementSchema.partial() }), ctrl.previewSettlement);
router.post('/settlements/run', validate({ body: settlementSchema.partial() }), ctrl.runSettlement);
router.get('/payouts', ctrl.listPayouts);
router.post('/payouts/:id/approve', validate({ params: idParam }), ctrl.approvePayout);

router.get('/workforce', ctrl.workforceReport);
router.get('/heatmap', validate({ query: trendQuery.partial() }), ctrl.heatmap);
router.get('/reviews/flagged', ctrl.flaggedReviews);

export default router;
