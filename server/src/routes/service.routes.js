import { Router } from 'express';
import * as ctrl from '../controllers/service.controller.js';
import { validate } from '../middleware/validate.js';
import { listServicesQuery, idParam } from '../validators/schemas.js';

const router = Router();

// The catalogue is public — browsing does not require an account.
router.get('/', validate({ query: listServicesQuery }), ctrl.listServices);
router.get('/categories', ctrl.listCategories);
router.get('/:id', validate({ params: idParam }), ctrl.getService);
router.get('/:id/reviews', validate({ params: idParam }), ctrl.serviceReviews);

export default router;
