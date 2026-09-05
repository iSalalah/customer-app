import { Router } from 'express';

import { noCache } from '../../middleware/noCache.js';
import { trackingLimiter } from '../../middleware/rateLimit.js';
import { validateParams } from '../../middleware/validate.js';
import { referenceNumberParams } from '../requests/requests.schemas.js';
import { trackRequest } from './tracking.controller.js';

const router = Router();

// noCache runs first so that even a 429 carries no-store: a cached rate-limit
// response on a shared kiosk would keep showing an error after the window
// reopens. The limiter then runs before validation, so a malformed reference
// still consumes a token and cannot be used to probe the endpoint for free.
router.get(
  '/requests/:referenceNumber/status',
  noCache,
  trackingLimiter,
  validateParams(referenceNumberParams),
  trackRequest,
);

export default router;
