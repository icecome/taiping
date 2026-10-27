#!/usr/bin/env node
/**
 * 演示数据初始化脚本（也可当作端到端冒烟测试用）。
 *
 * 为什么不用 seed.sql：内容、分类、字段这些数据要经过 slug 生成、Markdown 渲染、
 * 计数重算、搜索索引刷新等应用层逻辑才会一致。直接写 SQL 会绕过它们，
 * 造出一份"看着像但和真实写入路径不一致"的数据。走 API 顺带把整条链路也验了一遍。
 *
 * 用法：
 *   pnpm dev            # 另开一个终端启动 Worker
 *   node scripts/seed.mjs
 *
 * 环境变量：
 *   BASE_URL       默认 http://127.0.0.1:8787
 *   OWNER_EMAIL    默认 owner@taiping.local
 *   OWNER_PASSWORD 默认 Taiping@2026
 */

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "owner@taiping.local";
const OWNER_USERNAME = process.env.OWNER_USERNAME ?? "owner";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "Taiping@2026";

let cookie = "";
let created = 0;
let skipped = 0;

function log(step, message) {
  console.log(`[${step}] ${message}`);
}

async function api(method, path, body, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined && !(body instanceof FormData)) headers["content-type"] = "application/json";
  if (!["GET", "HEAD"].includes(method)) headers["x-requested-with"] = "seed-script";

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    redirect: "manual",
  });

  const setCookie = response.headers.getSetCookie?.() ?? [];
  for (const raw of setCookie) {
    if (raw.startsWith("taiping_session=")) cookie = raw.split(";")[0];
  }

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!response.ok) {
    const error = new Error(`${method} ${path} -> ${response.status} ${json?.error?.message ?? text.slice(0, 200)}`);
    error.status = response.status;
    error.payload = json;
    throw error;
  }
  return json;
}

async function bootstrapOwner() {
  try {
    const result = await api("POST", "/api/auth/setup", {
      email: OWNER_EMAIL,
      username: OWNER_USERNAME,
      displayName: "太平",
      password: OWNER_PASSWORD,
    });
    log("auth", `初始化站点所有者 ${OWNER_EMAIL} 成功`);
    return result.data;
  } catch (error) {
    if (error.status !== 409) throw error;
    log("auth", "站点已初始化，改用登录");
    const result = await api("POST", "/api/auth/login", { identifier: OWNER_EMAIL, password: OWNER_PASSWORD });
    log("auth", `登录成功：${result.data.displayName}`);
    return result.data;
  }
}

async function ensureTerms() {
  const wanted = [
    { type: "category", name: "技术", slug: "tech", description: "工程实践与架构笔记。" },
    { type: "category", name: "设计", slug: "design", description: "界面、排版与视觉。" },
    { type: "category", name: "生活", slug: "life", description: "阅读、旅行与日常。" },
    { type: "tag", name: "Cloudflare", slug: "cloudflare" },
    { type: "tag", name: "Workers", slug: "workers" },
    { type: "tag", name: "Typecho", slug: "typecho" },
    { type: "tag", name: "Halo", slug: "halo" },
    { type: "tag", name: "架构", slug: "architecture" },
    { type: "tag", name: "中文排版", slug: "chinese-typography" },
    { type: "series", name: "重建博客", slug: "rebuild-blog" },
  ];

  const existing = await api("GET", "/api/terms?type=category&pageSize=100");
  const flat = {};
  const walk = (nodes) => {
    for (const node of nodes ?? []) {
      flat[`${node.type}:${node.slug}`] = node;
      walk(node.children);
    }
  };
  walk(existing.data.items);

  const tags = await api("GET", "/api/terms?type=tag&pageSize=100");
  for (const node of tags.data.items ?? []) flat[`${node.type}:${node.slug}`] = node;
  const series = await api("GET", "/api/terms?type=series&pageSize=100");
  for (const node of series.data.items ?? []) flat[`${node.type}:${node.slug}`] = node;

  const out = { ...flat };
  for (const term of wanted) {
    const key = `${term.type}:${term.slug}`;
    if (out[key]) {
      skipped += 1;
      continue;
    }
    const result = await api("POST", "/api/terms", term);
    out[key] = result.data;
    created += 1;
  }
  log("terms", `分类 / 标签 / 系列就绪：新建 ${created} 个，已存在 ${skipped} 个`);
  return out;
}

