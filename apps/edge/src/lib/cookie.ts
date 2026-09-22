/** 从 Cookie 头读取单个 cookie 值 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  const parts = header.split(';').map((p) => p.trim())
  const hit = parts.find((p) => p.startsWith(`${name}=`))
  return hit ? hit.slice(name.length + 1) : undefined
}
