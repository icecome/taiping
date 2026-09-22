import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv } from '../lib/http'
import { jsonFail, jsonOk } from '../lib/http'
import {
  claimWebhookEvent,
  extractPlainText,
  extractReplyText,
  extractTokenFromAddress,
  verifyWebhookSignature,
} from '../services/inbound'
import { appendEmailReply, findCommentByReplyToken } from '../services/comments'

/**
 * Resend Inbound 回信接收。
 * 访客直接回复通知邮件时，Resend 推送 email.received 事件到此端点。
 * 未配置 RESEND_WEBHOOK_SECRET 时一律拒绝，避免出现无验签的开放写入点。
 */
const inbound = new Hono<AppEnv>()

inbound.post('/inbound/replies', async (c) => {
  const rawBody = await c.req.text()

  const valid = await verifyWebhookSignature(
    c.env.RESEND_WEBHOOK_SECRET,
    rawBody,
    c.req.raw.headers,
  )
  if (!valid) {
    return jsonFail(c, 'FORBIDDEN', '签名验证失败')
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return jsonFail(c, 'VALIDATION_FAILED', '请求体格式错误')
  }

  if (event.type !== 'email.received') {
    // 其它事件类型确认收到即可
    return jsonOk(c, { ignored: true })
  }

  const data =
    event.data && typeof event.data === 'object'
      ? (event.data as Record<string, unknown>)
      : event
  const emailId = typeof data.email_id === 'string' ? data.email_id : ''
  if (!emailId) {
    return jsonFail(c, 'VALIDATION_FAILED', '缺少 email_id')
  }

  // 尽快应答，耗时处理放 waitUntil（Svix 有超时重试）
  const svixId = c.req.header('svix-id') ?? ''
  c.executionCtx.waitUntil(handleReceivedEmail(c, data, emailId, svixId))
  return jsonOk(c, { received: true })
})

async function handleReceivedEmail(
  c: Context<AppEnv>,
  data: Record<string, unknown>,
  emailId: string,
  svixId: string,
): Promise<void> {
  try {
    // 幂等：同一 svix-id 只处理一次
    if (!svixId || !(await claimWebhookEvent(c.env.DB, svixId))) {
      console.warn('[inbound] 重复或缺失事件标识，已跳过')
      return
    }

    // 从收件地址解析回信令牌
    const toField = Array.isArray(data.to) ? (data.to as string[]) : []
    const receivedFor = Array.isArray(data.received_for) ? (data.received_for as string[]) : []
    let token = ''
    for (const addr of [...receivedFor, ...toField]) {
      token = extractTokenFromAddress(String(addr))
      if (token) break
    }
    if (!token) {
      console.warn('[inbound] 收件地址中未找到回信令牌')
      return
    }

    const comment = await findCommentByReplyToken(c.env.DB, token)
    if (!comment) {
      console.warn('[inbound] 令牌未命中评论')
      return
    }

    // 仅接受原评论人邮箱的回信，防止他人冒名
    const fromEmail = typeof data.from === 'string' ? data.from : ''
    const sender = extractEmailAddress(fromEmail)
    if (!comment.email || sender.toLowerCase() !== comment.email.trim().toLowerCase()) {
      console.warn('[inbound] 发件人与评论人邮箱不符，已拒收')
      return
    }

    // webhook 只含元数据，需回查邮件正文
    const emailResp = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${c.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!emailResp.ok) {
      console.warn(`[inbound] 拉取邮件正文失败: HTTP ${emailResp.status}`)
      return
    }
    const emailData = (await emailResp.json()) as { text?: string; html?: string }

    const plain = extractPlainText(emailData.text ?? '', emailData.html ?? '')
    const content = extractReplyText(plain)
    if (!content) {
      console.warn('[inbound] 未提取到有效回信内容')
      return
    }

    await appendEmailReply(c.env.DB, comment.id, content, sender)
    console.log(`[inbound] 评论 ${comment.id} 收到回信`)
  } catch (err) {
    console.error('[inbound] 处理回信异常:', err)
  }
}

/** 从 "Name <a@b.com>" 或裸地址中取出邮箱 */
function extractEmailAddress(value: string): string {
  const m = value.match(/<([^>]+)>/)
  return (m ? (m[1] ?? '') : value).trim()
}

export default inbound
