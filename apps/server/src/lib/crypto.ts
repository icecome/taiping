/**
 * 口令与会话密钥。
 *
 * 设计取舍（对比参考项目）：
 * - LuyBlog 把 createId() 直接当会话 token 明文入库，会话不可撤销且随机源非 CSPRNG。
 * - 这里 token 由 32 字节 CSPRNG 生成，库里只存 SHA-256，泄露库也伪造不出会话。
 * - 口令用 PBKDF2-HMAC-SHA256。迭代次数受 Workers CPU 预算约束，flare-stack-blog
 *   也为同样的原因下调过（其提交记录有 "降低密码哈希迭代次数以适配 Cloudflare Workers"）。
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** 产出 `pbkdf2$sha256$<iterations>$<saltB64>$<hashB64>`，自带参数便于以后平滑升级强度。 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = fromBase64(parts[3]!);
  const expected = fromBase64(parts[4]!);
  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/** 会话 token 的存储形态。 */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Base64(input: ArrayBuffer | Uint8Array): Promise<string> {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** 密码强度检查：长度 + 至少两类字符。返回不满足的原因，通过返回 null。 */
export function checkPasswordStrength(password: string, minLength: number): string | null {
  if (password.length < minLength) return `密码至少 ${minLength} 位`;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 2) return "密码需包含字母、数字、符号中的至少两类";
  return null;
}
