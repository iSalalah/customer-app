import { Prisma } from '@prisma/client';

import {
  ERROR_CODE,
  LOG_ACTOR_TYPE,
  LOG_VISIBILITY,
  REQUEST_LOG_ACTION,
  REQUEST_STATUS,
  allowedTransitionsFrom,
  buildTrackingUrl,
  endOfDayUtc,
  startOfDayUtc,
} from '@dhofar/shared';

import { getConfig } from '../../config/index.js';
import { generateReferenceNumber } from '../../infra/crypto/reference.js';
import { redis, redisKeys } from '../../infra/redis.js';
import { logger } from '../../infra/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildOrderBy, buildPageMeta, toSkipTake } from '../../utils/pagination.js';
import {
  serializeCitizenRequestDetail,
  serializeCitizenRequestSummary,
  serializeStaffLog,
  serializeStaffRequestDetail,
  serializeStaffRequestSummary,
} from '../../utils/serializers.js';
import {
  assertCanAssign,
  assertCanUpdateStatus,
  assertCanViewRequest,
  assertCitizenMayReply,
  assertCitizenOwnsRequest,
  assertValidAssignee,
  scopeWhere,
} from '../../auth/policies.js';
import { resolveRouting } from '../catalog/catalog.service.js';
import { assertWithinAttachmentBudget, scanAndStore } from '../attachments/attachments.service.js';
import * as repository from './requests.repository.js';

const config = getConfig();

const REFERENCE_MAX_ATTEMPTS = 5;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/**
 * Injection seam for the reference generator, matching the storage, SMS and
 * scanner adapters. It exists so the collision-retry path can be exercised
 * deterministically instead of waiting for a 1-in-a-billion natural collision.
 * Production never calls the setter.
 */
let referenceGenerator = generateReferenceNumber;

export function setReferenceGenerator(generator) {
  referenceGenerator = generator ?? generateReferenceNumber;
}

const CITIZEN_SORT_FIELDS = ['createdAt', 'updatedAt', 'status'];
const STAFF_SORT_FIELDS = ['createdAt', 'updatedAt', 'status', 'referenceNumber'];

function dateRangeFilter(from, to) {
  const gte = from ? startOfDayUtc(from) : null;
  const lte = to ? endOfDayUtc(to) : null;
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte: new Date(gte) } : {}), ...(lte ? { lte: new Date(lte) } : {}) };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/**
 * Creates a request.
 *
 * Three separate guarantees are woven together here:
 *
 *   Routing      - departmentId/sectionId come from `resolveRouting`, which reads
 *                  the stored service row. The body cannot influence them.
 *   Idempotency  - a Redis replay cache plus the unique index on
 *                  (citizenId, idempotencyKey). A double tap returns the FIRST
 *                  reference number instead of creating a second request.
 *   Atomicity    - the request, its attachments and its opening log entries
 *                  commit together; if they do not, every stored object is
 *                  deleted before the error propagates.
 */
