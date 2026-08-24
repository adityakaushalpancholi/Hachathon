import { Router } from 'express';
import * as ctrl from '../controllers/database.controller.js';
import { requireAuth, requireRole, requireOwner } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();

/* ----------------------------- DATABASE PANEL ----------------------------- */
/* Owner-only, not merely admin-only. An admin runs the cooperative; the owner
   runs the deployment. Direct collection access belongs to the second job, and
   requireOwner checks the environment allowlist rather than anything stored.   */

router.use(requireAuth, requireRole(ROLES.ADMIN), requireOwner);

router.get('/', ctrl.overview);
router.get('/config', ctrl.configSummary);

router.get('/:collection', ctrl.listDocuments);
router.get('/:collection/indexes', ctrl.listIndexes);
router.get('/:collection/:id', ctrl.getDocument);
router.delete('/:collection/:id', ctrl.deleteDocument);

export default router;
