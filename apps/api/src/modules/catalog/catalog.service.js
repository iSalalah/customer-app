import { ERROR_CODE } from '@dhofar/shared';

import { ApiError } from '../../utils/ApiError.js';
import { serializeDepartment, serializeService } from '../../utils/serializers.js';
import * as repository from './catalog.repository.js';

export async function listDepartments() {
  const departments = await repository.findActiveDepartments();
  return departments.map(serializeDepartment);
}

export async function listServices(departmentId) {
  const department = await repository.findDepartmentById(departmentId);
  if (!department) throw ApiError.notFound('The requested department was not found.');

  const services = await repository.findActiveServicesByDepartment(departmentId);
  return {
    department: serializeDepartment(department),
    // A service pointing at a deactivated section still routes to the
    // department; the citizen sees no section rather than a dead one.
    services: services.map((service) =>
      serializeService({ ...service, section: service.section?.isActive ? service.section : null }),
    ),
  };
}

/**
 * Resolves the destination for a new request.
 *
 * This is the only function that decides departmentId/sectionId, and it decides
 * them from the stored service row. The browser may display the destination but
 * can never influence it: section 9 of the specification, enforced here.
 */
export async function resolveRouting(serviceId) {
  const service = await repository.findServiceForRouting(serviceId);

  if (!service || !service.isActive || !service.department?.isActive) {
    throw ApiError.unprocessable(
      ERROR_CODE.SERVICE_INACTIVE,
      'This service is not currently available.',
      { logContext: { serviceId } },
    );
  }

  // A section that has been deactivated, or that has drifted to another
  // department, must not silently capture new requests.
  const sectionUsable =
    service.section && service.section.isActive && service.section.departmentId === service.departmentId;

  return {
    serviceId: service.id,
    serviceNameAr: service.nameAr,
    serviceNameEn: service.nameEn,
    departmentId: service.departmentId,
    sectionId: sectionUsable ? service.section.id : null,
    attachmentPolicy: {
      required: service.attachmentsRequired,
      min: service.minAttachments,
      max: service.maxAttachments,
    },
  };
}
