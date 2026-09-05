import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/respond.js';
import * as catalogService from './catalog.service.js';

export const listDepartments = asyncHandler(async (_req, res) => {
  const departments = await catalogService.listDepartments();
  return sendSuccess(res, { departments }, { meta: { count: departments.length } });
});

export const listDepartmentServices = asyncHandler(async (req, res) => {
  const result = await catalogService.listServices(req.params.departmentId);
  return sendSuccess(res, result, { meta: { count: result.services.length } });
});
