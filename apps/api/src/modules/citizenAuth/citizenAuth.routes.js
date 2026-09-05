import { Router } from 'express';

import { verifyCsrf } from '../../middleware/csrf.js';
import { noCache } from '../../middleware/noCache.js';
import { otpRequestLimiter, otpVerifyLimiter } from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validate.js';
import { requireCitizen } from '../../auth/requireCitizen.js';
import { logout, me, requestOtp, resendOtp, verifyOtp } from './citizenAuth.controller.js';
import { otpRequestBody, otpResendBody, otpVerifyBody } from './citizenAuth.schemas.js';

const router = Router();

// Nothing on this router may be cached: every response is about one citizen.
router.use(noCache);

router.post('/otp/request', otpRequestLimiter, verifyCsrf, validateBody(otpRequestBody), requestOtp);
router.post('/otp/resend', otpRequestLimiter, verifyCsrf, validateBody(otpResendBody), resendOtp);
router.post('/otp/verify', otpVerifyLimiter, verifyCsrf, validateBody(otpVerifyBody), verifyOtp);
router.post('/logout', verifyCsrf, requireCitizen, logout);
router.get('/me', requireCitizen, me);

export default router;
