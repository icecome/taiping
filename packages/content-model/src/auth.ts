import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(4).max(128),
})
export type LoginInput = z.infer<typeof loginSchema>

export const sessionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  trusted: z.boolean().default(false),
})
export type Session = z.infer<typeof sessionSchema>

export const unlockSchema = z.object({
  password: z.string().min(1).max(128),
})
export type UnlockInput = z.infer<typeof unlockSchema>
