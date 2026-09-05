import { z } from 'zod';

export const staffLoginBody = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Enter your username')
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/, 'The username contains unsupported characters'),
    // No maximum-strength rules on the login form: complexity belongs to account
    // creation. The cap only bounds the Argon2 input.
    password: z.string().min(1, 'Enter your password').max(200),
  })
  .strict();

export const staffLogoutBody = z
  .object({
    everywhere: z.boolean().optional().default(false),
  })
  .strict();
