import { pipeline } from 'node:stream/promises';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../../utils/respond.js';
import { attachmentDownloadHeaders, openAttachmentStream } from '../attachments/attachments.service.js';
import * as requestsService from './requests.service.js';

export const listRequests = asyncHandler(async (req, res) => {
  const { data, meta } = await requestsService.listForStaff({
    staffScope: req.staffScope,
    query: req.query,
  });
  return sendSuccess(res, data, { meta });
});

export const getRequest = asyncHandler(async (req, res) => {
  const result = await requestsService.getForStaff({
    staffScope: req.staffScope,
    requestId: req.params.requestId,
  });
  return sendSuccess(res, result);
});

export const listLogs = asyncHandler(async (req, res) => {
  const { data, meta } = await requestsService.listLogsForStaff({
    staffScope: req.staffScope,
    requestId: req.params.requestId,
    query: req.query,
  });
  return sendSuccess(res, data, { meta });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const result = await requestsService.updateStatus({
    staff: req.staff,
    staffScope: req.staffScope,
    requestId: req.params.requestId,
    status: req.body.status,
    note: req.body.note,
    noteVisibility: req.body.noteVisibility,
  });
  return sendSuccess(res, result);
});

export const updateAssignment = asyncHandler(async (req, res) => {
  const result = await requestsService.updateAssignment({
    staff: req.staff,
    staffScope: req.staffScope,
    requestId: req.params.requestId,
    assignedTo: req.body.assignedTo,
  });
  return sendSuccess(res, result);
});

export const addNote = asyncHandler(async (req, res) => {
  const result = await requestsService.addNote({
    staff: req.staff,
    staffScope: req.staffScope,
    requestId: req.params.requestId,
    message: req.body.message,
    visibility: req.body.visibility,
  });
  return sendCreated(res, result);
});

export const downloadAttachment = asyncHandler(async (req, res) => {
  const attachment = await requestsService.getStaffAttachment({
    staffScope: req.staffScope,
    requestId: req.params.requestId,
    attachmentId: req.params.attachmentId,
  });

  const stream = await openAttachmentStream(attachment);
  res.set(attachmentDownloadHeaders(attachment));
  await pipeline(stream, res);
});
