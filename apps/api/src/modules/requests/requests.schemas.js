import { z } from 'zod';

import {
  LOG_VISIBILITIES,
  PAGINATION,
  REQUEST_STATUSES,
  TEXT_LIMITS,
  isValidReferenceNumber,
} from '@dhofar/shared';

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .optional();

const page = z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE);
const pageSize = z.coerce
  .number()
  .int()
  .min(1)
  .max(PAGINATION.MAX_PAGE_SIZE)
  .default(PAGINATION.DEFAULT_PAGE_SIZE);

export const referenceNumberParams = z
  .object({
    referenceNumber: z
      .string()
      .trim()
      .toUpperCase()
      .refine(isValidReferenceNumber, { message: 'Enter a valid reference number' }),
  })
  .strict();

export const referenceAttachmentParams = z
  .object({
    referenceNumber: z
      .string()
      .trim()
      .toUpperCase()
      .refine(isValidReferenceNumber, { message: 'Enter a valid reference number' }),
    attachmentId: z.string().uuid(),
  })
  .strict();

export const requestIdParams = z.object({ requestId: z.string().uuid() }).strict();

export const requestAttachmentParams = z
  .object({ requestId: z.string().uuid(), attachmentId: z.string().uuid() })
  .strict();

export const citizenRequestListQuery = z
  .object({
    page,
    pageSize,
    status: z.enum(REQUEST_STATUSES).optional(),
    from: dateOnly,
    to: dateOnly,
    sort: z.string().max(40).optional(),
  })
  .strict();

/**
 * Creation body. Note what is NOT accepted: departmentId, sectionId, status,
 * assignedTo, referenceNumber. Those are decided by the server, and `.strict()`
 * turns an attempt to supply one into a 400 rather than a silent ignore.
 *
 * Multipart fields arrive as strings, hence the explicit trims.
 */
export const createRequestBody = z
  .object({
    serviceId: z.string().uuid('Select a service'),
    title: z
      .string()
      .trim()
      .min(TEXT_LIMITS.TITLE_MIN, 'The title is too short')
      .max(TEXT_LIMITS.TITLE_MAX, 'The title is too long'),
    description: z
      .string()
      .trim()
      .min(TEXT_LIMITS.DESCRIPTION_MIN, 'Please describe your request in more detail')
      .max(TEXT_LIMITS.DESCRIPTION_MAX, 'The description is too long'),
  })
  .strict();

export const citizenReplyBody = z
  .object({
    message: z
      .string()
      .trim()
      .min(TEXT_LIMITS.REPLY_MIN, 'Enter a message')
      .max(TEXT_LIMITS.REPLY_MAX, 'The message is too long'),
  })
  .strict();

export const staffRequestListQuery = z
  .object({
    page,
    pageSize,
    status: z.enum(REQUEST_STATUSES).optional(),
    departmentId: z.string().uuid().optional(),
    sectionId: z.string().uuid().optional(),
    assignedTo: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    from: dateOnly,
    to: dateOnly,
    q: z.string().trim().min(2).max(60).optional(),
    sort: z.string().max(40).optional(),
  })
  .strict();

export const logListQuery = z.object({ page, pageSize }).strict();

export const updateStatusBody = z
  .object({
    status: z.enum(REQUEST_STATUSES),
    note: z.string().trim().min(TEXT_LIMITS.NOTE_MIN).max(TEXT_LIMITS.NOTE_MAX).optional(),
    // Deliberately no default: the schema must not invent a visibility, or the
    // refinement below could never tell "no note wanted" from "note omitted by
    // mistake". The service applies CITIZEN_VISIBLE when this is absent.
    noteVisibility: z.enum(LOG_VISIBILITIES).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.noteVisibility && !value.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A note is required when a visibility is specified',
      });
    }
  });

export const updateAssignmentBody = z
  .object({
    // null unassigns; the field is required so the intent is always explicit.
    assignedTo: z.string().uuid().nullable(),
  })
  .strict();

export const addNoteBody = z
  .object({
    message: z.string().trim().min(TEXT_LIMITS.NOTE_MIN).max(TEXT_LIMITS.NOTE_MAX),
    visibility: z.enum(LOG_VISIBILITIES),
  })
  .strict();
