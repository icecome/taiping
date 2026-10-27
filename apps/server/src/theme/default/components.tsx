/**
 * default 主题（纸墨）的可复用片段。
 *
 * 这里全部是同步函数：主题在 SSR 期间只做"字符串拼装"，不 await 任何东西
 * （契约要求 renderer 是同步的，数据由 site/data.ts 提前装载好）。
 */
import type { Child } from "hono/jsx";
import type { JSX as HonoJSX } from "hono/jsx/jsx-runtime";
import type {
  CommentNode,
  ContentDetail,
  ContentSummary,
  HomeView,
  PaginationView,
  PostView,
  TermSummary,
  ThemeContext,
} from "../types";
import {
  clampText,
  dateAttr,
  flag,
  groupNumber,
  longDate,
  shortDate,
  str,
  tagWeight,
} from "./settings";

/* ---------------------------------------------------------------- 元信息 */

function withReadingTime(ctx: ThemeContext): boolean {
  return flag(ctx, "showReadingTime", true);
}

/** 列表项下方的元信息行：日期 / 阅读时长 / 浏览 / 评论。 */
export function EntryMeta({
  post,
  ctx,
  showView = false,
}: {
  post: ContentSummary;
  ctx: ThemeContext;
  /** 是否展示浏览量：列表页通常不展示，详情页展示。 */
  showView?: boolean;
}) {
  const reading = withReadingTime(ctx);
  return (
    <ul class="entry-meta">
      {post.publishedAt ? (
        <li>
          <time datetime={dateAttr(post.publishedAt)}>{shortDate(post.publishedAt)}</time>
        </li>
      ) : (
        <li>未发布</li>
      )}
      {reading ? <li>{post.readingMinutes} 分钟</li> : null}
      {showView ? <li>{groupNumber(post.viewCount)} 次浏览</li> : null}
      {post.commentCount > 0 ? <li>{post.commentCount} 条评论</li> : null}
    </ul>
  );
}

