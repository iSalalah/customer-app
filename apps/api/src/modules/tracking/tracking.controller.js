import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/respond.js';
import * as trackingService from './tracking.service.js';

export const trackRequest = asyncHandler(async (req, res) => {
  const tracking = await trackingService.trackByReference(req.params.referenceNumber);
  return sendSuccess(res, { tracking });
});
