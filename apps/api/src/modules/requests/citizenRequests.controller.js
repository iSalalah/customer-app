import { pipeline } from 'node:stream/promises';

import { HEADER_NAMES } from '@dhofar/shared';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../../utils/respond.js';
import { serializeAttachment } from '../../utils/serializers.js';
import { inspectUploadedFiles } from '../../middleware/upload.js';
import { attachmentDownloadHeaders, openAttachmentStream } from '../attachments/attachments.service.js';
import * as requestsService from './requests.service.js';

export const listMyRequests = asyncHandler(async (req, res) => {
  const { data, meta } = await requestsService.listForCitizen({
    citizenId: req.citizen.id,
    query: req.query,
  });
  return sendSuccess(res, data, { meta });
});

export const createRequest = asyncHandler(async (req, res) => {
  const files = await inspectUploadedFiles(req.files ?? []);

  const result = await requestsService.createRequest({
    citizen: req.citizen,
    body: req.body,
    files,
    idempotencyKey: req.get(HEADER_NAMES.IDEMPOTENCY_KEY),
    req,
  });

  // A replayed submission is a success, not a conflict: the citizen tapped
  // twice and their request exists exactly once.
  return result.replayed
    ? sendSuccess(res, result)
    : sendCreated(res, result);
});

export const getMyRequest = asyncHandler(async (req, res) => {
  const request = await requestsService.getForCitizen({
    citizenId: req.citizen.id,
    referenceNumber: req.params.referenceNumber,
  });
  return sendSuccess(res, { request });
});

export const addAttachments = asyncHandler(async (req, res) => {
  const files = await inspectUploadedFiles(req.files ?? []);
  const attachments = await requestsService.addCitizenAttachments({
    citizen: req.citizen,
    referenceNumber: req.params.referenceNumber,
    files,
  });
  return sendCreated(res, { attachments: attachments.map(serializeAttachment) });
});

export const addReply = asyncHandler(async (req, res) => {
  const files = await inspectUploadedFiles(req.files ?? []);
  const request = await requestsService.addCitizenReply({
    citizen: req.citizen,
    referenceNumber: req.params.referenceNumber,
    message: req.body.message,
    files,
  });
  return sendCreated(res, { request });
});

export const downloadAttachment = asyncHandler(async (req, res) => {
  const attachment = await requestsService.getCitizenAttachment({
    citizenId: req.citizen.id,
    referenceNumber: req.params.referenceNumber,
    attachmentId: req.params.attachmentId,
  });

  const stream = await openAttachmentStream(attachment);
  res.set(attachmentDownloadHeaders(attachment));
  await pipeline(stream, res);
});