export async function createRequest({ citizen, body, files, idempotencyKey, req }) {
  if (!idempotencyKey) {
    throw ApiError.badRequest(
      ERROR_CODE.IDEMPOTENCY_KEY_REQUIRED,
      'A submission identifier is required.',
    );
  }

  // Fast path: this exact key was already submitted.
  const cachedReference = await redis.get(redisKeys.idempotency(citizen.id, idempotencyKey));
  if (cachedReference) {
    return { referenceNumber: cachedReference, replayed: true, ...(await describeCreated(cachedReference)) };
  }

  const existing = await repository.findExistingIdempotentRequest(citizen.id, idempotencyKey);
  if (existing) {
    await cacheIdempotency(citizen.id, idempotencyKey, existing.referenceNumber);
    return {
      referenceNumber: existing.referenceNumber,
      status: existing.status,
      createdAt: existing.createdAt.toISOString(),
      trackingUrl: buildTrackingUrl(config.urls.trackingBase, existing.referenceNumber),
      replayed: true,
    };
  }

  const routing = await resolveRouting(body.serviceId);

  assertWithinAttachmentBudget({
    existingCount: 0,
    incomingCount: files.length,
    policy: routing.attachmentPolicy,
  });

  const { rows: attachmentRows, rollback } = await scanAndStore({
    files,
    uploadedByType: LOG_ACTOR_TYPE.CITIZEN,
    uploadedById: citizen.id,
  });

  try {
    const created = await createWithUniqueReference({
      citizenId: citizen.id,
      routing,
      body,
      idempotencyKey,
      attachmentRows,
    });

    await cacheIdempotency(citizen.id, idempotencyKey, created.referenceNumber);

    logger.info(
      { referenceNumber: created.referenceNumber, departmentId: routing.departmentId, sectionId: routing.sectionId },
      'request created',
    );

    return {
      referenceNumber: created.referenceNumber,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      trackingUrl: buildTrackingUrl(config.urls.trackingBase, created.referenceNumber),
      replayed: false,
    };
  } catch (error) {
    // Nothing may survive a failed creation: delete every object written above.
    await rollback();

    // Two concurrent taps that both passed the pre-check race here; the unique
    // index settles it and the loser reads the winner's row.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await repository.findExistingIdempotentRequest(citizen.id, idempotencyKey);
      if (winner) {
        await cacheIdempotency(citizen.id, idempotencyKey, winner.referenceNumber);
        return {
          referenceNumber: winner.referenceNumber,
          status: winner.status,
          createdAt: winner.createdAt.toISOString(),
          trackingUrl: buildTrackingUrl(config.urls.trackingBase, winner.referenceNumber),
          replayed: true,
        };
      }
      throw ApiError.conflict(ERROR_CODE.DUPLICATE_SUBMISSION, 'This request has already been submitted.');
    }

    logger.error(
      { err: { message: error.message }, requestId: req?.id },
      'request creation failed; stored objects rolled back',
    );
    throw error;
  }
}

async function describeCreated(referenceNumber) {
  const row = await repository.findPublicTracking(referenceNumber);
  return {
    status: row?.status ?? REQUEST_STATUS.PENDING,
    createdAt: row ? row.createdAt.toISOString() : new Date().toISOString(),
    trackingUrl: buildTrackingUrl(config.urls.trackingBase, referenceNumber),
  };
}

function cacheIdempotency(citizenId, key, referenceNumber) {
  return redis.set(redisKeys.idempotency(citizenId, key), referenceNumber, 'EX', IDEMPOTENCY_TTL_SECONDS);
}

/**
 * Reference-number generation with collision retry.
 *
 * The unique index is the arbiter. A P2002 whose target is `referenceNumber`
 * means two requests drew the same 6-character suffix in the same year, so a
 * new one is drawn. Any other P2002 (the idempotency key) is a real duplicate
 * and is re-thrown for the caller to resolve.
 */
async function createWithUniqueReference({ citizenId, routing, body, idempotencyKey, attachmentRows }) {
  let lastError = null;

  for (let attempt = 0; attempt < REFERENCE_MAX_ATTEMPTS; attempt += 1) {
    const referenceNumber = referenceGenerator();

    const logs = [
      {
        actorType: LOG_ACTOR_TYPE.CITIZEN,
        citizenId,
        action: REQUEST_LOG_ACTION.CREATED,
        newStatus: REQUEST_STATUS.PENDING,
        visibility: LOG_VISIBILITY.CITIZEN_VISIBLE,
        notes: null,
        metadata: { serviceId: routing.serviceId, attachmentCount: attachmentRows.length },
      },
      {
        actorType: LOG_ACTOR_TYPE.SYSTEM,
        action: REQUEST_LOG_ACTION.AUTO_ROUTED,
        visibility: LOG_VISIBILITY.INTERNAL,
        notes: null,
        metadata: {
          departmentId: routing.departmentId,
          sectionId: routing.sectionId,
          resolvedFromServiceId: routing.serviceId,
        },
      },
    ];

    if (attachmentRows.length > 0) {
      logs.push({
        actorType: LOG_ACTOR_TYPE.CITIZEN,
        citizenId,
        action: REQUEST_LOG_ACTION.ATTACHMENT_ADDED,
        visibility: LOG_VISIBILITY.CITIZEN_VISIBLE,
        notes: null,
        metadata: { fileNames: attachmentRows.map((row) => row.originalFileName) },
      });
    }

    try {
      return await repository.createRequestTransaction({
        data: {
          referenceNumber,
          idempotencyKey,
          citizenId,
          serviceId: routing.serviceId,
          departmentId: routing.departmentId,
          sectionId: routing.sectionId,
          title: body.title,
          description: body.description,
          status: REQUEST_STATUS.PENDING,
        },
        attachments: attachmentRows,
        logs,
      });
    } catch (error) {
      const isReferenceCollision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String(error.meta?.target ?? '').includes('referenceNumber');

      if (!isReferenceCollision) throw error;

      lastError = error;
      logger.warn({ attempt: attempt + 1 }, 'reference number collision; regenerating');
    }
  }

  throw ApiError.internal('The request could not be registered. Please try again.', {
    logContext: { reason: 'reference number collision retries exhausted', lastError: lastError?.message },
  });
}

