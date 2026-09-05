/**
 * Development seed.
 *
 * Creates the municipal organisation, a catalogue of services and a set of
 * DEVELOPMENT-ONLY staff accounts whose passwords are printed to the console.
 *
 * The script refuses to run when NODE_ENV=production. Accounts with known
 * passwords must never exist on a production database.
 */
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'Dhofar#Dev2026';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV=production. Development accounts must not exist in production.');
  process.exit(1);
}

const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

async function upsertDepartment({ nameAr, nameEn }) {
  return prisma.department.upsert({
    where: { nameEn },
    update: { nameAr, isActive: true },
    create: { nameAr, nameEn, isActive: true },
  });
}

async function upsertSection({ departmentId, nameAr, nameEn }) {
  return prisma.section.upsert({
    where: { departmentId_nameEn: { departmentId, nameEn } },
    update: { nameAr, isActive: true },
    create: { departmentId, nameAr, nameEn, isActive: true },
  });
}

async function upsertService({ departmentId, sectionId, nameAr, nameEn, descriptionAr, descriptionEn, attachmentsRequired = false, minAttachments = 0 }) {
  return prisma.municipalService.upsert({
    where: { departmentId_nameEn: { departmentId, nameEn } },
    update: { nameAr, sectionId, descriptionAr, descriptionEn, attachmentsRequired, minAttachments, isActive: true },
    create: {
      departmentId,
      sectionId,
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      attachmentsRequired,
      minAttachments,
      maxAttachments: 5,
      isActive: true,
    },
  });
}

async function upsertStaff({ username, nameAr, nameEn, role, departmentId, sectionId, passwordHash, isActive = true }) {
  return prisma.staff.upsert({
    where: { username },
    update: { nameAr, nameEn, role, departmentId, sectionId, isActive },
    create: { username, nameAr, nameEn, role, departmentId, sectionId, passwordHash, isActive },
  });
}

