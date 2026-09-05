import { LOG_VISIBILITY } from '@dhofar/shared';

import prisma from '../../infra/prisma.js';

/**
 * Sole Prisma consumer for the requests module.
 *
 * Note the absence of any update or delete on RequestLog: the timeline is
 * append-only by construction, not by convention.
 */

const REQUEST_SUMMARY_SELECT = {
  id: true,
  referenceNumber: true,
  title: true,
  status: true,
  citizenId: true,
  serviceId: true,
  departmentId: true,
  sectionId: true,
  assignedTo: true,
  createdAt: true,
  updatedAt: true,
  service: { select: { id: true, nameAr: true, nameEn: true } },
  department: { select: { id: true, nameAr: true, nameEn: true } },
  section: { select: { id: true, nameAr: true, nameEn: true } },
  _count: { select: { attachments: true } },
};

const STAFF_SUMMARY_SELECT = {
  ...REQUEST_SUMMARY_SELECT,
  assignee: { select: { id: true, nameAr: true, nameEn: true, role: true, isActive: true } },
  citizen: { select: { id: true, phoneNumber: true, fullName: true } },
};

export function findByReferenceForCitizen(referenceNumber) {
  return prisma.request.findUnique({
    where: { referenceNumber },
    select: { ...REQUEST_SUMMARY_SELECT, description: true },
  });
}

export function findByIdForStaff(requestId) {
  return prisma.request.findUnique({
    where: { id: requestId },
    select: { ...STAFF_SUMMARY_SELECT, description: true },
  });
}

/** Minimal projection for the public tracking endpoint - four columns only. */
export function findPublicTracking(referenceNumber) {
  return prisma.request.findUnique({
    where: { referenceNumber },
    select: { referenceNumber: true, status: true, createdAt: true, updatedAt: true },
  });
}

export function findExistingIdempotentRequest(citizenId, idempotencyKey) {
  return prisma.request.findUnique({
    where: { citizenId_idempotencyKey: { citizenId, idempotencyKey } },
    select: { id: true, referenceNumber: true, status: true, createdAt: true },
  });
}

export async function listCitizenRequests({ citizenId, where, skip, take, orderBy }) {
  const filter = { citizenId, ...where };
  const [items, total] = await prisma.$transaction([
    prisma.request.findMany({ where: filter, skip, take, orderBy, select: REQUEST_SUMMARY_SELECT }),
    prisma.request.count({ where: filter }),
  ]);
  return { items, total };
}

export async function listStaffRequests({ where, skip, take, orderBy }) {
  const [items, total] = await prisma.$transaction([
    prisma.request.findMany({ where, skip, take, orderBy, select: STAFF_SUMMARY_SELECT }),
    prisma.request.count({ where }),
  ]);
  return { items, total };
}

/** Citizen timeline: visibility is part of the WHERE, never a post-filter. */
export function listCitizenVisibleLogs(requestId) {
  return prisma.requestLog.findMany({
    where: { requestId, visibility: LOG_VISIBILITY.CITIZEN_VISIBLE },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      action: true,
      previousStatus: true,
      newStatus: true,
      actorType: true,
      notes: true,
      createdAt: true,
    },
  });
}

export function listAllLogs(requestId, { skip = 0, take = 100 } = {}) {
  return prisma.requestLog.findMany({
    where: { requestId },
    orderBy: { createdAt: 'desc' },
    skip,
    take,
    select: {
      id: true,
      action: true,
      visibility: true,
      previousStatus: true,
      newStatus: true,
      actorType: true,
      citizenId: true,
      notes: true,
      metadata: true,
      createdAt: true,
      staff: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
}

export function countLogs(requestId) {
  return prisma.requestLog.count({ where: { requestId } });
}

export function listAttachments(requestId) {
  return prisma.attachment.findMany({
    where: { requestId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      originalFileName: true,
      mimeType: true,
      sizeBytes: true,
      scanStatus: true,
      createdAt: true,
    },
  });
}

export function countAttachments(requestId) {
  return prisma.attachment.count({ where: { requestId } });
}

export function findAttachmentForRequest(requestId, attachmentId) {
  return prisma.attachment.findFirst({
    where: { id: attachmentId, requestId },
    select: {
      id: true,
      requestId: true,
      originalFileName: true,
      storageKey: true,
      storageProvider: true,
      mimeType: true,
      sizeBytes: true,
      scanStatus: true,
    },
  });
}

export function findAssignableStaff(staffId) {
  return prisma.staff.findUnique({
    where: { id: staffId },
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      role: true,
      departmentId: true,
      sectionId: true,
      isActive: true,
    },
  });
}

export function listAssignableStaff({ departmentId, sectionId }) {
  return prisma.staff.findMany({
    where: {
      isActive: true,
      departmentId,
      ...(sectionId ? { sectionId } : {}),
    },
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true, nameEn: true, role: true, sectionId: true, isActive: true },
  });
}

/**
 * Creates the request, its attachments and its opening log entries as ONE
 * transaction. `attempt` lets the caller retry with a fresh reference number
 * after a unique-constraint collision.
 */
export function createRequestTransaction({ data, attachments, logs }) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.request.create({
      data,
      select: { id: true, referenceNumber: true, status: true, createdAt: true },
    });

    if (attachments.length > 0) {
      await tx.attachment.createMany({
        data: attachments.map((attachment) => ({ ...attachment, requestId: created.id })),
      });
    }

    for (const log of logs) {
      // Sequential, not createMany: createdAt ordering of the opening entries
      // must be deterministic for the timeline.
      await tx.requestLog.create({ data: { ...log, requestId: created.id } });
    }

    return created;
  });
}

