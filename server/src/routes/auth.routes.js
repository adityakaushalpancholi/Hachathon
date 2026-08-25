import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
  addAddressSchema,
  idParam,
} from '../validators/schemas.js';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), ctrl.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), ctrl.login);

// Changing a credential is a credential operation, so it shares the tight
// budget rather than the general one.
router.post(
  '/password',
  authLimiter,
  requireAuth,
  validate({ body: changePasswordSchema }),
  ctrl.changePassword,
);

// `/me` is what the client calls on boot to learn which panel it may mount.
router.get('/me', requireAuth, ctrl.me);
router.patch('/me', requireAuth, validate({ body: updateProfileSchema }), ctrl.updateProfile);

router.post('/addresses', requireAuth, validate({ body: addAddressSchema }), ctrl.addAddress);
router.delete('/addresses/:id', requireAuth, validate({ params: idParam }), ctrl.deleteAddress);

export default router;
