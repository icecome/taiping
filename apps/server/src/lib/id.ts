/**
 * ID 生成：`前缀_16位base32`。
 *
 * 用 crypto.getRandomValues（CSPRNG）而不是 Math.random —— 与 LuyBlog 用 cuid2
 * 生成会话 token 的写法相比，这里的随机源强度足够，但**会话 token 另走一套**
 * 32 字节随机 + SHA-256 存储，见 lib/crypto.ts。
 */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // 去掉 i/l/o/u，避免肉眼混淆

export function randomBase32(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % 32];
  }
  return out;
}

export type IdPrefix =
  | "usr"
  | "rol"
  | "ses"
  | "tok"
  | "aud"
  | "cnt"
  | "rev"
  | "trm"
  | "cmt"
  | "med"
  | "nav"
  | "fld"
  | "plg"
  | "tsk"
  | "rds";

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomBase32(16)}`;
}

/** 会话/令牌用：32 字节随机转 URL 安全 base64。 */
export function newSecretToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let binary = "";
  for (const b of buf) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 请求 ID：短、可读、不参与安全判定。 */
export function newRequestId(): string {
  return randomBase32(12);
}
