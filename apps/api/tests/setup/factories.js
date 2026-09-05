import argon2 from 'argon2';

import { getTestPrisma } from './db.js';

/**
 * Fixture builders.
 *
 * The Argon2 hash is computed once and shared: hashing per-account at OWASP
 * parameters would dominate the suite's runtime for no test value.
 */

export const TEST_PASSWORD = 'TestPassw0rd!';

let cachedHash = null;
async function passwordHash() {
  if (!cachedHash) {
    cachedHash = await argon2.hash(TEST_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }
  return cachedHash;
}

export function createDepartment({ nameAr = 'دائرة الاختبار', nameEn = 'Test Department' } = {}) {
  return getTestPrisma().department.create({ data: { nameAr, nameEn } });
}

export function createSection({ departmentId, nameAr = 'قسم الاختبار', nameEn = 'Test Section' }) {
  return getTestPrisma().section.create({ data: { departmentId, nameAr, nameEn } });
}

export function createService({
  departmentId,
  sectionId = null,
  nameAr = 'خدمة اختبار',
  nameEn = 'Test Service',
  isActive = true,
  attachmentsRequired = false,
  minAttachments = 0,
}) {
  return getTestPrisma().municipalService.create({
    data: { departmentId, sectionId, nameAr, nameEn, isActive, attachmentsRequired, minAttachments },
  });
}

export async function createStaff({
  departmentId,
  sectionId = null,
  role = 'EMPLOYEE',
  username = `staff-${Math.random().toString(36).slice(2, 10)}`,
  nameAr = 'موظف اختبار',
  nameEn = 'Test Staff',
  isActive = true,
}) {
  return getTestPrisma().staff.create({
    data: { departmentId, sectionId, role, username, nameAr, nameEn, isActive, passwordHash: await passwordHash() },
  });
}

export function createCitizen({ phoneNumber = '+96891000001', fullName = null } = {}) {
  return getTestPrisma().citizen.create({ data: { phoneNumber, fullName } });
}

export function createRequest({
  citizenId,
  serviceId,
  departmentId,
  sectionId = null,
  assignedTo = null,
  status = 'PENDING',
  referenceNumber = `DHO-2026-${Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[ILOU]/g, 'X')}`,
  idempotencyKey = `idem-${Math.random().toString(36).slice(2, 12)}`,
  title = 'Test request title',
  description = 'A description that is comfortably longer than twenty characters.',
}) {
  return getTestPrisma().request.create({
    data: {
      citizenId,
      serviceId,
      departmentId,
      sectionId,
      assignedTo,
      status,
      referenceNumber,
      idempotencyKey,
      title,
      description,
    },
  });
}

export function createLog({
  requestId,
  actorType = 'STAFF',
  staffId = null,
  citizenId = null,
  action = 'INTERNAL_NOTE_ADDED',
  visibility = 'INTERNAL',
  notes = 'internal note body',
}) {
  return getTestPrisma().requestLog.create({
    data: { requestId, actorType, staffId, citizenId, action, visibility, notes },
  });
}

/**
 * A complete organisation: one department, two sections, staff at every role in
 * each, plus the cross-department accounts the RBAC tests need.
 */
export async function seedOrganisation() {
  const departmentA = await createDepartment({ nameAr: 'دائرة أ', nameEn: 'Department A' });
  const departmentB = await createDepartment({ nameAr: 'دائرة ب', nameEn: 'Department B' });

  const sectionA1 = await createSection({ departmentId: departmentA.id, nameAr: 'قسم أ١', nameEn: 'Section A1' });
  const sectionA2 = await createSection({ departmentId: departmentA.id, nameAr: 'قسم أ٢', nameEn: 'Section A2' });
  const sectionB1 = await createSection({ departmentId: departmentB.id, nameAr: 'قسم ب١', nameEn: 'Section B1' });

  const serviceA1 = await createService({
    departmentId: departmentA.id,
    sectionId: sectionA1.id,
    nameAr: 'خدمة أ١',
    nameEn: 'Service A1',
  });
  const serviceADept = await createService({
    departmentId: departmentA.id,
    sectionId: null,
    nameAr: 'خدمة أ عامة',
    nameEn: 'Service A department level',
  });
  const serviceInactive = await createService({
    departmentId: departmentA.id,
    nameAr: 'خدمة معطلة',
    nameEn: 'Inactive service',
    isActive: false,
  });

  const managerA = await createStaff({ departmentId: departmentA.id, role: 'MANAGER', username: 'manager.a' });
  const headA1 = await createStaff({
    departmentId: departmentA.id,
    sectionId: sectionA1.id,
    role: 'SECTION_HEAD',
    username: 'head.a1',
  });
  const headA2 = await createStaff({
    departmentId: departmentA.id,
    sectionId: sectionA2.id,
    role: 'SECTION_HEAD',
    username: 'head.a2',
  });
  const employeeA1 = await createStaff({
    departmentId: departmentA.id,
    sectionId: sectionA1.id,
    role: 'EMPLOYEE',
    username: 'emp.a1',
  });
  const employeeA1b = await createStaff({
    departmentId: departmentA.id,
    sectionId: sectionA1.id,
    role: 'EMPLOYEE',
    username: 'emp.a1b',
  });
  const employeeA2 = await createStaff({
    departmentId: departmentA.id,
    sectionId: sectionA2.id,
    role: 'EMPLOYEE',
    username: 'emp.a2',
  });
  const employeeB1 = await createStaff({
    departmentId: departmentB.id,
    sectionId: sectionB1.id,
    role: 'EMPLOYEE',
    username: 'emp.b1',
  });
  const disabledEmployee = await createStaff({
    departmentId: departmentA.id,
    sectionId: sectionA1.id,
    role: 'EMPLOYEE',
    username: 'emp.disabled',
    isActive: false,
  });
  const managerB = await createStaff({ departmentId: departmentB.id, role: 'MANAGER', username: 'manager.b' });

  return {
    departmentA,
    departmentB,
    sectionA1,
    sectionA2,
    sectionB1,
    serviceA1,
    serviceADept,
    serviceInactive,
    managerA,
    managerB,
    headA1,
    headA2,
    employeeA1,
    employeeA1b,
    employeeA2,
    employeeB1,
    disabledEmployee,
  };
}