// ---------------------------------------------------------------------------
// Citizen reads
// ---------------------------------------------------------------------------

export async function listForCitizen({ citizenId, query }) {
  const { skip, take, page, pageSize } = toSkipTake(query);
  const createdAt = dateRangeFilter(query.from, query.to);

  const { items, total } = await repository.listCitizenRequests({
    citizenId,
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(createdAt ? { createdAt } : {}),
    },
    skip,
    take,
    orderBy: buildOrderBy(query.sort, CITIZEN_SORT_FIELDS, { createdAt: 'desc' }),
  });

  return {
    data: { requests: items.map(serializeCitizenRequestSummary) },
    meta: buildPageMeta({ page, pageSize, total }),
  };
}

export async function getForCitizen({ citizenId, referenceNumber }) {
  const request = await repository.findByReferenceForCitizen(referenceNumber);
  assertCitizenOwnsRequest(request, citizenId);

  const [logs, attachments] = await Promise.all([
    repository.listCitizenVisibleLogs(request.id),
    repository.listAttachments(request.id),
  ]);

  return serializeCitizenRequestDetail(request, { logs, attachments });
}

export async function getOwnedRequestOrThrow({ citizenId, referenceNumber }) {
  const request = await repository.findByReferenceForCitizen(referenceNumber);
  return assertCitizenOwnsRequest(request, citizenId);
}

// ---------------------------------------------------------------------------
// Citizen writes
// ---------------------------------------------------------------------------

export async function addCitizenReply({ citizen, referenceNumber, message, files }) {
  const request = await getOwnedRequestOrThrow({ citizenId: citizen.id, referenceNumber });
  assertCitizenMayReply(request);

  let attachmentRows = [];
  let rollback = async () => {};

  if (files.length > 0) {
    const existingCount = await repository.countAttachments(request.id);
    assertWithinAttachmentBudget({ existingCount, incomingCount: files.length, policy: null });
    ({ rows: attachmentRows, rollback } = await scanAndStore({
      files,
      uploadedByType: LOG_ACTOR_TYPE.CITIZEN,
      uploadedById: citizen.id,
    }));
  }

  try {
    await repository.createReplyTransaction({
      requestId: request.id,
      log: {
        actorType: LOG_ACTOR_TYPE.CITIZEN,
        citizenId: citizen.id,
        action: REQUEST_LOG_ACTION.CITIZEN_REPLIED,
        visibility: LOG_VISIBILITY.CITIZEN_VISIBLE,
        notes: message,
        metadata: attachmentRows.length > 0
          ? { fileNames: attachmentRows.map((row) => row.originalFileName) }
          : null,
      },
      attachments: attachmentRows,
    });
  } catch (error) {
    await rollback();
    throw error;
  }

  return getForCitizen({ citizenId: citizen.id, referenceNumber });
}

export async function addCitizenAttachments({ citizen, referenceNumber, files }) {
  const request = await getOwnedRequestOrThrow({ citizenId: citizen.id, referenceNumber });

  if (request.status === REQUEST_STATUS.APPROVED || request.status === REQUEST_STATUS.REJECTED) {
    throw ApiError.conflict(
      ERROR_CODE.REQUEST_IS_TERMINAL,
      'This request is closed and can no longer be changed.',
    );
  }

  if (files.length === 0) {
    throw ApiError.badRequest(ERROR_CODE.VALIDATION_ERROR, 'Select at least one file to upload.');
  }

  const existingCount = await repository.countAttachments(request.id);
  assertWithinAttachmentBudget({ existingCount, incomingCount: files.length, policy: null });

  const { rows, rollback } = await scanAndStore({
    files,
    uploadedByType: LOG_ACTOR_TYPE.CITIZEN,
    uploadedById: citizen.id,
  });

  try {
    const attachments = await repository.createAttachmentsTransaction({
      requestId: request.id,
      attachments: rows,
      log: {
        actorType: LOG_ACTOR_TYPE.CITIZEN,
        citizenId: citizen.id,
        action: REQUEST_LOG_ACTION.ATTACHMENT_ADDED,
        visibility: LOG_VISIBILITY.CITIZEN_VISIBLE,
        metadata: { fileNames: rows.map((row) => row.originalFileName) },
      },
    });
    return attachments;
  } catch (error) {
    await rollback();
    throw error;
  }
}