/** 分类 + 标签胶囊行；分类在前，用不同底色区分。 */
export function TermChips({ post }: { post: ContentSummary }) {
  if (post.categories.length === 0 && post.tags.length === 0) return null;
  return (
    <ul class="chip-row">
      {post.categories.map((term) => (
        <li>
          <a class="chip chip-category" href={term.url}>
            {term.name}
          </a>
        </li>
      ))}
      {post.tags.map((term) => (
        <li>
          <a class="chip" href={term.url}>
            #{term.name}
          </a>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- 文章卡片 */

export function PostCard({ post, ctx }: { post: ContentSummary; ctx: ThemeContext }) {
  const hasCover = Boolean(post.coverUrl);
  return (
    <article class={`post-card${hasCover ? " has-cover" : ""}`}>
      <div class="post-card-main">
        <h2 class="post-card-title">
          {post.isPinned ? <span class="post-card-pin">置顶</span> : null}
          <a href={post.url}>{post.title || "无标题"}</a>
        </h2>
        {post.excerpt ? <p class="post-card-excerpt">{clampText(post.excerpt, 120)}</p> : null}
        <EntryMeta post={post} ctx={ctx} showView={false} />
        <TermChips post={post} />
      </div>
      {hasCover ? (
        // 封面是纯装饰：标题才是可访问的入口，所以这里不做成链接，
        // 也不进 tab 序列（避免同一目标出现两个可聚焦入口）。
        <span class="post-card-cover" aria-hidden="true">
          <img src={post.coverUrl ?? ""} alt="" loading="lazy" decoding="async" />
        </span>
      ) : null}
    </article>
  );
}

export function PostList({ posts, ctx }: { posts: ContentSummary[]; ctx: ThemeContext }) {
  if (posts.length === 0) {
    return <p class="empty-state">这里还没有内容。</p>;
  }
  return (
    <ul class="post-list">
      {posts.map((post) => (
        <li>
          <PostCard post={post} ctx={ctx} />
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- 分页 */

export function Pager({ pagination }: { pagination: PaginationView }) {
  const { totalPages, page, total } = pagination;
  if (total === 0) return null;
  if (totalPages <= 1) {
    return <p class="pager-total">共 {total} 篇</p>;
  }

  return (
    <nav class="pager" aria-label="分页导航">
      <div class="pager-jump">
        {pagination.prevUrl ? (
          <a href={pagination.prevUrl} rel="prev">
            上一页
          </a>
        ) : (
          <span class="is-disabled" aria-disabled="true">
            上一页
          </span>
        )}
        {pagination.nextUrl ? (
          <a href={pagination.nextUrl} rel="next">
            下一页
          </a>
        ) : (
          <span class="is-disabled" aria-disabled="true">
            下一页
          </span>
        )}
      </div>

      <ul class="pager-pages">
        {pagination.pages.map((item) =>
          // page=0 是契约里约定的省略号占位，不渲染成链接
          item.page === 0 ? (
            <li>
              <span class="pager-gap" aria-hidden="true">
                …
              </span>
            </li>
          ) : (
            <li>
              {item.page === page ? (
                <span aria-current="page">{item.page}</span>
              ) : (
                <a href={item.url} aria-label={`第 ${item.page} 页`}>
                  {item.page}
                </a>
              )}
            </li>
          ),
        )}
      </ul>

      <span class="text-soft">
        第 {page} / {totalPages} 页 · 共 {total} 篇
      </span>
    </nav>
  );
}

/* ---------------------------------------------------------------- 侧栏 */

function Widget({ title, children }: { title: string; children: Child }) {
  return (
    <section class="widget" aria-label={title}>
      <h2 class="widget-title">{title}</h2>
      {children}
    </section>
  );
}

export function Sidebar({ view, ctx }: { view: HomeView; ctx: ThemeContext }) {
  const maxTagCount = view.tags.reduce((max, tag) => Math.max(max, tag.count), 0);
  const recent = view.recentComments.slice(0, 5);
  const archives = view.archive.slice(0, 6);
  const categories = view.categories.slice(0, 8);
  const tags = view.tags.slice(0, 24);

  return (
    <aside class="sidebar" aria-label="站点侧栏">
      <Widget title="统计">
        <div class="widget-stats">
          <div class="widget-stat">
            <strong>{groupNumber(view.stats.posts)}</strong>
            <span>文章</span>
          </div>
          <div class="widget-stat">
            <strong>{groupNumber(view.stats.comments)}</strong>
            <span>评论</span>
          </div>
          <div class="widget-stat">
            <strong>{groupNumber(view.stats.categories)}</strong>
            <span>分类</span>
          </div>
          <div class="widget-stat">
            <strong>{groupNumber(view.stats.tags)}</strong>
            <span>标签</span>
          </div>
        </div>
      </Widget>

      {categories.length > 0 ? (
        <Widget title="分类">
          <ul class="widget-list">
            {categories.map((term) => (
              <li>
                <a href={term.url}>{term.name}</a>
                <span class="widget-count">{term.count}</span>
              </li>
            ))}
          </ul>
        </Widget>
      ) : null}

      {tags.length > 0 ? (
        <Widget title="标签">
          <div class="tag-cloud">
            {tags.map((term) => (
              <a class={`chip tag-w${tagWeight(term, maxTagCount)}`} href={term.url}>
                {term.name}
              </a>
            ))}
          </div>
        </Widget>
      ) : null}

      {recent.length > 0 ? (
        <Widget title="最新评论">
          {recent.map((comment) => (
            <div class="recent-comment">
              <div class="recent-comment-head">
                <span class="recent-comment-author">{comment.authorName}</span>
                <span class="recent-comment-date">{shortDate(comment.createdAt)}</span>
              </div>
              <p class="recent-comment-body">
                <a href={comment.url}>{clampText(comment.body, 48)}</a>
              </p>
            </div>
          ))}
        </Widget>
      ) : null}

      {archives.length > 0 ? (
        <Widget title="归档">
          <ul class="widget-list">
            {archives.map((item) => (
              <li>
                <a href={item.url}>{item.year} 年</a>
                <span class="widget-count">{item.count}</span>
              </li>
            ))}
          </ul>
        </Widget>
      ) : null}

      {ctx.identity.description ? (
        <Widget title="关于">
          <p class="text-soft">{ctx.identity.description}</p>
        </Widget>
      ) : null}
    </aside>
  );
}

/* ---------------------------------------------------------------- 目录 */

export function TableOfContents({
  headings,
  ctx,
}: {
  headings: { depth: number; text: string; id: string }[];
  ctx: ThemeContext;
}) {
  if (!flag(ctx, "showToc", true)) return null;
  // 只收二到四级：一级是文章标题本身，更深的层级在窄侧栏里会挤成一团。
  const items = headings.filter((heading) => heading.depth >= 2 && heading.depth <= 4);
  if (items.length < 2) return null;

  return (
    // 原生 <details> 折叠：JS 关闭也能开合，脚本不参与
    <details class="toc" open>
      <summary>目录</summary>
      <ul>
        {items.map((heading) => (
          <li class={`toc-depth-${heading.depth}`}>
            <a href={`#${heading.id}`}>{heading.text}</a>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ---------------------------------------------------------------- 正文 */

export function ContentBody({ content }: { content: ContentDetail }) {
  if (content.locked) {
    return (
      <div class="locked-notice">
        <p>这篇内容受密码保护，需要正确的密码才能阅读。</p>
      </div>
    );
  }

  return (
    /*
     * 正文 HTML 必须是原样插入：
     * 它由服务端 lib/markdown.ts 渲染（marked 已关闭原生 HTML 透传，脚本会被转义成文本），
     * 再跑过插件 filter，主题拿到的已经是可信 HTML；再转义一次会把 <p> 显示成字面量。
     * 主题是唯一允许使用 dangerouslySetInnerHTML 的地方，且只允许用于 view.content.html。
     */
    <div class="md-body" dangerouslySetInnerHTML={{ __html: content.html }} />
  );
}

/** 自定义字段（ContentSummary.fields）的回显表。 */
export function ContentFields({ content }: { content: ContentDetail }) {
  if (content.fields.length === 0) return null;
  return (
    <dl class="post-fields">
      {content.fields.map((field) => (
        <>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </>
      ))}
    </dl>
  );
}

/* ---------------------------------------------------------------- 评论 */

/**
 * 单条评论（递归渲染）。
 *
 * 递归深度由服务端保证：CommentNode.replies 已经按站点设置 commentMaxDepth 裁过，
 * 模板这边只管往下画，不再做深度判断——否则"到底几层"会有两个真值。
 */
function CommentItem({ node, ctx }: { node: CommentNode; ctx: ThemeContext }): HonoJSX.Element {
  const initial = (node.authorName || "?").slice(0, 1);
  return (
    <li class="comment-item">
      <div class="comment-head">
        {node.avatarUrl ? (
          <img class="comment-avatar" src={node.avatarUrl} alt="" aria-hidden="true" width={30} height={30} loading="lazy" />
        ) : (
          <span class="comment-avatar-fallback" aria-hidden="true">
            {initial}
          </span>
        )}
        {node.authorUrl ? (
          <a class="comment-author" href={node.authorUrl} target="_blank" rel="noopener noreferrer nofollow ugc">
            {node.authorName}
          </a>
        ) : (
          <span class="comment-author">{node.authorName}</span>
        )}
        {node.isOwner ? <span class="comment-owner">作者</span> : null}
        <time class="comment-date" datetime={dateAttr(node.createdAt)}>
          {shortDate(node.createdAt)}
        </time>
      </div>
      <p class="comment-body">{node.body}</p>
      {node.replies.length > 0 ? (
        <ul class="comment-list">
          {node.replies.map((reply) => (
            <CommentItem node={reply} ctx={ctx} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function CommentForm({ ctx, contentId }: { ctx: ThemeContext; contentId: string }) {
  // Turnstile 是可选能力：站点配了 site key 才渲染挂载点，否则表单就是普通 POST。
  const turnstileKey = str(ctx, "turnstileSiteKey", "");
  return (
    <form class="comment-form" method="post" action={`${ctx.basePath}/comment`}>
      <h3>发表评论</h3>

      <div class="form-grid">
        <p class="form-field">
          <label for="comment-name">昵称</label>
          <input id="comment-name" name="name" type="text" required maxlength={40} autocomplete="nickname" />
        </p>
        <p class="form-field">
          <label for="comment-email">邮箱</label>
          <input id="comment-email" name="email" type="email" required maxlength={120} autocomplete="email" />
          <span class="field-hint">不会公开，仅用于识别头像。</span>
        </p>
        <p class="form-field">
          <label for="comment-url">网站</label>
          <input id="comment-url" name="url" type="url" maxlength={200} autocomplete="url" placeholder="https://" />
        </p>
      </div>

      <p class="form-field">
        <label for="comment-body">评论内容</label>
        <textarea id="comment-body" name="body" rows={6} required maxlength={4000} placeholder="说点什么。" />
      </p>

      {/* 蜜罐：正常用户看不见，读屏也跳过；机器人往往会把可见性判断为"该填" */}
      <div class="hp-field" aria-hidden="true">
        <label for="comment-website">请勿填写</label>
        <input id="comment-website" name="website" type="text" tabindex={-1} autocomplete="off" />
      </div>

      <input type="hidden" name="contentId" value={contentId} />
      {/* 根级评论 parentId 为空串；服务端按空值处理为顶级评论 */}
      <input type="hidden" name="parentId" value="" />

      {turnstileKey ? <div class="turnstile-slot cf-turnstile" data-sitekey={turnstileKey} /> : null}

      <div class="form-actions">
        <button type="submit" class="btn-primary">
          发表评论
        </button>
        <span class="field-hint">提交后可能需要等待审核。</span>
      </div>
    </form>
  );
}

export function Comments({ view, ctx }: { view: PostView; ctx: ThemeContext }) {
  return (
    <section class="comments" id="comments" aria-label="评论区">
      <h2 class="comments-title">
        评论
        <span>{groupNumber(view.commentCount)}</span>
      </h2>

      {view.notice ? (
        <p class="notice" role="status">
          {view.notice}
        </p>
      ) : null}

      {view.comments.length > 0 ? (
        <ul class="comment-list">
          {view.comments.map((node) => (
            <CommentItem node={node} ctx={ctx} />
          ))}
        </ul>
      ) : (
        <p class="text-soft">还没有评论。</p>
      )}

      {view.commentsOpen ? (
        <CommentForm ctx={ctx} contentId={view.content.id} />
      ) : (
        <p class="comments-closed">评论已关闭。</p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- 杂项 */

/** 分类 / 标签页顶部的术语导航（子分类、兄弟分类）。 */
export function TermLinks({ title, terms }: { title: string; terms: TermSummary[] }) {
  if (terms.length === 0) return null;
  return (
    <div class="term-nav-group">
      <span class="term-nav-title">{title}</span>
      <ul class="chip-row">
        {terms.map((term) => (
          <li>
            <a class="chip" href={term.url}>
              {term.name}
              <span class="widget-count"> {term.count}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 纯文本时间线的日期数字（归档页用 10-26 这种短格式）。 */
export function monthDay(value: string | null): string {
  const day = shortDate(value);
  return day ? day.slice(5) : "";
}

/** 页面头部（标题 + 描述），归档 / 术语 / 搜索页共用。 */
export function PageHead({ title, description }: { title: string; description: string }) {
  return (
    <header class="tp-page-head">
      <h1>{title}</h1>
      {description ? <p class="tp-page-desc">{description}</p> : null}
    </header>
  );
}

/** 正文页头部的完整时间展示（含更新时间）。 */
export function PostTimeLine({ content, ctx }: { content: ContentDetail; ctx: ThemeContext }) {
  const reading = withReadingTime(ctx);
  const updated = shortDate(content.updatedAt);
  const published = shortDate(content.publishedAt);
  const showUpdate = Boolean(updated && published && updated !== published);
  return (
    <ul class="post-byline">
      {content.author ? (
        <li>
          作者 <strong>{content.author.name}</strong>
        </li>
      ) : null}
      {content.publishedAt ? (
        <li>
          发表于 <time datetime={dateAttr(content.publishedAt)}>{longDate(content.publishedAt)}</time>
        </li>
      ) : null}
      {showUpdate ? (
        <li>
          更新于 <time datetime={dateAttr(content.updatedAt)}>{longDate(content.updatedAt)}</time>
        </li>
      ) : null}
      {reading ? <li>{content.readingMinutes} 分钟阅读</li> : null}
      {reading ? <li>{groupNumber(content.wordCount)} 字</li> : null}
      <li>{groupNumber(content.viewCount)} 次浏览</li>
    </ul>
  );
}
