import { Router } from 'express';

import { verifyCsrf } from '../../middleware/csrf.js';
import { noCache } from '../../middleware/noCache.js';
import { uploadLimiter } from '../../middleware/rateLimit.js';
import { acceptAttachments } from '../../middleware/upload.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { requireCitizen } from '../../auth/requireCitizen.js';
import {
  addAttachments,
  addReply,
  createRequest,
  downloadAttachment,
  getMyRequest,
  listMyRequests,
} from './citizenRequests.controller.js';
import {
  citizenReplyBody,
  citizenRequestListQuery,
  createRequestBody,
  referenceAttachmentParams,
  referenceNumberParams,
} from './requests.schemas.js';

const router = Router();

// Everything here is one citizen's data: never cached, always authenticated,
// and the idle clock is evaluated inside requireCitizen on every call.
router.use(noCache, requireCitizen);

router.get('/', validateQuery(citizenRequestListQuery), listMyRequests);

router.post(
  '/',
  verifyCsrf,
  uploadLimiter,
  // Multer must run before validation: the body fields do not exist until the
  // multipart stream has been parsed.
  acceptAttachments('attachments'),
  validateBody(createRequestBody),
  createRequest,
);

router.get('/:referenceNumber', validateParams(referenceNumberParams), getMyRequest);

router.post(
  '/:referenceNumber/attachments',
  verifyCsrf,
  uploadLimiter,
  validateParams(referenceNumberParams),
  acceptAttachments('attachments'),
  addAttachments,
);

router.get(
  '/:referenceNumber/attachments/:attachmentId',
  validateParams(referenceAttachmentParams),
  downloadAttachment,
);

router.post(
  '/:referenceNumber/replies',
  verifyCsrf,
  uploadLimiter,
  validateParams(referenceNumberParams),
  acceptAttachments('attachments'),
  validateBody(citizenReplyBody),
  addReply,
);

export default router;
