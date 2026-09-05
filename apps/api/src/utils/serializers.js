import { maskPhone, toPublicStatus } from '@dhofar/shared';

/**
 * Output allowlists.
 *
 * Every response body is assembled field-by-field here. Nothing is produced by
 * spreading a Prisma row, so a column added to the schema later cannot leak by
 * accident - it simply will not appear until someone adds it deliberately.
 */

export function serializeDepartment(department) {
  return {
    id: department.id,
    nameAr: department.nameAr,
    nameEn: department.nameEn,
  };
}

export function serializeSection(section) {
  if (!section) return null;
  return {
    id: section.id,
    nameAr: section.nameAr,
    nameEn: section.nameEn,
  };
}

export function serializeService(service) {
  return {
    id: service.id,
    nameAr: service.nameAr,
    nameEn: service.nameEn,
    descriptionAr: service.descriptionAr ?? null,
    descriptionEn: service.descriptionEn ?? null,
    department: service.department ? serializeDepartment(service.department) : { id: service.departmentId },
    section: service.section ? serializeSection(service.section) : null,
    attachmentPolicy: {
      required: service.attachmentsRequired,
      min: service.minAttachments,
      max: service.maxAttachments,
    },
  };
}

export function serializeStaffIdentity(staff) {
  return {
    id: staff.id,
    nameAr: staff.nameAr,
    nameEn: staff.nameEn ?? null,
    username: staff.username,
    role: staff.role,
    isActive: staff.isActive,
    department: staff.department ? serializeDepartment(staff.department) : { id: staff.departmentId },
    section: staff.section ? serializeSection(staff.section) : null,
    lastLoginAt: staff.lastLoginAt ? staff.lastLoginAt.toISOString() : null,
  };
}

/** Assignee summary for staff screens. Citizens never receive this shape. */
export function serializeAssignee(staff) {
  if (!staff) return null;
  return {
    id: staff.id,
    nameAr: staff.nameAr,
    nameEn: staff.nameEn ?? null,
    role: staff.role,
    isActive: staff.isActive,
  };
}

export function serializeAttachment(attachment) {
  return {
    id: attachment.id,
    fileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    scanStatus: attachment.scanStatus,
    uploadedAt: attachment.createdAt.toISOString(),
    // storageKey, storageProvider and checksum are deliberately absent: they
    // describe where the file physically lives.
  };
}

/** Timeline entry as a citizen sees it: no staff identity, no internal notes. */
export function serializeCitizenLog(log) {
  return {
    id: log.id,
    action: log.action,
    previousStatus: log.previousStatus ?? null,
    newStatus: log.newStatus ?? null,
    actorType: log.actorType,
    message: log.notes ?? null,
    createdAt: log.createdAt.toISOString(),
  };
}

/**
 * Who performed a logged action. The staff relation is nulled when a member is
 * removed, so the SYSTEM fallback keeps the timeline readable rather than
 * rendering a blank actor.
 */
function serializeLogActor(log) {
  if (log.staff) {
    return { type: 'STAFF', id: log.staff.id, nameAr: log.staff.nameAr, nameEn: log.staff.nameEn ?? null };
  }
  if (log.citizenId) {
    return { type: 'CITIZEN', id: log.citizenId };
  }
  return { type: 'SYSTEM' };
}

/** Timeline entry as staff see it: full detail. */
export function serializeStaffLog(log) {
  return {
    id: log.id,
    action: log.action,
    visibility: log.visibility,
    previousStatus: log.previousStatus ?? null,
    newStatus: log.newStatus ?? null,
    actorType: log.actorType,
    actor: serializeLogActor(log),
    message: log.notes ?? null,
    metadata: log.metadata ?? null,
    createdAt: log.createdAt.toISOString(),
  };
}

export function serializeCitizenRequestSummary(request) {
  return {
    referenceNumber: request.referenceNumber,
    title: request.title,
    status: request.status,
    service: request.service
      ? { id: request.service.id, nameAr: request.service.nameAr, nameEn: request.service.nameEn }
      : { id: request.serviceId },
    department: request.department ? serializeDepartment(request.department) : { id: request.departmentId },
    attachmentCount: request._count?.attachments ?? undefined,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

/**
 * Citizen detail view. Note what is NOT here: assignedTo, sectionId, internal
 * notes, staff names, idempotencyKey, storage keys.
 */
export function serializeCitizenRequestDetail(request, { logs = [], attachments = [] } = {}) {
  return {
    referenceNumber: request.referenceNumber,
    title: request.title,
    description: request.description,
    status: request.status,
    canReply: request.status === 'NEED_INFO',
    service: request.service
      ? { id: request.service.id, nameAr: request.service.nameAr, nameEn: request.service.nameEn }
      : { id: request.serviceId },
    department: request.department ? serializeDepartment(request.department) : { id: request.departmentId },
    attachments: attachments.map(serializeAttachment),
    timeline: logs.map(serializeCitizenLog),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function serializeStaffRequestSummary(request) {
  return {
    id: request.id,
    referenceNumber: request.referenceNumber,
    title: request.title,
    status: request.status,
    service: request.service
      ? { id: request.service.id, nameAr: request.service.nameAr, nameEn: request.service.nameEn }
      : { id: request.serviceId },
    department: request.department ? serializeDepartment(request.department) : { id: request.departmentId },
    section: request.section ? serializeSection(request.section) : null,
    assignee: serializeAssignee(request.assignee),
    citizen: request.citizen
      ? { id: request.citizen.id, phoneMasked: maskPhone(request.citizen.phoneNumber), fullName: request.citizen.fullName ?? null }
      : null,
    attachmentCount: request._count?.attachments ?? undefined,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function serializeStaffRequestDetail(request, { logs = [], attachments = [], allowedTransitions = [] } = {}) {
  return {
    ...serializeStaffRequestSummary(request),
    description: request.description,
    allowedTransitions,
    attachments: attachments.map(serializeAttachment),
    timeline: logs.map(serializeStaffLog),
  };
}

/**
 * The public tracking payload. Exactly four fields, by design - see
 * docs/07-security.md T3.
 */
export function serializePublicTracking(request) {
  return {
    referenceNumber: request.referenceNumber,
    status: toPublicStatus(request.status),
    submittedAt: request.createdAt.toISOString(),
    lastUpdatedAt: request.updatedAt.toISOString(),
  };
}

export function serializeCitizenIdentity(citizen) {
  return {
    id: citizen.id,
    phoneMasked: maskPhone(citizen.phoneNumber),
    fullName: citizen.fullName ?? null,
  };
}
