import { Router } from 'express';

import { noCache } from '../../middleware/noCache.js';
import { requireStaff } from '../../auth/requireStaff.js';
import { getSummary } from './analytics.controller.js';

const router = Router();

// No scope parameters by design: the summary is derived from the caller's role.
router.get('/summary', noCache, requireStaff(), getSummary);

export default router;
