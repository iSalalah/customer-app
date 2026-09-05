import prisma from '../../infra/prisma.js';

/** The only file in this module permitted to touch Prisma. */

export function findActiveDepartments() {
  return prisma.department.findMany({
    where: { isActive: true },
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true, nameEn: true },
  });
}

export function findDepartmentById(departmentId) {
  return prisma.department.findFirst({
    where: { id: departmentId, isActive: true },
    select: { id: true, nameAr: true, nameEn: true },
  });
}

export function findActiveServicesByDepartment(departmentId) {
  return prisma.municipalService.findMany({
    where: { departmentId, isActive: true, department: { isActive: true } },
    orderBy: { nameAr: 'asc' },
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      descriptionEn: true,
      departmentId: true,
      attachmentsRequired: true,
      minAttachments: true,
      maxAttachments: true,
      department: { select: { id: true, nameAr: true, nameEn: true } },
      section: { select: { id: true, nameAr: true, nameEn: true, isActive: true } },
    },
  });
}

/**
 * Loads the routing source of truth for a service. `departmentId` and
 * `sectionId` for a new request come from this row and from nowhere else.
 */
export function findServiceForRouting(serviceId) {
  return prisma.municipalService.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      isActive: true,
      departmentId: true,
      sectionId: true,
      nameAr: true,
      nameEn: true,
      attachmentsRequired: true,
      minAttachments: true,
      maxAttachments: true,
      department: { select: { id: true, isActive: true, nameAr: true, nameEn: true } },
      section: { select: { id: true, isActive: true, departmentId: true, nameAr: true, nameEn: true } },
    },
  });
}
