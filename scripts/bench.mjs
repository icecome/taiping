#!/usr/bin/env node
/**
 * 性能基准脚本。
 *
 * 为什么不做「压测」而做「单请求延迟统计」：这个项目的部署形态是单个 Worker，
 * 瓶颈不在并发调度而在单次请求的 D1 往返次数与渲染开销。用 N 次串行请求统计
 * min/avg/p95 更能反映真实体验，也不需要在本地起负载发生器。
 *
 * 用法：
 *   node scripts/bench.mjs                 # 默认 http://127.0.0.1:8787
 *   BASE_URL=... ROUNDS=30 node scripts/bench.mjs
 *
 * 说明：
 *   - 带 --cold 参数时，每轮先 bump 缓存版本再请求，测的是「缓存未命中」路径；
 *   - 不带参数则测「缓存命中」路径（首页与文章页会走 Cache API）。
 */

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const ROUNDS = Number(process.env.ROUNDS ?? 20);
const COOKIE = process.env.SESSION_COOKIE ?? "";
/**
 * 计时请求带的凭证与「bump 缓存版本」用的凭证可以分开：
 * 页面缓存只对匿名请求生效，带会话 cookie 的请求会绕过缓存。
 * 因此测「匿名缓存未命中」时要 BENCH_ANON=1，让计时请求匿名、bump 请求带 cookie。
 */
const TIMED_COOKIE = process.env.BENCH_ANON ? "" : COOKIE;
const COLD = process.argv.includes("--cold");

function pct(sorted, p) {
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

async function timeOnce(path) {
  const started = performance.now();
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: TIMED_COOKIE ? { cookie: TIMED_COOKIE } : {},
  });
  await response.arrayBuffer();
  const elapsed = performance.now() - started;
  return { status: response.status, ms: elapsed };
}

async function bumpCache() {
  if (!COOKIE) return false;
  const response = await fetch(`${BASE_URL}/api/settings/cache`, { method: "DELETE", headers: { cookie: COOKIE } });
  return response.ok;
}

const TARGETS = [
  { name: "首页 /", path: "/" },
  { name: "文章页 /post/:slug", path: "/post/why-rewrite-the-blog-again" },
  { name: "归档 /archive", path: "/archive" },
  { name: "分类页 /category/tech", path: "/category/tech" },
  { name: "搜索 /search?q=", path: `/search?q=${encodeURIComponent("权限")}` },
  { name: "RSS /rss.xml", path: "/rss.xml" },
  { name: "sitemap /sitemap.xml", path: "/sitemap.xml" },
  { name: "API /api/health", path: "/api/health" },
  { name: "API /api/contents (auth)", path: "/api/contents?pageSize=20" },
];

async function main() {
  console.log(`目标 ${BASE_URL} · 每项 ${ROUNDS} 次 · 模式 ${COLD ? "缓存未命中" : "缓存命中"}\n`);
  const rows = [];

  for (const target of TARGETS) {
    const samples = [];
    let status = 0;
    for (let i = 0; i < ROUNDS; i += 1) {
      if (COLD && i > 0) await bumpCache();
      const result = await timeOnce(target.path);
      status = result.status;
      // 第一次是预热（DNS/TLS/模块初始化），不计入统计
      if (i > 0) samples.push(result.ms);
    }
    samples.sort((a, b) => a - b);
    const sum = samples.reduce((acc, value) => acc + value, 0);
    rows.push({
      路径: target.name,
      状态: status,
      最小: `${samples[0].toFixed(1)} ms`,
      平均: `${(sum / samples.length).toFixed(1)} ms`,
      P95: `${pct(samples, 95).toFixed(1)} ms`,
      样本: samples.length,
    });
  }

  console.table(rows);
  const totals = rows.map((row) => Number.parseFloat(row.平均));
  console.log(`\n全部端点平均延迟：${(totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1)} ms`);
  if (COLD && !COOKIE) console.log("提示：--cold 需要 SESSION_COOKIE 才能 bump 缓存版本，当前退化为普通测量。");
}

main().catch((error) => {
  console.error("基准失败：", error.message);
  process.exitCode = 1;
});
