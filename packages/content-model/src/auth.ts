import { z } from 'zod'

/** 登录口令下限：兼容历史短口令 */
export const LOGIN_PASSWORD_MIN = 4
/** 新建/重置口令下限 */
export const NEW_PASSWORD_MIN = 8
/** 文章访问密码下限 */
export const ENCRYPT_PASSWORD_MIN = 4

export const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(LOGIN_PASSWORD_MIN).max(128),
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
    newPassword: z.string().min(NEW_PASSWORD_MIN).max(128),
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

/** 申请口令重置（仅需用户名，响应不区分账号是否存在） */
export const forgotPasswordSchema = z.object({
  username: z.string().min(1).max(64),
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

/** 使用重置令牌设置新口令 */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(16).max(128),
    newPassword: z.string().min(NEW_PASSWORD_MIN).max(128),
    confirmPassword: z.string().min(1).max(128),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: '两次输入的新口令不一致',
    path: ['confirmPassword'],
  })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

/** 恢复邮箱 */
export const adminEmailSchema = z.object({
  email: z.string().email('请输入合法的邮箱地址').max(160),
})
export type AdminEmailInput = z.infer<typeof adminEmailSchema>

/**
 * 首次初始化注册：仅当系统中尚无管理员时可用。
 * 用户名约束略严于登录，便于新账号可读、可输入。
 */
export const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(2, '用户名至少 2 个字符')
      .max(32, '用户名最多 32 个字符')
      .regex(/^[a-zA-Z0-9_-]+$/, '用户名仅支持字母、数字、下划线和短横线'),
    password: z.string().min(NEW_PASSWORD_MIN).max(128),
    confirmPassword: z.string().min(1).max(128),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: '两次输入的口令不一致',
    path: ['confirmPassword'],
  })
export type RegisterInput = z.infer<typeof registerSchema>
