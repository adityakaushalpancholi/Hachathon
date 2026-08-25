import { Router } from 'express';
import * as ctrl from '../controllers/worker.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole, requireWorkerProfile } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';
import {
  listWorkersQuery,
  nearbyQuery,
  availabilitySchema,
  jobCodeSchema,
  cancelSchema,
  declineSchema,
  respondReviewSchema,
  idParam,
} from '../validators/schemas.js';

const router = Router();

/* ---------------------------- public discovery --------------------------- */

router.get('/', validate({ query: listWorkersQuery }), ctrl.listWorkers);
router.get('/nearby', validate({ query: nearbyQuery }), ctrl.nearby);

/* ------------------------------ WORKER PANEL ----------------------------- */
/* Everything below is gated on a token carrying role=worker AND a provisioned
   worker profile. Declared before `/:id` so 'me' is never read as an id.       */

const workerOnly = [requireAuth, requireRole(ROLES.WORKER), requireWorkerProfile];

router.get('/me/dashboard', workerOnly, ctrl.workerDashboard);
router.get('/me/earnings', workerOnly, ctrl.earnings);
router.get('/me/offers', workerOnly, ctrl.listOffers);
router.patch('/me/availability', workerOnly, validate({ body: availabilitySchema }), ctrl.setAvailability);
router.post('/me/location', workerOnly, ctrl.pingLocation);

router.post('/me/offers/:id/accept', workerOnly, validate({ params: idParam }), ctrl.accept);
router.post('/me/offers/:id/decline', workerOnly, validate({ params: idParam, body: declineSchema }), ctrl.decline);

router.post('/me/jobs/:id/enroute', workerOnly, validate({ params: idParam }), ctrl.markEnroute);
router.post('/me/jobs/:id/arrived', workerOnly, validate({ params: idParam }), ctrl.markArrived);
router.post('/me/jobs/:id/start', workerOnly, validate({ params: idParam, body: jobCodeSchema }), ctrl.start);
router.post('/me/jobs/:id/complete', workerOnly, validate({ params: idParam, body: jobCodeSchema }), ctrl.complete);
router.post('/me/jobs/:id/cancel', workerOnly, validate({ params: idParam, body: cancelSchema }), ctrl.workerCancel);

router.post('/me/reviews/:id/respond', workerOnly, validate({ params: idParam, body: respondReviewSchema }), ctrl.respondToReview);

/* ------------------------------- public last ----------------------------- */

router.get('/:id', validate({ params: idParam }), ctrl.getWorker);

export default router;
