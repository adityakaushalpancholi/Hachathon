import { Router } from 'express';
import * as ctrl from '../controllers/insights.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { forecastQuery, trendQuery } from '../validators/schemas.js';

const router = Router();

/* Insights are readable by any signed-in user, by design: a worker deciding
   where to position themselves needs the same demand picture the board sees.
   Financial breakdowns stay behind /api/admin.                               */

router.use(requireAuth);

router.get('/forecast', validate({ query: forecastQuery }), ctrl.demandForecast);
router.get('/profiles', validate({ query: forecastQuery.partial() }), ctrl.profiles);
router.get('/gaps', ctrl.gaps);
router.get('/trend', validate({ query: trendQuery }), ctrl.trend);
router.get('/zones', validate({ query: trendQuery.partial() }), ctrl.zones);
router.get('/surge', ctrl.surgeBoard);

export default router;