export async function getCitizenAttachment({ citizenId, referenceNumber, attachmentId }) {
  const request = await getOwnedRequestOrThrow({ citizenId, referenceNumber });
  const attachment = await repository.findAttachmentForRequest(request.id, attachmentId);
  if (!attachment) throw ApiError.notFound('The requested file was not found.');
  return attachment;
}

// ---------------------------------------------------------------------------
// Staff reads
// ---------------------------------------------------------------------------

/**
 * Staff listing.
 *
 * The caller's scope is applied FIRST and the client's filters are intersected
 * into it. A manager may narrow to one of their sections; nobody can widen past
 * their own scope, because the scope clause is not something the filters can
 * overwrite - it is spread first and then each filter is checked against it.
 */
export async function listForStaff({ staffScope, query }) {
  const { skip, take, page, pageSize } = toSkipTake(query);
  const scope = scopeWhere(staffScope);
  const createdAt = dateRangeFilter(query.from, query.to);

  const where = { ...scope };

  if (query.status) where.status = query.status;
  if (createdAt) where.createdAt = createdAt;
  if (query.serviceId) where.serviceId = query.serviceId;

  // A narrowing filter is honoured only when it stays inside the scope.
  if (query.departmentId) {
    if (scope.departmentId && query.departmentId !== scope.departmentId) {
      return { data: { requests: [] }, meta: buildPageMeta({ page, pageSize, total: 0 }) };
    }
    where.departmentId = query.departmentId;
  }
  if (query.sectionId) {
    if (scope.sectionId && query.sectionId !== scope.sectionId) {
      return { data: { requests: [] }, meta: buildPageMeta({ page, pageSize, total: 0 }) };
    }
    where.sectionId = query.sectionId;
  }
  if (query.assignedTo) {
    if (scope.assignedTo && query.assignedTo !== scope.assignedTo) {
      return { data: { requests: [] }, meta: buildPageMeta({ page, pageSize, total: 0 }) };
    }
    where.assignedTo = query.assignedTo;
  }
  if (query.q) {
    where.OR = [
      { referenceNumber: { contains: query.q } },
      { title: { contains: query.q } },
    ];
  }

  const { items, total } = await repository.listStaffRequests({
    where,
    skip,
    take,
    orderBy: buildOrderBy(query.sort, STAFF_SORT_FIELDS, { createdAt: 'desc' }),
  });

  return {
    data: { requests: items.map(serializeStaffRequestSummary) },
    meta: buildPageMeta({ page, pageSize, total }),
  };
}

export async function getForStaff({ staffScope, requestId }) {
  const request = await repository.findByIdForStaff(requestId);
  assertCanViewRequest(request, staffScope);

  const [logs, attachments, assignableStaff] = await Promise.all([
    repository.listAllLogs(request.id, { take: 200 }),
    repository.listAttachments(request.id),
    repository.listAssignableStaff({
      departmentId: request.departmentId,
      sectionId: request.sectionId ?? undefined,
    }),
  ]);

  return {
    request: serializeStaffRequestDetail(request, {
      logs,
      attachments,
      allowedTransitions: allowedTransitionsFrom(request.status),
    }),
    assignableStaff: assignableStaff.map((staff) => ({
      id: staff.id,
      nameAr: staff.nameAr,
      nameEn: staff.nameEn ?? null,
      role: staff.role,
    })),
  };
}

export async function listLogsForStaff({ staffScope, requestId, query }) {
  const request = await repository.findByIdForStaff(requestId);
  assertCanViewRequest(request, staffScope);

  const { skip, take, page, pageSize } = toSkipTake(query);
  const [logs, total] = await Promise.all([
    repository.listAllLogs(request.id, { skip, take }),
    repository.countLogs(request.id),
  ]);

  return {
    data: { logs: logs.map(serializeStaffLog) },
    meta: buildPageMeta({ page, pageSize, total }),
  };
}

