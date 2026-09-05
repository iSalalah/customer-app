import { Router } from 'express';

import { verifyCsrf } from '../../middleware/csrf.js';
import { noCache } from '../../middleware/noCache.js';
import { staffLoginLimiter } from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validate.js';
import { requireStaff } from '../../auth/requireStaff.js';
import { login, logout, me, refresh } from './staffAuth.controller.js';
import { staffLoginBody, staffLogoutBody } from './staffAuth.schemas.js';

const router = Router();

router.use(noCache);

router.post('/login', staffLoginLimiter, verifyCsrf, validateBody(staffLoginBody), login);
// Refresh authenticates with the refresh cookie itself; requireStaff would
// reject it, since the access token is exactly what has expired by then.
router.post('/refresh', verifyCsrf, refresh);
router.post('/logout', verifyCsrf, requireStaff(), validateBody(staffLogoutBody), logout);
router.get('/me', requireStaff(), me);

export default router;
