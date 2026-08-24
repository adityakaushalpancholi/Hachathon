import { Router } from 'express';
import * as ctrl from '../controllers/review.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';
import { createReviewSchema, idParam } from '../validators/schemas.js';

const router = Router();

router.get('/worker/:id', validate({ params: idParam }), ctrl.listForWorker);

router.get('/mine', requireAuth, requireRole(ROLES.CUSTOMER), ctrl.listMine);
router.post('/', requireAuth, requireRole(ROLES.CUSTOMER), validate({ body: createReviewSchema }), ctrl.create);

export default router;
