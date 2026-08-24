import { Router } from 'express';
import * as ctrl from '../controllers/notification.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { idParam } from '../validators/schemas.js';

const router = Router();

router.get('/', requireAuth, ctrl.list);
router.post('/read-all', requireAuth, ctrl.markAllRead);
router.post('/:id/read', requireAuth, validate({ params: idParam }), ctrl.markRead);

export default router;