const POSTS = [
  {
    title: "为什么我又把博客重写了一遍",
    slug: "why-rewrite-the-blog-again",
    categories: ["tech", "design"],
    tags: ["architecture", "cloudflare"],
    excerpt: "第三次重写，这一次先把参考项目的架构读透再动手。",
    body: `## 起因

前两版失败的原因不一样，但根子是同一个：**在没有读完参考项目之前就开始写代码**。

第一版把 Typecho 的七表模型照搬到 D1 上，表结构没问题，问题出在插件系统——我想在 Workers 里做动态加载，
结果既没有类加载隔离，也没有常驻进程，钩子总线最后退化成一堆 if。

第二版走向另一个极端：全部推倒重来，自己设计内容模型。设计文档写了 400 行，
真正落地的功能不到三分之一。

## 这次的做法

1. 先把两个参考项目读到能复述它们的表结构与调用链；
2. 写清楚哪些是**可以直接借鉴的成熟做法**，哪些是**环境不允许照搬的**；
3. 只在两者之间做取舍，不发明第三套。

> 抄架构不丢人，抄错了才丢人。

## 三条定下来的规矩

- 数据模型以 D1 能跑为准，不再为"将来可能要"预留字段；
- 权限先定权限目录，再定角色，角色只是权限的集合；
- 主题只负责显示，不负责取数据。

关键是把「取什么」和「怎么显示」分开，这样换主题不会把查询逻辑一起换掉。`,
  },
  {
    title: "D1 上的全文搜索：FTS5 与中文分词",
    slug: "fts5-and-chinese-tokenization",
    categories: ["tech"],
    tags: ["workers", "architecture"],
    body: `## 问题

SQLite 的 FTS5 默认分词器 \`unicode61\` 会把一整串连续汉字当成一个 token，
所以"博客系统"搜不出"博客"。

## 解决

写入和查询两侧都用 \`Intl.Segmenter\` 预切词，把口径对齐：

\`\`\`ts
const segmenter = new Intl.Segmenter("zh-Hans", { granularity: "word" });
export function segmentText(input: string): string {
  const out: string[] = [];
  for (const part of segmenter.segment(input)) {
    if (part.isWordLike) out.push(part.segment.toLowerCase());
  }
  return out.join(" ");
}
\`\`\`

索引列存的是切好的文本，查询串也切一遍再拼成 \`MATCH\` 表达式：

\`\`\`sql
select content_id, title, slug, bm25(content_fts) as rank
from content_fts
where content_fts match '"博客" AND "系统"'
order by rank
limit 20
\`\`\`

## 为什么不用 LIKE

\`LIKE '%关键词%'\` 在 D1 上无法走索引，只能用全表扫描。内容到几百篇之后，
一次搜索会拖慢整个 Worker 的 CPU 预算。`,
  },
  {
    title: "给权限设计划一条底线：先有目录，再有角色",
    slug: "permission-catalog-before-roles",
    categories: ["tech"],
    tags: ["architecture"],
    body: `## 常见做法的问题

大多数 CMS 先定义角色（管理员、编辑、作者），再把权限挂在角色下。
问题是每加一个功能就要同时改所有角色，改漏一个就是一个越权洞。

## 反过来做

先定义**权限目录**，权限键统一为 \`资源.动作\`：

\`\`\`text
content.create
content.update.own
content.update.any
content.publish.any
user.assignRole
\`\`\`

角色只是权限的集合，而且集合写在代码里，可审阅、可 diff。
判定时永远问"这个操作需要什么权限"，而不是"这个人是什么角色"。

### \`.own\` 与 \`.any\`

\`.own\` 后缀表示"仅限本人创建的对象"。判定函数必须同时拿到对象：

\`\`\`ts
assertContentAccess(auth, "update", content);
\`\`\`

它内部根据 \`content.authorId === auth.user.id\` 选择 \`.own\` 还是 \`.any\`。
这样"作者只能改自己的、编辑能改所有人的"这种差异，不用写进业务代码。`,
  },
  {
    title: "在 Workers 上做页面缓存的朴素方案",
    slug: "page-cache-on-workers",
    categories: ["tech"],
    tags: ["workers", "cloudflare"],
    body: `## 三件套太重

完整的页面缓存方案要做「公开快照表 + Cache API + Cache-Tag」，正确，但迁移成本高。

## 一个够用的方案

用 Cache API 存匿名 GET 的 HTML，失效靠**一个全局版本号**：

\`\`\`ts
const cacheKey = \`\${url.origin}/__cache/v\${version}\${url.pathname}\${url.search}\`;
\`\`\`

发布内容、改设置、切主题都 bump 版本号。所有缓存键前缀随之变化，等于一次写入全站失效。

### 代价

旧条目要等 TTL 自然过期才被回收，不能立即腾出存储。
对个人博客这个量级无所谓，换成日更几百篇的站点就得改用 tag 反向索引。

### 三个必须绕开的坑

1. 带 Cookie 的请求一律不走缓存，否则会把登录态内容写进共享缓存；
2. 读接口不能有写副作用（比如"读一篇文章自增浏览量"），否则缓存永远命中不了；
3. 缓存键要包含查询串，\`?page=2\` 和 \`?page=3\` 是两份缓存。`,
  },
  {
    title: "中文网页排版的一些具体数字",
    slug: "chinese-web-typography-numbers",
    categories: ["design"],
    tags: ["chinese-typography"],
    body: `## 一组可以直接抄的参数

| 项目 | 取值 | 理由 |
| --- | --- | --- |
| 正文行高 | 1.75 | 中文没有词间空格，行距需要比西文更宽 |
| 正文宽度 | 36–42 个汉字 | 超过 45 字眼睛回行容易串行 |
| 段落间距 | 0.9 倍行高 | 比首行缩进更清晰，也不打断阅读节奏 |
| 字号 | 17px 起 | 15px 以下在中文正文里明显发虚 |

## 容易忽略的两件事

**中西文之间加空格。** 浏览器不会自己加，需要排版层面处理或手工写。
这条在技术文章里尤其明显：\`使用 API 获取数据\` 比 \`使用API获取数据\` 好读得多。

**标点用全角。** 中文正文使用直角引号「」而不是英文双引号，逗号句号一律全角，
括号在中文语境里也用全角。混用会让整段看起来像刚从中英混排工具里出来。`,
  },
  {
    title: "读完《人月神话》之后我改了排期习惯",
    slug: "after-mythical-man-month",
    categories: ["life"],
    tags: [],
    body: `## 那本四十多年前的书

核心结论只有一句：**向进度落后的项目增加人手，只会让它更落后**。

听上去像常识，实际排期的时候几乎所有人都在违反它。

## 我改了三个习惯

1. 排期只按**关键路径**算，其他事情并行但不进估算；
2. 预留 30% 的缓冲，并且写在明面上，不藏在心里；
3. 遇到已经落后的任务，先砍范围，不加人。

第三条最难做到。砍范围意味着要跟人解释"这个版本不做这个了"，
而加人只需要说"我们再找个人帮忙"，短期看起来更容易，长期一定更糟。`,
  },
];

