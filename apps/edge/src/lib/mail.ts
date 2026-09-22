import type { Env } from '../env'

/**
 * 邮件发送（Resend）。
 * 设计要点：发送失败不抛出——调用方多为「口令重置」「通知」等
 * 辅助流程，邮件失败不应连带业务操作失败。
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

// 与前台拙素主题一致的暖色纸感配色
const PALETTE = {
  bg: '#F1F0ED',
  surface: '#FAFAF8',
  ink: '#33332F',
  ink2: '#6F6D65',
  ink3: '#9A978B',
  line: '#DDDCD8',
  lineLight: '#E8E7E4',
  brand: '#9B2226',
}

const FONT =
  "'Noto Serif CJK SC', 'Source Han Serif SC', 'Songti SC', STSong, SimSun, Georgia, serif"

export interface MailEnv {
  RESEND_API_KEY?: string
  RESEND_FROM?: string
}

export function isMailConfigured(env: MailEnv): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 字段块：标签在上、内容在下，行间细线分隔 */
function field(label: string, valueHtml: string): string {
  return `<tr>
      <td style="padding:14px 0;border-bottom:1px solid ${PALETTE.lineLight};">
        <div style="font-size:12px;letter-spacing:0.08em;color:${PALETTE.ink3};margin-bottom:6px;">${label}</div>
        <div style="font-size:15px;line-height:1.8;color:${PALETTE.ink};">${valueHtml}</div>
      </td>
    </tr>`
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:11px 22px;background:${PALETTE.ink};color:#fff;text-decoration:none;border-radius:4px;font-size:14px;letter-spacing:0.04em;">${label}</a>`
}

/** 邮件外壳：暖色背景 + 衬线排版 */
function emailShell(kicker: string, title: string, bodyHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.bg};">
  <tr>
    <td style="padding:40px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" align="center" style="font-family:${FONT};">
        <tr>
          <td style="padding:8px 0 4px;">
            <div style="font-size:12px;letter-spacing:0.18em;color:${PALETTE.brand};">${kicker}</div>
            <h1 style="font-size:22px;font-weight:600;color:${PALETTE.ink};margin:10px 0 0;line-height:1.4;letter-spacing:0.03em;">${title}</h1>
            <div style="border-top:1px solid ${PALETTE.line};margin:22px 0 0;"></div>
          </td>
        </tr>
        <tr>
          <td style="padding:4px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${bodyHtml}</table>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 0 0;">
            <div style="border-top:1px solid ${PALETTE.lineLight};padding-top:14px;font-size:12px;color:${PALETTE.ink3};line-height:1.7;">
              此邮件由系统自动发送，请勿直接回复。
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

async function sendViaResend(
  env: MailEnv,
  payload: Record<string, unknown>,
  logLabel: string,
): Promise<boolean> {
  if (!isMailConfigured(env)) {
    console.warn(`[mail] ${logLabel}: 未配置 RESEND_API_KEY / RESEND_FROM，跳过发送`)
    return false
  }
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      console.warn(`[mail] ${logLabel}失败: HTTP ${response.status}`)
      return false
    }
    return true
  } catch (err) {
    console.error(`[mail] ${logLabel}异常:`, err)
    return false
  }
}

/** 口令重置邮件 */
export async function sendPasswordResetEmail(
  env: MailEnv,
  to: string,
  resetUrl: string,
  siteTitle: string,
  ttlMinutes: number,
): Promise<boolean> {
  const body =
    field('请求来源', escapeHtml(siteTitle)) +
    field(
      '有效期',
      `<strong>${ttlMinutes} 分钟</strong>，且仅可使用一次`,
    ) +
    `<tr><td style="padding:20px 0 6px;">${button(escapeHtml(resetUrl), '重置口令')}</td></tr>` +
    field(
      '若按钮无法点击',
      `<span style="font-size:13px;color:${PALETTE.ink2};word-break:break-all;">${escapeHtml(resetUrl)}</span>`,
    ) +
    field(
      '若非本人操作',
      `<span style="color:${PALETTE.ink2};">请忽略本邮件，你的口令不会发生变化。</span>`,
    )

  return sendViaResend(
    env,
    {
      from: env.RESEND_FROM,
      to: [to],
      subject: `【${siteTitle}】口令重置`,
      html: emailShell('PASSWORD RESET', '重置后台管理口令', body),
    },
    '口令重置邮件',
  )
}
