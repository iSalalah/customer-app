import { z } from 'zod';

import { isValidOmanPhone } from '@dhofar/shared';

/**
 * `.strict()` everywhere: an unexpected property is a 400, which is what stops
 * mass assignment before a value can reach a service.
 */

const phoneNumber = z
  .string()
  .min(8, 'Enter a valid Oman mobile number')
  .max(20)
  .refine(isValidOmanPhone, { message: 'Enter a valid Oman mobile number' });

export const otpRequestBody = z.object({ phoneNumber }).strict();

export const otpResendBody = z.object({ phoneNumber }).strict();

export const otpVerifyBody = z
  .object({
    phoneNumber,
    code: z
      .string()
      .trim()
      .regex(/^[0-9]{4,10}$/, 'The verification code must be numeric'),
  })
  .strict();
