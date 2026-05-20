import { z } from 'zod';

export const createPendingRegistrationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().trim().min(1, 'Last name is required.'),
  phone: z
    .string()
    .trim()
    .min(5)
    .max(32)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .regex(/^[a-z0-9_-]+$/),
  password: z.string().min(8, 'Password must be at least 8 characters long.'),
  planId: z
    .string()
    .trim()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
