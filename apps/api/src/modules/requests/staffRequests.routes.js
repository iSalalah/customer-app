import { Router } from 'express';

import { STAFF_ROLE } from '@dhofar/shared';

import { verifyCsrf } from '../../middleware/csrf.js';
import { noCache } from '../../middleware/noCache.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { requireStaff } from '../../auth/requireStaff.js';
import {
  addNote,
  downloadAttachment,
  getRequest,
  listLogs,
  listRequests,
  updateAssignment,
  updateStatus,
} from './staffRequests.controller.js';
import {
  addNoteBody,
  logListQuery,
  requestAttachmentParams,
  requestIdParams,
  staffRequestListQuery,
  updateAssignmentBody,
  updateStatusBody,
} from './requests.schemas.js';

const router = Router();

router.use(noCache);

router.get('/', requireStaff(), validateQuery(staffRequestListQuery), listRequests);

router.get('/:requestId', requireStaff(), validateParams(requestIdParams), getRequest);

router.get(
  '/:requestId/logs',
  requireStaff(),
  validateParams(requestIdParams),
  validateQuery(logListQuery),
  listLogs,
);

// Route-level role gate. The service still re-checks scope against the loaded
// row - this only stops an employee before any query runs.
router.patch(
  '/:requestId/assignment',
  verifyCsrf,
  requireStaff(STAFF_ROLE.MANAGER, STAFF_ROLE.SECTION_HEAD),
  validateParams(requestIdParams),
  validateBody(updateAssignmentBody),
  updateAssignment,
);

router.patch(
  '/:requestId/status',
  verifyCsrf,
  requireStaff(),
  validateParams(requestIdParams),
  validateBody(updateStatusBody),
  updateStatus,
);

router.post(
  '/:requestId/notes',
  verifyCsrf,
  requireStaff(),
  validateParams(requestIdParams),
  validateBody(addNoteBody),
  addNote,
);

router.get(
  '/:requestId/attachments/:attachmentId',
  requireStaff(),
  validateParams(requestAttachmentParams),
  downloadAttachment,
);

export default router;
