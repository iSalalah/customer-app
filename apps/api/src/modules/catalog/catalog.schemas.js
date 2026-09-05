import { z } from 'zod';

export const departmentIdParams = z
  .object({
    departmentId: z.string().uuid('departmentId must be a valid identifier'),
  })
  .strict();
