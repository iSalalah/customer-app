import { Router } from 'express';

import { validateParams } from '../../middleware/validate.js';
import { listDepartmentServices, listDepartments } from './catalog.controller.js';
import { departmentIdParams } from './catalog.schemas.js';

const router = Router();

// Public catalogue: no authentication, and nothing here is citizen-specific.
router.get('/departments', listDepartments);
router.get(
  '/departments/:departmentId/services',
  validateParams(departmentIdParams),
  listDepartmentServices,
);

export default router;
