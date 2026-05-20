import { z } from 'zod';

export const usernameLookupSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters long.')
    .regex(
      /^[a-z0-9_-]+$/,
      'Username may only contain lowercase letters, numbers, underscores, and hyphens.'
    ),
});

export const userAvailabilitySchema = z
  .object({
    username: z.string().trim().toLowerCase().min(3).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().min(6).optional(),
    allowedProfileId: z.string().trim().uuid().optional(),
  })
  .refine((value) => value.username || value.email || value.phone, {
    message: 'At least one lookup value is required.',
  });