const PAGES = [
  {
    title: "关于",
    slug: "about",
    excerpt: "关于这个站点和写字的人。",
    body: `## 关于本站

这是一个跑在 Cloudflare Workers 上的个人博客，数据存在 D1，媒体存在 R2。
写它的目的很单纯：把想写的东西写下来，不被平台规则和推荐算法干扰。

## 关于我

写代码谋生，业余读点书。

- 邮箱：owner@taiping.local
- RSS：[/rss.xml](/rss.xml)

## 技术

- 服务端：Hono + Drizzle ORM + D1
- 后台：React + TanStack Query
- 前台：服务端渲染的 JSX 主题，零前端框架运行时`,
  },
  {
    title: "订阅与友链",
    slug: "links",
    excerpt: "订阅方式和友链申请说明。",
    body: `## 订阅

- [RSS](/rss.xml)
- [Atom](/atom.xml)
- [JSON Feed](/feed.json)

## 友链

欢迎交换友链。请先在自己站点加上本站链接，然后邮件告知：

| 字段 | 内容 |
| --- | --- |
| 站点名称 | |
| 站点地址 | |
| 一句话介绍 | |
| 头像地址 | |`,
  },
];

const MOMENTS = [
  { title: "关于阅读节奏", body: "最近把「每天读 30 页」改成了「每天读一章」。页数是别人的单位，章才是作者的单位。" },
  { title: "换了个显示器支架", body: "桌面高度终于对上了。花了两年才明白，身体不舒服的时候，先怀疑设备再怀疑自己。" },
  { title: "迁移完成", body: "从旧平台搬过来一共 137 篇文章，脚本跑了 4 分钟。搬完之后最想做的事是把其中一半删掉。" },
];

