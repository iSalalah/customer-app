import { closeTestConnections, describeIntegration, getTestPrisma, resetAll } from '../setup/db.js';
import { signInCitizen, signInStaff } from '../setup/app.js';
import { TEST_PASSWORD, seedOrganisation } from '../setup/factories.js';

const PDF = Buffer.concat([
  Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'ascii'),
  Buffer.from('trailer\n<< /Root 1 0 R >>\n%%EOF\n', 'ascii'),
]);

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);

const pdfFile = (filename = 'document.pdf') => ({
  buffer: PDF,
  filename,
  contentType: 'application/pdf',
});

describeIntegration('attachment upload and download', () => {
  let prisma;
  let org;

  beforeAll(() => {
    prisma = getTestPrisma();
  });

  beforeEach(async () => {
    await resetAll();
    org = await seedOrganisation();
  });

  afterAll(async () => {
    await closeTestConnections();
  });

  async function createWithFiles(client, files, key = 'attach-key') {
    return client.post('/api/v1/citizen/requests', {
      headers: { 'Idempotency-Key': key },
      form: {
        fields: {
          serviceId: org.serviceA1.id,
          title: 'Building permit for a residential villa',
          description: 'Attaching the site plan and the ownership document for review.',
        },
        files,
      },
    });
  }

  describe('validation', () => {
    it('accepts PDF, JPEG and PNG', async () => {
      const { client } = await signInCitizen('91234567');
      const response = await createWithFiles(client, [
        pdfFile('plan.pdf'),
        { buffer: PNG, filename: 'photo.png', contentType: 'image/png' },
      ]);

      expect(response.status).toBe(201);
      expect(await prisma.attachment.count()).toBe(2);
    });

    it('rejects a file whose content does not match its declared type', async () => {
      const { client } = await signInCitizen('91234567');
      const response = await createWithFiles(client, [
        { buffer: PNG, filename: 'invoice.pdf', contentType: 'application/pdf' },
      ]);

      expect(response.status).toBe(415);
      expect(response.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
      expect(await prisma.request.count()).toBe(0);
    });

    it('rejects a disallowed type even when correctly declared', async () => {
      const { client } = await signInCitizen('91234567');
      const response = await createWithFiles(client, [
        { buffer: Buffer.from('PK\x03\x04 zip'), filename: 'bundle.zip', contentType: 'application/zip' },
      ]);

      expect(response.status).toBe(415);
    });

    it('rejects a script disguised as an image', async () => {
      const { client } = await signInCitizen('91234567');
      const response = await createWithFiles(client, [
        {
          buffer: Buffer.from('<?php system($_GET["cmd"]); ?>'),
          filename: 'shell.png',
          contentType: 'image/png',
        },
      ]);

      expect(response.status).toBe(415);
      expect(await prisma.attachment.count()).toBe(0);
    });

    it('rejects a file larger than 10 MB', async () => {
      const { client } = await signInCitizen('91234567');
      const oversized = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 + 1024, 0x20)]);

      const response = await createWithFiles(client, [
        { buffer: oversized, filename: 'huge.pdf', contentType: 'application/pdf' },
      ]);

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('FILE_TOO_LARGE');
    });

    it('rejects more than five attachments', async () => {
      const { client } = await signInCitizen('91234567');
      const files = Array.from({ length: 6 }, (_, index) => pdfFile(`file-${index}.pdf`));

      const response = await createWithFiles(client, files);

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('ATTACHMENT_LIMIT_EXCEEDED');
      expect(await prisma.request.count()).toBe(0);
    });

    it('counts existing attachments against the ceiling on a later upload', async () => {
      const { client } = await signInCitizen('91234567');
      const created = await createWithFiles(client, [
        pdfFile('a.pdf'),
        pdfFile('b.pdf'),
        pdfFile('c.pdf'),
      ]);
      const reference = created.body.data.referenceNumber;

      const response = await client.post(`/api/v1/citizen/requests/${reference}/attachments`, {
        form: { files: [pdfFile('d.pdf'), pdfFile('e.pdf'), pdfFile('f.pdf')] },
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('ATTACHMENT_LIMIT_EXCEEDED');
      expect(await prisma.attachment.count()).toBe(3);
    });
  });

  describe('storage', () => {
    it('never uses the uploaded filename as the storage path', async () => {
      const { client } = await signInCitizen('91234567');
      await createWithFiles(client, [pdfFile('../../etc/passwd.pdf')]);

      const attachment = await prisma.attachment.findFirst();

      expect(attachment.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
      expect(attachment.storageKey).not.toContain('..');
      expect(attachment.storageKey).not.toContain('passwd');
      // The display name is sanitised but retained.
      expect(attachment.originalFileName).toBe('passwd.pdf');
    });

    it('records a checksum of the bytes', async () => {
      const { client } = await signInCitizen('91234567');
      await createWithFiles(client, [pdfFile()]);

      const attachment = await prisma.attachment.findFirst();
      expect(attachment.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(attachment.sizeBytes).toBe(PDF.length);
    });

    it('does not expose storage keys or filesystem paths in any response', async () => {
      const { client } = await signInCitizen('91234567');
      const created = await createWithFiles(client, [pdfFile()]);
      const detail = await client.get(`/api/v1/citizen/requests/${created.body.data.referenceNumber}`);

      const serialised = JSON.stringify(detail.body);
      expect(serialised).not.toContain('storageKey');
      expect(serialised).not.toContain('var/');
      expect(serialised).not.toMatch(/[A-Za-z]:\\/);
      expect(detail.body.data.request.attachments[0]).toHaveProperty('fileName');
    });
  });

  describe('download authorisation', () => {
    it('lets the owning citizen download their own attachment', async () => {
      const { client } = await signInCitizen('91234567');
      const created = await createWithFiles(client, [pdfFile('plan.pdf')]);
      const reference = created.body.data.referenceNumber;
      const attachment = await prisma.attachment.findFirst();

      const response = await client.get(
        `/api/v1/citizen/requests/${reference}/attachments/${attachment.id}`,
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toContain('no-store');
    });

    it('refuses another citizen the same attachment', async () => {
      const first = await signInCitizen('91234567');
      const created = await createWithFiles(first.client, [pdfFile()]);
      const reference = created.body.data.referenceNumber;
      const attachment = await prisma.attachment.findFirst();

      const second = await signInCitizen('99887766');
      const response = await second.client.get(
        `/api/v1/citizen/requests/${reference}/attachments/${attachment.id}`,
      );

      expect(response.status).toBe(404);
    });

    it('refuses an unauthenticated download', async () => {
      const { client } = await signInCitizen('91234567');
      const created = await createWithFiles(client, [pdfFile()]);
      const reference = created.body.data.referenceNumber;
      const attachment = await prisma.attachment.findFirst();

      const { createClient } = await import('../setup/app.js');
      const anonymous = await createClient();
      const response = await anonymous.get(
        `/api/v1/citizen/requests/${reference}/attachments/${attachment.id}`,
      );

      expect(response.status).toBe(401);
    });

    it('refuses staff outside the request\'s scope', async () => {
      const { client } = await signInCitizen('91234567');
      const created = await createWithFiles(client, [pdfFile()]);
      const request = await prisma.request.findUnique({
        where: { referenceNumber: created.body.data.referenceNumber },
      });
      const attachment = await prisma.attachment.findFirst();

      const outsider = await signInStaff('manager.b', TEST_PASSWORD);
      const response = await outsider.get(
        `/api/v1/staff/requests/${request.id}/attachments/${attachment.id}`,
      );

      expect(response.status).toBe(404);
    });

    it('lets in-scope staff download it', async () => {
      const { client } = await signInCitizen('91234567');
      const created = await createWithFiles(client, [pdfFile()]);
      const request = await prisma.request.findUnique({
        where: { referenceNumber: created.body.data.referenceNumber },
      });
      const attachment = await prisma.attachment.findFirst();

      const manager = await signInStaff('manager.a', TEST_PASSWORD);
      const response = await manager.get(
        `/api/v1/staff/requests/${request.id}/attachments/${attachment.id}`,
      );

      expect(response.status).toBe(200);
    });

    it('refuses a quarantined file to everyone', async () => {
      const { client } = await signInCitizen('91234567');
      const created = await createWithFiles(client, [pdfFile()]);
      const reference = created.body.data.referenceNumber;
      const attachment = await prisma.attachment.findFirst();

      await prisma.attachment.update({ where: { id: attachment.id }, data: { scanStatus: 'INFECTED' } });

      const response = await client.get(
        `/api/v1/citizen/requests/${reference}/attachments/${attachment.id}`,
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ATTACHMENT_UNAVAILABLE');
    });
  });
});
