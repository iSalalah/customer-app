import { sendSuccess } from '../../utils/respond.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as healthService from './health.service.js';

export const getHealth = asyncHandler(async (_req, res) => {
  return sendSuccess(res, healthService.liveness());
});

export const getReadiness = asyncHandler(async (_req, res) => {
  const result = await healthService.readiness();
  return sendSuccess(res, result, { status: result.ready ? 200 : 503 });
});
