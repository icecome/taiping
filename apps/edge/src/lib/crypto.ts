const encoder = new TextEncoder()

/**
 * 新口令哈希迭代次数。
 * 600000 在 Cloudflare Workers 上容易超出 CPU 限额导致 500；
 * 校验时仍按哈希串内存储的迭代次数，旧记录不受影响。
 */
export const PASSWORD_HASH_ITERATIONS = 150_000

export async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations: PASSWORD_HASH_ITERATIONS,
    },
    keyMaterial,
    256,
  )
  return `pbkdf2$${PASSWORD_HASH_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  const saltHex = parts[2] ?? ''
  const expectedHex = parts[3] ?? ''
  if (!Number.isFinite(iterations) || !saltHex || !expectedHex) return false
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(saltHex) as BufferSource,
      iterations,
    },
    keyMaterial,
    256,
  )
  return await timingSafeEqual(bytesToHex(new Uint8Array(bits)), expectedHex)
}

export async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return bytesToHex(new Uint8Array(sig))
}

export async function hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(payload, secret)
  return await timingSafeEqual(expected, signature)
}

export async function hashIp(ip: string, secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${secret}:${ip}`))
  return bytesToHex(new Uint8Array(digest)).slice(0, 32)
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new Error('invalid hex')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/**
 * 恒定时间比较。
 * 生产（Workers）优先使用原生 crypto.subtle.timingSafeEqual；
 * 该 API 非标准 Web Crypto，Node 测试环境缺失，故回退到手写 XOR 实现。
 * 长度不同时也走满比较，避免提前 return 泄露长度信息。
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const ab = encoder.encode(a)
  const bb = encoder.encode(b)
  const maxLen = Math.max(ab.byteLength, bb.byteLength)
  const xa = new Uint8Array(maxLen)
  const ya = new Uint8Array(maxLen)
  xa.set(ab)
  ya.set(bb)
  let diff = ab.byteLength ^ bb.byteLength
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (x: BufferSource, y: BufferSource) => boolean
  }
  if (typeof subtle.timingSafeEqual === 'function') {
    // 保留接收者，避免部分运行时对方法脱离对象调用报 Illegal invocation
    return subtle.timingSafeEqual(xa, ya) && diff === 0
  }
  for (let i = 0; i < maxLen; i++) {
    diff |= (xa[i] ?? 0) ^ (ya[i] ?? 0)
  }
  return diff === 0
}
