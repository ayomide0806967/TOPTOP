import { z } from 'zod';

export const initiatePaystackSchema = z.object({
  planId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const verifyPaystackSchema = z.object({
  reference: z.string().trim().min(3),
});

export const reconcilePaymentsSchema = z.object({
  userId: z.string().uuid().optional(),
});