const PROJECTS = [
  {
    title: "太平 CMS",
    slug: "taiping-cms",
    excerpt: "本项目本身：运行在 Cloudflare Workers 上的博客内容管理系统。",
    body: `## 是什么

一个可以在一个 Worker 里跑完前台 SSR、后台 SPA 与 JSON API 的博客系统。

## 技术栈

- Hono 4 + Drizzle ORM + D1
- React 19 + Vite + TanStack Query（后台）
- 服务端 JSX 主题（前台，零 hydration）

## 状态

可用。已实现内容管理、回收站与版本、分类标签、评论审核、媒体库、
用户与角色、内容模型、导航、系统设置与插件机制。`,
  },
  {
    title: "中文排版检查器",
    slug: "typography-checker",
    excerpt: "检查中西文空格、全半角标点与直角引号的小工具。",
    body: `## 做什么

扫描 Markdown 文本，报告三类问题：

1. 中西文之间缺空格；
2. 中文语境里用了半角标点；
3. 引号用了英文双引号而不是直角引号。

## 不做的事

不自动改。这类规则总有例外，自动改写会把作者本来有意的排版也一起改掉。`,
  },
];

async function createContent(payload, termSlugMap) {
  const body = {
    type: payload.type ?? "post",
    title: payload.title,
    slug: payload.slug,
    excerpt: payload.excerpt ?? null,
    bodyMarkdown: payload.body,
    termIds: [
      ...(payload.categories ?? []).map((slug) => termSlugMap[`category:${slug}`]?.id).filter(Boolean),
      ...(payload.tags ?? []).map((slug) => termSlugMap[`tag:${slug}`]?.id).filter(Boolean),
      ...(payload.series ?? []).map((slug) => termSlugMap[`series:${slug}`]?.id).filter(Boolean),
    ],
  };
  const result = await api("POST", "/api/contents", body);
  created += 1;
  return result.data;
}

async function ensureContents(termSlugMap) {
  const existing = await api("GET", "/api/contents?pageSize=100&status=all");
  const bySlug = new Map((existing.data.items ?? []).map((item) => [item.slug, item]));
  if (bySlug.size > 0) {
    log("contents", `已存在 ${bySlug.size} 条内容，跳过内容初始化`);
    skipped += bySlug.size;
    return bySlug;
  }

  const all = [];
  for (const post of POSTS) all.push({ ...post, type: "post" });
  for (const page of PAGES) all.push({ ...page, type: "page" });
  for (const moment of MOMENTS) all.push({ ...moment, type: "moment" });
  for (const project of PROJECTS) all.push({ ...project, type: "project" });

  for (const item of all) {
    const createdItem = await createContent(item, termSlugMap);
    bySlug.set(createdItem.slug, createdItem);
    if (item.type !== "page") {
      const status = item.type === "moment" ? { target: "published" } : { target: "published" };
      const updated = await api("POST", `/api/contents/${createdItem.id}/status`, status);
      bySlug.set(updated.data.slug, updated.data);
    } else {
      const updated = await api("POST", `/api/contents/${createdItem.id}/status`, { target: "published" });
      bySlug.set(updated.data.slug, updated.data);
    }
  }
  log("contents", `内容就绪：${all.length} 条（文章 ${POSTS.length}、页面 ${PAGES.length}、动态 ${MOMENTS.length}、项目 ${PROJECTS.length}）`);
  return bySlug;
}

async function ensureNav() {
  const existing = await api("GET", "/api/nav?location=header");
  if ((existing.data.items ?? []).length > 0) {
    log("nav", `导航已存在 ${existing.data.items.length} 项，跳过`);
    skipped += 1;
    return;
  }
  const items = [
    { location: "header", label: "首页", href: "/", sortOrder: 1 },
    { location: "header", label: "归档", href: "/archive", sortOrder: 2 },
    { location: "header", label: "动态", href: "/moments", sortOrder: 3 },
    { location: "header", label: "项目", href: "/projects", sortOrder: 4 },
    { location: "header", label: "关于", href: "/about", sortOrder: 5 },
    { location: "footer", label: "RSS", href: "/rss.xml", sortOrder: 1, target: "_blank" },
    { location: "footer", label: "站点地图", href: "/sitemap.xml", sortOrder: 2, target: "_blank" },
  ];
  for (const item of items) await api("POST", "/api/nav", item);
  log("nav", `导航就绪：${items.length} 项`);
}

