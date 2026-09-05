import { COOKIE_NAMES, ERROR_CODES, LOG_VISIBILITIES, REQUEST_STATUSES, STAFF_ROLES } from '@dhofar/shared';

/**
 * OpenAPI 3.1 document, authored as a plain object so it stays in one file and
 * shares the enums with the running code (a status added to the shared package
 * appears here automatically).
 */

const envelope = (dataSchema) => ({
  type: 'object',
  required: ['success', 'data'],
  properties: {
    success: { type: 'boolean', const: true },
    data: dataSchema,
    meta: { type: 'object', additionalProperties: true },
  },
});

const errorResponse = {
  type: 'object',
  required: ['success', 'error'],
  properties: {
    success: { type: 'boolean', const: false },
    error: {
      type: 'object',
      required: ['code', 'message', 'details', 'requestId'],
      properties: {
        code: { type: 'string', enum: ERROR_CODES },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object', additionalProperties: true } },
        requestId: { type: 'string' },
      },
    },
    meta: { type: 'object', additionalProperties: true },
  },
};

const error = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];

export function buildOpenApiDocument({ serverUrl }) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Dhofar Municipality Self-Service Citizen Portal API',
      version: '1.0.0',
      description: [
        'Citizen kiosk and municipality staff API.',
        '',
        'Authentication uses opaque session tokens in HttpOnly cookies. Every',
        'state-changing request additionally requires the `X-CSRF-Token` header',
        'whose value must equal the `dm.csrf` cookie.',
        '',
        'Citizen sessions expire after 2 minutes of inactivity, enforced server-side.',
      ].join('\n'),
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: 'Health' },
      { name: 'Catalog' },
      { name: 'Public tracking' },
      { name: 'Citizen authentication' },
      { name: 'Citizen requests' },
      { name: 'Staff authentication' },
      { name: 'Staff operations' },
    ],
    components: {
      securitySchemes: {
        citizenSession: { type: 'apiKey', in: 'cookie', name: COOKIE_NAMES.CITIZEN_SESSION },
        staffSession: { type: 'apiKey', in: 'cookie', name: COOKIE_NAMES.STAFF_ACCESS },
      },
      parameters: {
        CsrfToken: {
          name: 'X-CSRF-Token',
          in: 'header',
          required: true,
          schema: { type: 'string' },
          description: 'Must equal the dm.csrf cookie value.',
        },
        IdempotencyKey: {
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
          schema: { type: 'string', minLength: 8, maxLength: 80 },
          description: 'Stable per submission attempt. Replaying it returns the original request.',
        },
      },
      schemas: {
        Error: errorResponse,
        RequestStatus: { type: 'string', enum: REQUEST_STATUSES },
        PublicStatus: { type: 'string', enum: ['RECEIVED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'CLOSED'] },
        StaffRole: { type: 'string', enum: STAFF_ROLES },
        LogVisibility: { type: 'string', enum: LOG_VISIBILITIES },
        Department: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nameAr: { type: 'string' },
            nameEn: { type: 'string' },
          },
        },
        Service: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nameAr: { type: 'string' },
            nameEn: { type: 'string' },
            descriptionAr: { type: 'string', nullable: true },
            descriptionEn: { type: 'string', nullable: true },
            department: { $ref: '#/components/schemas/Department' },
            section: { $ref: '#/components/schemas/Department', nullable: true },
            attachmentPolicy: {
              type: 'object',
              properties: {
                required: { type: 'boolean' },
                min: { type: 'integer' },
                max: { type: 'integer' },
              },
            },
          },
        },
        Attachment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fileName: { type: 'string' },
            mimeType: { type: 'string', enum: ['application/pdf', 'image/jpeg', 'image/png'] },
            sizeBytes: { type: 'integer' },
            scanStatus: { type: 'string', enum: ['PENDING', 'CLEAN', 'INFECTED', 'SKIPPED'] },
            uploadedAt: { type: 'string', format: 'date-time' },
          },
        },
        CitizenRequestSummary: {
          type: 'object',
          properties: {
            referenceNumber: { type: 'string', pattern: '^DHO-\\d{4}-[0-9A-Z]{6}$' },
            title: { type: 'string' },
            status: { $ref: '#/components/schemas/RequestStatus' },
            service: { type: 'object', additionalProperties: true },
            department: { $ref: '#/components/schemas/Department' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        PublicTracking: {
          type: 'object',
          description: 'Deliberately minimal. No citizen, description, attachment or staff data.',
          properties: {
            referenceNumber: { type: 'string' },
            status: { $ref: '#/components/schemas/PublicStatus' },
            submittedAt: { type: 'string', format: 'date-time' },
            lastUpdatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Liveness probe',
          responses: { 200: { description: 'Process is running' } },
        },
      },
      '/ready': {
        get: {
          tags: ['Health'],
          summary: 'Readiness probe (MySQL and Redis)',
          responses: { 200: { description: 'Ready' }, 503: error('A dependency is unavailable') },
        },
      },
      '/departments': {
        get: {
          tags: ['Catalog'],
          summary: 'List active departments',
          responses: {
            200: {
              description: 'Active departments',
              content: {
                'application/json': {
                  schema: envelope({
                    type: 'object',
                    properties: {
                      departments: { type: 'array', items: { $ref: '#/components/schemas/Department' } },
                    },
                  }),
                },
              },
            },
          },
        },
      },
      '/departments/{departmentId}/services': {
        get: {
          tags: ['Catalog'],
          summary: 'List active services for a department',
          parameters: [
            { name: 'departmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            200: {
              description: 'Services with their resolved routing target',
              content: {
                'application/json': {
                  schema: envelope({
                    type: 'object',
                    properties: {
                      department: { $ref: '#/components/schemas/Department' },
                      services: { type: 'array', items: { $ref: '#/components/schemas/Service' } },
                    },
                  }),
                },
              },
            },
            404: error('Unknown or inactive department'),
          },
        },
      },
      '/public/requests/{referenceNumber}/status': {
        get: {
          tags: ['Public tracking'],
          summary: 'Track a request without signing in',
          description: 'Strictly rate limited. Returns four fields and nothing else.',
          parameters: [{ name: 'referenceNumber', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: {
              description: 'Minimal public status',
              content: {
                'application/json': {
                  schema: envelope({
                    type: 'object',
                    properties: { tracking: { $ref: '#/components/schemas/PublicTracking' } },
                  }),
                },
              },
            },
            404: error('No request with that reference'),
            429: error('Rate limited'),
          },
        },
      },
      '/auth/citizen/otp/request': {
        post: {
          tags: ['Citizen authentication'],
          summary: 'Request a one-time code',
          description: 'Always answers identically whether or not the citizen exists.',
          parameters: [{ $ref: '#/components/parameters/CsrfToken' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['phoneNumber'],
                  properties: { phoneNumber: { type: 'string', example: '91234567' } },
                },
              },
            },
          },
          responses: {
            202: { description: 'Code dispatched (or would have been)' },
            400: error('Invalid phone number'),
            429: error('Cooldown or hourly limit reached'),
          },
        },
      },
      '/auth/citizen/otp/resend': {
        post: {
          tags: ['Citizen authentication'],
          summary: 'Resend the code after the cooldown',
          parameters: [{ $ref: '#/components/parameters/CsrfToken' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['phoneNumber'], properties: { phoneNumber: { type: 'string' } } },
              },
            },
          },
          responses: { 202: { description: 'Resent' }, 429: error('Still within the cooldown') },
        },
      },
      '/auth/citizen/otp/verify': {
        post: {
          tags: ['Citizen authentication'],
          summary: 'Verify the code and open a session',
          parameters: [{ $ref: '#/components/parameters/CsrfToken' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['phoneNumber', 'code'],
                  properties: { phoneNumber: { type: 'string' }, code: { type: 'string', example: '123456' } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Session cookie set' },
            401: error('Incorrect or expired code'),
            423: error('Attempt limit reached'),
          },
        },
      },
      '/auth/citizen/logout': {
        post: {
          tags: ['Citizen authentication'],
          summary: 'End the citizen session',
          security: [{ citizenSession: [] }],
          parameters: [{ $ref: '#/components/parameters/CsrfToken' }],
          responses: { 200: { description: 'Session revoked' } },
        },
      },
      '/auth/citizen/me': {
        get: {
          tags: ['Citizen authentication'],
          summary: 'Current citizen and remaining session time',
          security: [{ citizenSession: [] }],
          responses: { 200: { description: 'Citizen identity' }, 401: error('Session expired') },
        },
      },
      '/citizen/requests': {
        get: {
          tags: ['Citizen requests'],
          summary: 'List the signed-in citizen\'s requests',
          security: [{ citizenSession: [] }],
          parameters: [
            ...paginationParams,
            { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/RequestStatus' } },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: { 200: { description: 'Paginated requests' }, 401: error('Session expired') },
        },
        post: {
          tags: ['Citizen requests'],
          summary: 'Submit a new request',
          description:
            'Routing is resolved from the service record. departmentId and sectionId are rejected if supplied.',
          security: [{ citizenSession: [] }],
          parameters: [
            { $ref: '#/components/parameters/CsrfToken' },
            { $ref: '#/components/parameters/IdempotencyKey' },
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['serviceId', 'title', 'description'],
                  properties: {
                    serviceId: { type: 'string', format: 'uuid' },
                    title: { type: 'string', minLength: 5, maxLength: 200 },
                    description: { type: 'string', minLength: 20, maxLength: 4000 },
                    attachments: {
                      type: 'array',
                      maxItems: 5,
                      items: { type: 'string', format: 'binary' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Request created' },
            200: { description: 'Idempotent replay of an earlier submission' },
            400: error('Validation error or missing Idempotency-Key'),
            413: error('A file exceeds 10 MB'),
            415: error('Unsupported or spoofed file type'),
            422: error('Attachment limit or service policy violated'),
          },
        },
      },
      '/citizen/requests/{referenceNumber}': {
        get: {
          tags: ['Citizen requests'],
          summary: 'Request detail with the citizen-visible timeline',
          security: [{ citizenSession: [] }],
          parameters: [{ name: 'referenceNumber', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Detail' }, 404: error('Not found or not owned') },
        },
      },
      '/citizen/requests/{referenceNumber}/attachments': {
        post: {
          tags: ['Citizen requests'],
          summary: 'Add attachments to an existing request',
          security: [{ citizenSession: [] }],
          parameters: [
            { name: 'referenceNumber', in: 'path', required: true, schema: { type: 'string' } },
            { $ref: '#/components/parameters/CsrfToken' },
          ],
          responses: { 201: { description: 'Attachments added' }, 422: error('Limit exceeded') },
        },
      },
      '/citizen/requests/{referenceNumber}/attachments/{attachmentId}': {
        get: {
          tags: ['Citizen requests'],
          summary: 'Download an own attachment',
          security: [{ citizenSession: [] }],
          parameters: [
            { name: 'referenceNumber', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { 200: { description: 'File stream' }, 404: error('Not found') },
        },
      },
      '/citizen/requests/{referenceNumber}/replies': {
        post: {
          tags: ['Citizen requests'],
          summary: 'Provide additional information (NEED_INFO only)',
          security: [{ citizenSession: [] }],
          parameters: [
            { name: 'referenceNumber', in: 'path', required: true, schema: { type: 'string' } },
            { $ref: '#/components/parameters/CsrfToken' },
          ],
          responses: { 201: { description: 'Reply recorded' }, 409: error('Status does not allow a reply') },
        },
      },
      '/auth/staff/login': {
        post: {
          tags: ['Staff authentication'],
          summary: 'Sign in',
          parameters: [{ $ref: '#/components/parameters/CsrfToken' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: { username: { type: 'string' }, password: { type: 'string', format: 'password' } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Signed in; cookies set' },
            401: error('Invalid credentials'),
            403: error('Account disabled'),
            423: error('Account temporarily locked'),
          },
        },
      },
      '/auth/staff/refresh': {
        post: {
          tags: ['Staff authentication'],
          summary: 'Rotate the refresh session',
          parameters: [{ $ref: '#/components/parameters/CsrfToken' }],
          responses: { 200: { description: 'Rotated' }, 401: error('Expired, invalid or reused token') },
        },
      },
      '/auth/staff/logout': {
        post: {
          tags: ['Staff authentication'],
          summary: 'Sign out',
          security: [{ staffSession: [] }],
          parameters: [{ $ref: '#/components/parameters/CsrfToken' }],
          responses: { 200: { description: 'Signed out' } },
        },
      },
      '/auth/staff/me': {
        get: {
          tags: ['Staff authentication'],
          summary: 'Current staff member, scope and capabilities',
          security: [{ staffSession: [] }],
          responses: { 200: { description: 'Identity' }, 401: error('Not signed in') },
        },
      },
      '/staff/requests': {
        get: {
          tags: ['Staff operations'],
          summary: 'List requests within the caller\'s scope',
          description: 'Filters are intersected with the caller\'s scope; they can narrow but never widen it.',
          security: [{ staffSession: [] }],
          parameters: [
            ...paginationParams,
            { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/RequestStatus' } },
            { name: 'departmentId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'sectionId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'assignedTo', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'serviceId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'sort', in: 'query', schema: { type: 'string', example: '-createdAt' } },
          ],
          responses: { 200: { description: 'Paginated requests' }, 401: error('Not signed in') },
        },
      },
      '/staff/requests/{requestId}': {
        get: {
          tags: ['Staff operations'],
          summary: 'Request detail including internal notes',
          security: [{ staffSession: [] }],
          parameters: [{ name: 'requestId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Detail' }, 404: error('Outside the caller\'s scope or unknown') },
        },
      },
      '/staff/requests/{requestId}/assignment': {
        patch: {
          tags: ['Staff operations'],
          summary: 'Assign or reassign (MANAGER, SECTION_HEAD)',
          security: [{ staffSession: [] }],
          parameters: [
            { name: 'requestId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/CsrfToken' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['assignedTo'],
                  properties: { assignedTo: { type: 'string', format: 'uuid', nullable: true } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Assigned' },
            403: error('Role or section not permitted'),
            422: error('Assignee inactive, or in another department or section'),
          },
        },
      },
      '/staff/requests/{requestId}/status': {
        patch: {
          tags: ['Staff operations'],
          summary: 'Change status along a permitted transition',
          security: [{ staffSession: [] }],
          parameters: [
            { name: 'requestId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/CsrfToken' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { $ref: '#/components/schemas/RequestStatus' },
                    note: { type: 'string' },
                    noteVisibility: { $ref: '#/components/schemas/LogVisibility' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Status changed' },
            409: error('Transition not permitted, or the request is terminal'),
          },
        },
      },
      '/staff/requests/{requestId}/notes': {
        post: {
          tags: ['Staff operations'],
          summary: 'Add an internal note or a citizen-visible reply',
          security: [{ staffSession: [] }],
          parameters: [
            { name: 'requestId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/CsrfToken' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message', 'visibility'],
                  properties: {
                    message: { type: 'string' },
                    visibility: { $ref: '#/components/schemas/LogVisibility' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Note added' } },
        },
      },
      '/staff/requests/{requestId}/logs': {
        get: {
          tags: ['Staff operations'],
          summary: 'Full request timeline',
          security: [{ staffSession: [] }],
          parameters: [
            { name: 'requestId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            ...paginationParams,
          ],
          responses: { 200: { description: 'Timeline' } },
        },
      },
      '/staff/requests/{requestId}/attachments/{attachmentId}': {
        get: {
          tags: ['Staff operations'],
          summary: 'Download an attachment within scope',
          security: [{ staffSession: [] }],
          parameters: [
            { name: 'requestId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { 200: { description: 'File stream' }, 403: error('Quarantined file') },
        },
      },
      '/staff/analytics/summary': {
        get: {
          tags: ['Staff operations'],
          summary: 'Role-scoped analytics summary',
          description: 'Scope is derived from the caller\'s role. There are no scope parameters.',
          security: [{ staffSession: [] }],
          responses: { 200: { description: 'Summary' } },
        },
      },
    },
  };
}