export async function getStaffAttachment({ staffScope, requestId, attachmentId }) {
  const request = await repository.findByIdForStaff(requestId);
  assertCanViewRequest(request, staffScope);
  const attachment = await repository.findAttachmentForRequest(request.id, attachmentId);
  if (!attachment) throw ApiError.notFound('The requested file was not found.');
  return attachment;
}

// ---------------------------------------------------------------------------
// Staff writes
// ---------------------------------------------------------------------------

export async function updateStatus({ staff, staffScope, requestId, status, note, noteVisibility }) {
  const request = await repository.findByIdForStaff(requestId);
  assertCanUpdateStatus(request, staffScope, status);

  // A status change need not carry a note; when one is present without an
  // explicit visibility, the citizen-facing default applies.
  const visibility = noteVisibility ?? LOG_VISIBILITY.CITIZEN_VISIBLE;

  // Moving to NEED_INFO without telling the citizen what is missing would leave
  // them stuck on a screen that asks for "more information".
  if (status === REQUEST_STATUS.NEED_INFO && (!note || visibility !== LOG_VISIBILITY.CITIZEN_VISIBLE)) {
    throw ApiError.badRequest(
      ERROR_CODE.VALIDATION_ERROR,
      'Moving a request to "needs information" requires a message for the citizen.',
      { details: [{ path: 'note', message: 'A citizen-visible note is required', messageAr: 'مطلوب ملاحظة مرئية للمواطن' }] },
    );
  }

  try {
    const updated = await repository.updateStatusTransaction({
      requestId: request.id,
      previousStatus: request.status,
      newStatus: status,
      log: {
        actorType: LOG_ACTOR_TYPE.STAFF,
        staffId: staff.id,
        action: REQUEST_LOG_ACTION.STATUS_CHANGED,
        previousStatus: request.status,
        newStatus: status,
        visibility,
        notes: note ?? null,
        metadata: { actorName: staff.nameAr, role: staff.role },
      },
    });

    return { referenceNumber: updated.referenceNumber, status: updated.status, updatedAt: updated.updatedAt.toISOString() };
  } catch (error) {
    // The status guard in the WHERE clause failed: someone else changed it first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw ApiError.conflict(
        ERROR_CODE.INVALID_STATUS_TRANSITION,
        'This request was updated by someone else. Please reload and try again.',
      );
    }
    throw error;
  }
}

export async function updateAssignment({ staff, staffScope, requestId, assignedTo }) {
  const request = await repository.findByIdForStaff(requestId);
  assertCanAssign(request, staffScope);

  let assignee = null;
  if (assignedTo) {
    assignee = await repository.findAssignableStaff(assignedTo);
    assertValidAssignee(request, assignee, staffScope);
  }

  const isReassignment = Boolean(request.assignedTo);

  const updated = await repository.updateAssignmentTransaction({
    requestId: request.id,
    assignedTo: assignedTo ?? null,
    log: {
      actorType: LOG_ACTOR_TYPE.STAFF,
      staffId: staff.id,
      action: isReassignment ? REQUEST_LOG_ACTION.REASSIGNED : REQUEST_LOG_ACTION.ASSIGNED,
      visibility: LOG_VISIBILITY.INTERNAL,
      notes: null,
      metadata: {
        previousAssigneeId: request.assignedTo ?? null,
        newAssigneeId: assignedTo ?? null,
        newAssigneeName: assignee?.nameAr ?? null,
        actorName: staff.nameAr,
      },
    },
  });

  return {
    referenceNumber: updated.referenceNumber,
    assignedTo: updated.assignedTo,
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function addNote({ staff, staffScope, requestId, message, visibility }) {
  const request = await repository.findByIdForStaff(requestId);
  assertCanViewRequest(request, staffScope);

  const log = await repository.createLog({
    requestId: request.id,
    actorType: LOG_ACTOR_TYPE.STAFF,
    staffId: staff.id,
    action:
      visibility === LOG_VISIBILITY.CITIZEN_VISIBLE
        ? REQUEST_LOG_ACTION.CITIZEN_VISIBLE_NOTE_ADDED
        : REQUEST_LOG_ACTION.INTERNAL_NOTE_ADDED,
    visibility,
    notes: message,
    metadata: { actorName: staff.nameAr, role: staff.role },
  });

  return { id: log.id, visibility: log.visibility, createdAt: log.createdAt.toISOString() };
}