/** Status change and its log entry commit together, or not at all. */
export function updateStatusTransaction({ requestId, previousStatus, newStatus, log }) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.request.update({
      where: { id: requestId, status: previousStatus },
      data: { status: newStatus },
      select: { id: true, referenceNumber: true, status: true, updatedAt: true },
    });
    await tx.requestLog.create({ data: { ...log, requestId } });
    return updated;
  });
}

export function updateAssignmentTransaction({ requestId, assignedTo, log }) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.request.update({
      where: { id: requestId },
      data: { assignedTo },
      select: { id: true, referenceNumber: true, assignedTo: true, updatedAt: true },
    });
    await tx.requestLog.create({ data: { ...log, requestId } });
    return updated;
  });
}

export function createLog(log) {
  return prisma.requestLog.create({
    data: log,
    select: { id: true, action: true, visibility: true, createdAt: true },
  });
}

/** Citizen reply plus any files it carries, atomically. */
export function createReplyTransaction({ requestId, log, attachments }) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.requestLog.create({
      data: { ...log, requestId },
      select: { id: true, createdAt: true },
    });
    if (attachments.length > 0) {
      await tx.attachment.createMany({
        data: attachments.map((attachment) => ({ ...attachment, requestId })),
      });
    }
    await tx.request.update({ where: { id: requestId }, data: { updatedAt: new Date() } });
    return created;
  });
}

export function createAttachmentsTransaction({ requestId, attachments, log }) {
  return prisma.$transaction(async (tx) => {
    await tx.attachment.createMany({
      data: attachments.map((attachment) => ({ ...attachment, requestId })),
    });
    await tx.requestLog.create({ data: { ...log, requestId } });
    await tx.request.update({ where: { id: requestId }, data: { updatedAt: new Date() } });
    return tx.attachment.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        originalFileName: true,
        mimeType: true,
        sizeBytes: true,
        scanStatus: true,
        createdAt: true,
      },
    });
  });
}

export function groupByStatus(where) {
  return prisma.request.groupBy({ by: ['status'], where, _count: { _all: true } });
}

export function groupByAssignee(where) {
  return prisma.request.groupBy({ by: ['assignedTo'], where, _count: { _all: true } });
}

export function groupByService(where) {
  return prisma.request.groupBy({
    by: ['serviceId'],
    where,
    _count: { _all: true },
    orderBy: { _count: { serviceId: 'desc' } },
    take: 10,
  });
}

export function findServicesByIds(ids) {
  return prisma.municipalService.findMany({
    where: { id: { in: ids } },
    select: { id: true, nameAr: true, nameEn: true },
  });
}

export function findStaffByIds(ids) {
  return prisma.staff.findMany({
    where: { id: { in: ids } },
    select: { id: true, nameAr: true, nameEn: true },
  });
}

export function countRequests(where) {
  return prisma.request.count({ where });
}

/** Average handling time in seconds for closed requests inside the scope. */
export async function averageClosureSeconds(where) {
  const rows = await prisma.request.findMany({
    where: { ...where, status: { in: ['APPROVED', 'REJECTED'] } },
    select: { createdAt: true, updatedAt: true },
    take: 1000,
    orderBy: { updatedAt: 'desc' },
  });
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => sum + (row.updatedAt.getTime() - row.createdAt.getTime()), 0);
  return Math.round(total / rows.length / 1000);
}
