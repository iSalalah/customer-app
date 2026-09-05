import prisma from '../../infra/prisma.js';

export function findStaffByUsername(username) {
  return prisma.staff.findUnique({
    where: { username },
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      username: true,
      passwordHash: true,
      role: true,
      departmentId: true,
      sectionId: true,
      isActive: true,
      failedLoginCount: true,
      lockedUntil: true,
      lastLoginAt: true,
      department: { select: { id: true, nameAr: true, nameEn: true, isActive: true } },
      section: { select: { id: true, nameAr: true, nameEn: true, isActive: true } },
    },
  });
}

export function findStaffById(staffId) {
  return prisma.staff.findUnique({
    where: { id: staffId },
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      username: true,
      role: true,
      departmentId: true,
      sectionId: true,
      isActive: true,
      lastLoginAt: true,
      department: { select: { id: true, nameAr: true, nameEn: true } },
      section: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
}

export function registerFailedLogin({ staffId, failedLoginCount, lockedUntil }) {
  return prisma.staff.update({
    where: { id: staffId },
    data: { failedLoginCount, lockedUntil },
    select: { id: true },
  });
}

export function registerSuccessfulLogin(staffId) {
  return prisma.staff.update({
    where: { id: staffId },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    select: { id: true, lastLoginAt: true },
  });
}

export function updatePasswordHash(staffId, passwordHash) {
  return prisma.staff.update({ where: { id: staffId }, data: { passwordHash }, select: { id: true } });
}
