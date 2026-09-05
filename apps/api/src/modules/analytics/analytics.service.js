import { REQUEST_STATUSES, REQUEST_STATUS } from '@dhofar/shared';

import { analyticsScopeFor } from '../../auth/policies.js';
import * as requestsRepository from '../requests/requests.repository.js';

/**
 * Role-scoped analytics.
 *
 * The scope comes from `analyticsScopeFor(staffScope)` and from nothing else -
 * there is no departmentId or sectionId parameter on this endpoint, so a
 * section head cannot ask for the department's numbers by editing a URL.
 */
export async function summary({ staffScope }) {
  const { level, where } = analyticsScopeFor(staffScope);

  const [byStatus, total, openCount, averageSeconds, topServices, byAssignee] = await Promise.all([
    requestsRepository.groupByStatus(where),
    requestsRepository.countRequests(where),
    requestsRepository.countRequests({
      ...where,
      status: { in: [REQUEST_STATUS.PENDING, REQUEST_STATUS.IN_PROGRESS, REQUEST_STATUS.NEED_INFO] },
    }),
    requestsRepository.averageClosureSeconds(where),
    requestsRepository.groupByService(where),
    level === 'OWN' ? Promise.resolve([]) : requestsRepository.groupByAssignee(where),
  ]);

  // Every status appears, including the ones with no rows, so the dashboard
  // renders a stable set of tiles rather than a shifting one.
  const statusCounts = Object.fromEntries(REQUEST_STATUSES.map((status) => [status, 0]));
  for (const row of byStatus) statusCounts[row.status] = row._count._all;

  const serviceIds = topServices.map((row) => row.serviceId);
  const services = serviceIds.length > 0 ? await requestsRepository.findServicesByIds(serviceIds) : [];
  const serviceById = new Map(services.map((service) => [service.id, service]));

  const assigneeIds = byAssignee.map((row) => row.assignedTo).filter(Boolean);
  const staff = assigneeIds.length > 0 ? await requestsRepository.findStaffByIds(assigneeIds) : [];
  const staffById = new Map(staff.map((member) => [member.id, member]));

  return {
    scope: level,
    totals: {
      total,
      open: openCount,
      closed: total - openCount,
      averageClosureSeconds: averageSeconds,
    },
    byStatus: statusCounts,
    topServices: topServices.map((row) => ({
      serviceId: row.serviceId,
      nameAr: serviceById.get(row.serviceId)?.nameAr ?? null,
      nameEn: serviceById.get(row.serviceId)?.nameEn ?? null,
      count: row._count._all,
    })),
    workload: byAssignee.map((row) => ({
      staffId: row.assignedTo,
      nameAr: row.assignedTo ? (staffById.get(row.assignedTo)?.nameAr ?? null) : null,
      nameEn: row.assignedTo ? (staffById.get(row.assignedTo)?.nameEn ?? null) : null,
      unassigned: row.assignedTo === null,
      count: row._count._all,
    })),
    generatedAt: new Date().toISOString(),
  };
}
