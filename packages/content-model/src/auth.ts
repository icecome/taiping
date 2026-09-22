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

/** 管理员账号（口令哈希不进入契约层，仅服务端可见） */
export const adminSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1).max(64),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Admin = z.infer<typeof adminSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(1).max(128),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: '两次输入的新口令不一致',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: '新口令不能与当前口令相同',
    path: ['newPassword'],
  })
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
