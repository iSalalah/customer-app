import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/respond.js';
import * as analyticsService from './analytics.service.js';

export const getSummary = asyncHandler(async (req, res) => {
  const summary = await analyticsService.summary({ staffScope: req.staffScope });
  return sendSuccess(res, { summary });
});
