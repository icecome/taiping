/**
 * default 主题（纸墨）的页面渲染器。
 *
 * 每个函数对应 ThemeRenderers 里的一个方法，签名严格对齐 types.ts：
 * 只吃 (ctx, view)，只吐 JSX，同步、无副作用、不碰 db/env。
 * 页面 meta（title/canonical/og）由上层组装后经 layout 输出，主题不重复决定。
 */
import type { Child } from "hono/jsx";
import type {
  ArchiveView,
  ContentSummary,
  ErrorView,
  HomeView,
  MomentView,
  PageView,
  PostView,
  ProjectView,
  SearchView,
  TermView,
  ThemeContext,
} from "../types";
import {
  Comments,
  ContentBody,
  ContentFields,
  EntryMeta,
  monthDay,
  PageHead,
  Pager,
  PostList,
  PostTimeLine,
  Sidebar,
  TableOfContents,
  TermChips,
  TermLinks,
} from "./components";
import { clampText, flag, groupNumber, isoYear, shortDate, str } from "./settings";

/* ---------------------------------------------------------------- 首页 */

export function renderHome(ctx: ThemeContext, view: HomeView): Child {
  const heroTitle = str(ctx, "heroTitle", "") || ctx.identity.title;
  const heroSubtitle = str(ctx, "heroSubtitle", "") || ctx.identity.description;
  const showSidebar = flag(ctx, "showSidebar", true);

  return (
    <>
      <section class="hero">
        <h1>{heroTitle}</h1>
        {heroSubtitle ? <p>{heroSubtitle}</p> : null}
        <ul class="hero-stats">
          <li>
            <strong>{groupNumber(view.stats.posts)}</strong> 篇文章
          </li>
          <li>
            <strong>{groupNumber(view.stats.comments)}</strong> 条评论
          </li>
          <li>
            <strong>{groupNumber(view.stats.categories)}</strong> 个分类
          </li>
          <li>
            <strong>{groupNumber(view.stats.tags)}</strong> 个标签
          </li>
        </ul>
      </section>

      <div class={`tp-layout${showSidebar ? "" : " tp-layout-no-sidebar"}`}>
        <div>
          {view.pinned.length > 0 ? (
            <section class="pinned-zone" aria-label="置顶文章">
              <p class="section-label">置顶</p>
              <PostList posts={view.pinned} ctx={ctx} />
            </section>
          ) : null}

          <p class="section-label">最新</p>
          <PostList posts={view.posts} ctx={ctx} />
          <Pager pagination={view.pagination} />
        </div>

        {showSidebar ? <Sidebar view={view} ctx={ctx} /> : null}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- 归档 */

function groupByYear(posts: ContentSummary[]): { year: string; posts: ContentSummary[] }[] {
  const groups: { year: string; posts: ContentSummary[] }[] = [];
  for (const post of posts) {
    const year = isoYear(post.publishedAt) || "未标注";
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.posts.push(post);
    else groups.push({ year, posts: [post] });
  }
  return groups;
}

export function renderArchive(ctx: ThemeContext, view: ArchiveView): Child {
  const groups = groupByYear(view.posts);

  return (
    <>
      <PageHead title={view.title || "归档"} description={view.description} />

      {groups.length === 0 ? (
        <p class="empty-state">还没有可归档的内容。</p>
      ) : (
        <ul class="timeline">
          {groups.map((group) => (
            <li class="timeline-year">
              <div class="timeline-year-head">
                <h2>{group.year}</h2>
                <span>{group.posts.length} 篇</span>
              </div>
              <ul class="timeline-items">
                {group.posts.map((post) => (
                  <li>
                    <span class="timeline-date">{monthDay(post.publishedAt)}</span>
                    <a class="timeline-link" href={post.url}>
                      {post.title || "无标题"}
                    </a>
                    {post.commentCount > 0 ? <span class="timeline-comments">{post.commentCount} 评</span> : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <Pager pagination={view.pagination} />
    </>
  );
}

/* ---------------------------------------------------------------- 分类 / 标签 */

export function renderTerm(ctx: ThemeContext, view: TermView): Child {
  const kind = view.term.type === "category" ? "分类" : "标签";

  return (
    <>
      <header class="term-header">
        <span class="term-kind">{kind}</span>
        <h1 class="term-name">{view.term.name}</h1>
        {view.term.description ? <p class="term-desc">{view.term.description}</p> : null}
        <p class="term-desc">{view.term.count} 篇内容</p>
        {view.children.length > 0 || view.siblings.length > 0 ? (
          <div class="term-nav">
            <TermLinks title="子分类" terms={view.children} />
            <TermLinks title="同类" terms={view.siblings} />
          </div>
        ) : null}
      </header>

      <PostList posts={view.posts} ctx={ctx} />
      <Pager pagination={view.pagination} />
    </>
  );
}

/* ---------------------------------------------------------------- 文章 */

export function renderPost(ctx: ThemeContext, view: PostView): Child {
  const { content } = view;
  const hasAside = flag(ctx, "showToc", true) && content.headings.length > 0;

  return (
    <>
      <article class="post">
        <header class="post-header">
          <h1 class="post-title">{content.title || "无标题"}</h1>
          <PostTimeLine content={content} ctx={ctx} />
          <TermChips post={content} />
          {content.coverUrl ? (
            <figure class="post-cover">
              <img src={content.coverUrl} alt={content.title || ""} loading="eager" decoding="async" />
            </figure>
          ) : null}
        </header>

        <div class={`post-layout${hasAside ? "" : " tp-layout-no-sidebar"}`}>
          <div>
            <ContentBody content={content} />
            <ContentFields content={content} />

            {content.prev || content.next ? (
              <ul class="post-nav">
                {content.prev ? (
                  <li>
                    <a href={content.prev.url} rel="prev">
                      <span class="post-nav-hint">上一篇</span>
                      <span class="post-nav-title">{content.prev.title}</span>
                    </a>
                  </li>
                ) : null}
                {content.next ? (
                  <li>
                    <a href={content.next.url} rel="next">
                      <span class="post-nav-hint">下一篇</span>
                      <span class="post-nav-title">{content.next.title}</span>
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : null}

            {content.related.length > 0 ? (
              <section class="related" aria-label="相关文章">
                <p class="section-label">相关</p>
                <ul class="related-list">
                  {content.related.map((item) => (
                    <li>
                      <a href={item.url}>{item.title || "无标题"}</a>
                      <time datetime={item.publishedAt ?? undefined}>{shortDate(item.publishedAt)}</time>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {hasAside ? (
            <aside class="post-aside">
              <TableOfContents headings={content.headings} ctx={ctx} />
            </aside>
          ) : null}
        </div>
      </article>

      <Comments view={view} ctx={ctx} />
    </>
  );
}

/* ---------------------------------------------------------------- 独立页面 */

export function renderPage(ctx: ThemeContext, view: PageView): Child {
  return (
    <>
      <article class="post">
        <header class="post-header">
          <h1 class="post-title">{view.content.title || "无标题"}</h1>
          <EntryMeta post={view.content} ctx={ctx} showView={false} />
        </header>
        <ContentBody content={view.content} />
        <ContentFields content={view.content} />
      </article>

      {view.children.length > 0 ? (
        <section class="related" aria-label="子页面">
          <p class="section-label">子页面</p>
          <ul class="related-list">
            {view.children.map((child) => (
              <li>
                <a href={child.url}>{child.title}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- 瞬间 */

export function renderMoments(ctx: ThemeContext, view: MomentView): Child {
  return (
    <>
      <PageHead title="瞬间" description="短内容与碎片记录，按时间倒序。" />

      {view.moments.length === 0 ? (
        <p class="empty-state">还没有记录。</p>
      ) : (
        <ul class="moment-list">
          {view.moments.map((moment) => (
            <li class="moment-card">
              <div class="moment-card-head">
                {/* 没有标题时用时间当标题，避免出现一行空白 */}
                <h2>
                  <a href={moment.url}>{moment.title || shortDate(moment.publishedAt)}</a>
                </h2>
                <time datetime={moment.publishedAt ?? undefined}>{shortDate(moment.publishedAt)}</time>
              </div>
              <p class="moment-body">{clampText(moment.excerpt, 160)}</p>
              <div class="moment-foot">
                <TermChips post={moment} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager pagination={view.pagination} />
    </>
  );
}

/* ---------------------------------------------------------------- 项目 */

export function renderProjects(ctx: ThemeContext, view: ProjectView): Child {
  return (
    <>
      <PageHead title="项目" description="做过的东西，按最近更新排序。" />

      {view.projects.length === 0 ? (
        <p class="empty-state">还没有项目。</p>
      ) : (
        <ul class="project-grid">
          {view.projects.map((project) => (
            <li class="project-card">
              {project.coverUrl ? (
                <span class="project-cover">
                  <img src={project.coverUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" />
                </span>
              ) : null}
              <div class="project-body">
                <h2 class="project-title">
                  <a href={project.url}>{project.title || "无标题"}</a>
                </h2>
                <p class="project-excerpt">{clampText(project.excerpt, 90)}</p>
              </div>
              {project.tags.length > 0 ? (
                <div class="project-foot">
                  {project.tags.slice(0, 3).map((tag) => (
                    <a class="chip" href={tag.url}>
                      {tag.name}
                    </a>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Pager pagination={view.pagination} />
    </>
  );
}

/* ---------------------------------------------------------------- 搜索 */

export function renderSearch(ctx: ThemeContext, view: SearchView): Child {
  return (
    <>
      <PageHead title="搜索" description="在当前站点范围内检索标题与正文。" />

      {/* GET 表单：不依赖 JS，提交后 URL 上带 q，可直接分享与收藏 */}
      <form class="search-form" method="get" action={`${ctx.basePath}/search`} role="search">
        <p class="form-field">
          <label for="search-q">关键词</label>
          <input
            id="search-q"
            name="q"
            type="search"
            value={view.query}
            placeholder="输入关键词后回车"
            autocomplete="off"
          />
        </p>
        <button type="submit" class="btn-primary">
          搜索
        </button>
      </form>

      {view.query ? (
        <p class="search-summary" role="status">
          找到 <strong>{groupNumber(view.total)}</strong> 条与「{view.query}」相关的结果，用时 {view.tookMs} 毫秒。
        </p>
      ) : null}

      {view.query && view.results.length === 0 ? (
        <p class="empty-state">没有匹配的内容。换个更短的关键词试试。</p>
      ) : null}

      <div>
        {view.results.map((result) => (
          <article class="search-result">
            <h2>
              <a href={result.url}>{result.title || "无标题"}</a>
            </h2>
            {result.excerpt ? <p>{clampText(result.excerpt, 150)}</p> : null}
            <EntryMeta post={result} ctx={ctx} showView={false} />
          </article>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- 错误 */

export function renderError(ctx: ThemeContext, view: ErrorView): Child {
  return (
    <div class="error-page">
      <p class="error-code">{view.status}</p>
      <h1 class="error-title">{view.title || "出错了"}</h1>
      <p class="error-message">{view.message || "这个页面暂时打不开。"}</p>
      <p>
        <a class="btn-primary" href={`${ctx.basePath}/`}>
          返回首页
        </a>
      </p>
    </div>
  );
}