async function main() {
  console.log('Seeding development data...');
  const passwordHash = await argon2.hash(DEV_PASSWORD, ARGON_OPTIONS);

  // --- Departments --------------------------------------------------------
  const planning = await upsertDepartment({ nameAr: 'دائرة التخطيط العمراني', nameEn: 'Urban Planning' });
  const environment = await upsertDepartment({ nameAr: 'دائرة الصحة والبيئة', nameEn: 'Health and Environment' });
  const services = await upsertDepartment({ nameAr: 'دائرة الخدمات البلدية', nameEn: 'Municipal Services' });

  // --- Sections -----------------------------------------------------------
  const permits = await upsertSection({
    departmentId: planning.id,
    nameAr: 'قسم تراخيص البناء',
    nameEn: 'Building Permits',
  });
  const surveying = await upsertSection({
    departmentId: planning.id,
    nameAr: 'قسم المساحة',
    nameEn: 'Surveying',
  });
  const inspection = await upsertSection({
    departmentId: environment.id,
    nameAr: 'قسم الرقابة الصحية',
    nameEn: 'Health Inspection',
  });
  const cleaning = await upsertSection({
    departmentId: services.id,
    nameAr: 'قسم النظافة',
    nameEn: 'Cleaning',
  });

  // --- Services (the routing source of truth) -----------------------------
  await upsertService({
    departmentId: planning.id,
    sectionId: permits.id,
    nameAr: 'طلب رخصة بناء',
    nameEn: 'Building permit application',
    descriptionAr: 'تقديم طلب للحصول على رخصة بناء لمبنى سكني أو تجاري.',
    descriptionEn: 'Apply for a permit to construct a residential or commercial building.',
    attachmentsRequired: true,
    minAttachments: 1,
  });
  await upsertService({
    departmentId: planning.id,
    sectionId: surveying.id,
    nameAr: 'طلب مخطط مساحي',
    nameEn: 'Survey plan request',
    descriptionAr: 'طلب مخطط مساحي معتمد لقطعة أرض.',
    descriptionEn: 'Request a certified survey plan for a plot of land.',
  });
  await upsertService({
    // Deliberately department-level: a manager triages before it reaches a section.
    departmentId: planning.id,
    sectionId: null,
    nameAr: 'استفسار عام عن التخطيط',
    nameEn: 'General planning enquiry',
    descriptionAr: 'استفسار عام يوجه إلى مدير الدائرة للتوزيع.',
    descriptionEn: 'A general enquiry routed to the department manager for triage.',
  });
  await upsertService({
    departmentId: environment.id,
    sectionId: inspection.id,
    nameAr: 'بلاغ عن مخالفة صحية',
    nameEn: 'Health violation report',
    descriptionAr: 'الإبلاغ عن مخالفة صحية في منشأة غذائية أو تجارية.',
    descriptionEn: 'Report a health violation at a food or commercial establishment.',
    attachmentsRequired: true,
    minAttachments: 1,
  });
  await upsertService({
    departmentId: services.id,
    sectionId: cleaning.id,
    nameAr: 'طلب رفع مخلفات',
    nameEn: 'Waste collection request',
    descriptionAr: 'طلب رفع مخلفات أو أنقاض من موقع محدد.',
    descriptionEn: 'Request the collection of waste or debris from a specific location.',
  });
  await upsertService({
    departmentId: services.id,
    sectionId: null,
    nameAr: 'شكوى خدمات بلدية',
    nameEn: 'Municipal services complaint',
    descriptionAr: 'تقديم شكوى بخصوص الخدمات البلدية.',
    descriptionEn: 'Submit a complaint about municipal services.',
  });

  // --- Staff (DEVELOPMENT ONLY) ------------------------------------------
  const accounts = [
    { username: 'manager.planning', nameAr: 'سالم بن أحمد', nameEn: 'Salim Al Amri', role: 'MANAGER', departmentId: planning.id, sectionId: null },
    { username: 'head.permits', nameAr: 'مريم بنت خالد', nameEn: 'Mariam Al Kindi', role: 'SECTION_HEAD', departmentId: planning.id, sectionId: permits.id },
    { username: 'head.surveying', nameAr: 'ناصر بن سعيد', nameEn: 'Nasser Al Balushi', role: 'SECTION_HEAD', departmentId: planning.id, sectionId: surveying.id },
    { username: 'emp.permits1', nameAr: 'هدى بنت علي', nameEn: 'Huda Al Rawahi', role: 'EMPLOYEE', departmentId: planning.id, sectionId: permits.id },
    { username: 'emp.permits2', nameAr: 'يوسف بن حمد', nameEn: 'Yousuf Al Harthy', role: 'EMPLOYEE', departmentId: planning.id, sectionId: permits.id },
    { username: 'emp.surveying1', nameAr: 'أمل بنت راشد', nameEn: 'Amal Al Farsi', role: 'EMPLOYEE', departmentId: planning.id, sectionId: surveying.id },
    { username: 'manager.environment', nameAr: 'خميس بن سالم', nameEn: 'Khamis Al Mahri', role: 'MANAGER', departmentId: environment.id, sectionId: null },
    { username: 'head.inspection', nameAr: 'فاطمة بنت محمد', nameEn: 'Fatima Al Shanfari', role: 'SECTION_HEAD', departmentId: environment.id, sectionId: inspection.id },
    { username: 'emp.inspection1', nameAr: 'سعيد بن عبدالله', nameEn: 'Said Al Ghassani', role: 'EMPLOYEE', departmentId: environment.id, sectionId: inspection.id },
    { username: 'manager.services', nameAr: 'ريم بنت طالب', nameEn: 'Reem Al Habsi', role: 'MANAGER', departmentId: services.id, sectionId: null },
    { username: 'head.cleaning', nameAr: 'طلال بن مبارك', nameEn: 'Talal Al Wahaibi', role: 'SECTION_HEAD', departmentId: services.id, sectionId: cleaning.id },
    { username: 'emp.cleaning1', nameAr: 'زينب بنت جمعة', nameEn: 'Zainab Al Zadjali', role: 'EMPLOYEE', departmentId: services.id, sectionId: cleaning.id },
    // Disabled on purpose: exercises the "disabled staff cannot sign in or be
    // assigned" rule during manual testing.
    { username: 'emp.disabled', nameAr: 'موظف معطل', nameEn: 'Disabled Employee', role: 'EMPLOYEE', departmentId: planning.id, sectionId: permits.id, isActive: false },
  ];

  for (const account of accounts) {
    await upsertStaff({ ...account, passwordHash });
  }

  console.log('\nSeed complete.');
  console.log('---------------------------------------------------------------');
  console.log('DEVELOPMENT ACCOUNTS - these exist only outside production.');
  console.log(`Password for every account below: ${DEV_PASSWORD}`);
  console.log('---------------------------------------------------------------');
  for (const account of accounts) {
    console.log(
      `  ${account.username.padEnd(22)} ${account.role.padEnd(13)} ${account.isActive === false ? '(disabled)' : ''}`,
    );
  }
  console.log('---------------------------------------------------------------');
  console.log('Citizens are created on first successful OTP verification.');
  console.log('With SMS_DRIVER=mock and NODE_ENV=development the code is printed');
  console.log('to the API console.\n');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
