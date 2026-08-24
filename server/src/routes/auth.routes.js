import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, otpRequestLimiter, otpVerifyLimiter } from '../middleware/rateLimit.js';
import {
  registerSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  updateProfileSchema,
  addAddressSchema,
  idParam,
} from '../validators/schemas.js';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), ctrl.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), ctrl.login);

// Phone-first sign-in. `verify` both logs in and registers, so a new number
// needs no separate sign-up step.
router.post('/otp/request', otpRequestLimiter, validate({ body: otpRequestSchema }), ctrl.requestOtp);
router.post('/otp/verify', otpVerifyLimiter, validate({ body: otpVerifySchema }), ctrl.verifyOtpLogin);

// `/me` is what the client calls on boot to learn which panel it may mount.
router.get('/me', requireAuth, ctrl.me);
router.patch('/me', requireAuth, validate({ body: updateProfileSchema }), ctrl.updateProfile);

router.post('/addresses', requireAuth, validate({ body: addAddressSchema }), ctrl.addAddress);
router.delete('/addresses/:id', requireAuth, validate({ params: idParam }), ctrl.deleteAddress);

export default router;
