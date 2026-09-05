import { Router } from 'express';

import analyticsRoutes from '../modules/analytics/analytics.routes.js';
import catalogRoutes from '../modules/catalog/catalog.routes.js';
import citizenAuthRoutes from '../modules/citizenAuth/citizenAuth.routes.js';
import citizenRequestRoutes from '../modules/requests/citizenRequests.routes.js';
import healthRoutes from '../modules/health/health.routes.js';
import staffAuthRoutes from '../modules/staffAuth/staffAuth.routes.js';
import staffRequestRoutes from '../modules/requests/staffRequests.routes.js';
import trackingRoutes from '../modules/tracking/tracking.routes.js';

/** Composition of /api/v1. Ordering is public -> citizen -> staff. */
const router = Router();

router.use('/', healthRoutes);
router.use('/', catalogRoutes);
router.use('/public', trackingRoutes);

router.use('/auth/citizen', citizenAuthRoutes);
router.use('/citizen/requests', citizenRequestRoutes);

router.use('/auth/staff', staffAuthRoutes);
router.use('/staff/requests', staffRequestRoutes);
router.use('/staff/analytics', analyticsRoutes);

export default router;
