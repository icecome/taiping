import { describe, expect, it } from "vitest";
import { checkPasswordStrength, hashPassword, sha256Hex, verifyPassword } from "./crypto";

describe("口令哈希", () => {
  it("正确口令校验通过", async () => {
    const stored = await hashPassword("Taiping@2026");
    expect(await verifyPassword("Taiping@2026", stored)).toBe(true);
  });

  it("错误口令校验失败", async () => {
    const stored = await hashPassword("Taiping@2026");
    expect(await verifyPassword("taiping@2026", stored)).toBe(false);
  });

  it("同一口令两次哈希结果不同（随机盐）", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("哈希串自带算法与迭代次数，便于以后升级强度", async () => {
    const stored = await hashPassword("x");
    const [algorithm, hash, iterations] = stored.split("$");
    expect(algorithm).toBe("pbkdf2");
    expect(hash).toBe("sha256");
    expect(Number(iterations)).toBe(100_000);
    expect(stored.split("$")).toHaveLength(5);
  });

  it("被篡改的哈希串不会误判通过", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$sha256$0$AA==$AA==")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$sha256$1$AA==$AA==")).toBe(false);
  });

  it("口令做 NFKC 归一化，全角字符与半角等价", async () => {
    const stored = await hashPassword("Ａb1!");
    expect(await verifyPassword("Ab1!", stored)).toBe(true);
  });
});

describe("sha256Hex", () => {
  it("输出 64 位十六进制且稳定", async () => {
    const a = await sha256Hex("token");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex("token")).toBe(a);
  });

  it("不同输入结果不同", async () => {
    expect(await sha256Hex("a")).not.toBe(await sha256Hex("b"));
  });
});

describe("checkPasswordStrength", () => {
  it("太短被拒绝", () => {
    expect(checkPasswordStrength("Ab1", 10)).toContain("至少");
  });

  it("单字符类别被拒绝", () => {
    expect(checkPasswordStrength("aaaaaaaaaaa", 10)).toContain("两类");
  });

  it("长度与类别都满足时通过", () => {
    expect(checkPasswordStrength("Taiping2026", 10)).toBeNull();
    expect(checkPasswordStrength("abcdefgh1!", 10)).toBeNull();
  });
});