async function ensureFields() {
  const existing = await api("GET", "/api/fields");
  if ((existing.data.items ?? []).length > 0) {
    log("fields", "内容模型已存在，跳过");
    skipped += 1;
    return;
  }
  const fields = [
    { key: "source_url", label: "原文链接", fieldType: "url", appliesTo: ["post"], sortOrder: 1, description: "若内容首发于其它平台，可填写原文地址。" },
    { key: "rating", label: "推荐指数", fieldType: "number", appliesTo: ["post"], sortOrder: 2 },
    { key: "license", label: "授权协议", fieldType: "select", appliesTo: ["post"], sortOrder: 3, options: [
      { value: "cc-by", label: "CC BY 4.0" },
      { value: "cc-by-nc", label: "CC BY-NC 4.0" },
      { value: "all-rights-reserved", label: "保留所有权利" },
    ], defaultValue: "cc-by-nc" },
    { key: "project_repo", label: "代码仓库", fieldType: "url", appliesTo: ["project"], sortOrder: 1 },
    { key: "project_status", label: "项目状态", fieldType: "select", appliesTo: ["project"], sortOrder: 2, options: [
      { value: "active", label: "维护中" },
      { value: "paused", label: "暂停" },
      { value: "archived", label: "已归档" },
    ], defaultValue: "active" },
  ];
  for (const field of fields) await api("POST", "/api/fields", field);
  log("fields", `内容模型就绪：${fields.length} 个自定义字段`);
}

async function ensureComments(contentBySlug) {
  const existing = await api("GET", "/api/comments?status=all&pageSize=50");
  if ((existing.data.items ?? []).length > 0) {
    log("comments", "评论已存在，跳过");
    skipped += 1;
    return;
  }
  const target = contentBySlug.get("why-rewrite-the-blog-again") ?? [...contentBySlug.values()].find((item) => item.type === "post");
  if (!target) {
    log("comments", "没有可用内容，跳过评论初始化");
    return;
  }
  const samples = [
    { name: "路过的读者", email: "reader@example.com", body: "第二版那个问题我也踩过，插件系统在 Serverless 里确实很难做动态加载。" },
    { name: "阿远", email: "ayuan@example.com", body: "先读参考项目再动手，这条建议应该贴在显示器上。" },
    { name: "小林", email: "lin@example.com", body: "请问主题是怎么换的？文档里没找到。" },
  ];

  // 访客评论走的是前台表单接口 POST /comment（application/x-www-form-urlencoded），
  // 不是后台的 JSON 接口 —— 用前台接口才能顺带验证限流、敏感词、审核默认值这些分支。
  let accepted = 0;
  for (const sample of samples) {
    const form = new URLSearchParams({
      contentId: target.id,
      parentId: "",
      name: sample.name,
      email: sample.email,
      url: "",
      body: sample.body,
      website: "",
    });
    try {
      const response = await fetch(`${BASE_URL}/comment`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) },
        body: form.toString(),
        redirect: "manual",
      });
      if (response.status === 303) accepted += 1;
      else log("comments", `提交被拒绝（HTTP ${response.status}）：${(await response.text()).slice(0, 160)}`);
    } catch (error) {
      log("comments", `提交失败（忽略）：${error.message}`);
    }
  }
  log("comments", `前台表单接口接受 ${accepted}/${samples.length} 条演示评论（默认进入待审核）`);
}

async function main() {
  log("start", `目标 ${BASE_URL}`);
  const health = await api("GET", "/api/health");
  log("start", `Worker 在线：environment=${health.data.environment}`);

  await bootstrapOwner();
  const termSlugMap = await ensureTerms();
  const contentBySlug = await ensureContents(termSlugMap);
  await ensureNav();
  await ensureFields();

  const summary = await api("GET", "/api/dashboard");
  const counts = summary.data.counts;
  log(
    "done",
    `内容 ${counts.contents}（已发布 ${counts.published}）· 分类标签 ${counts.terms} · 评论 ${counts.comments} · 媒体 ${counts.media} · 用户 ${counts.users}`,
  );
  log("done", `新建 ${created} 条，跳过 ${skipped} 条`);
  log("hint", `后台入口 ${BASE_URL}/admin ，账号 ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
}

main().catch((error) => {
  console.error("\n[seed] 失败：", error.message);
  if (error.payload) console.error(JSON.stringify(error.payload, null, 2).slice(0, 2000));
  process.exitCode = 1;
});
