(function () {
  const viewLabels = {
    dashboard: "仪表盘",
    posts: "文章",
    editor: "撰写",
    pages: "页面",
    moments: "说说",
    messages: "留言",
    taxonomies: "分类 / 标签",
    theme: "主题设置",
    settings: "站点设置",
  };

  const statusMeta = {
    pending: { label: "待审", badge: "warn" },
    approved: { label: "通过", badge: "ok" },
    featured: { label: "精选", badge: "featured" },
    spam: { label: "垃圾", badge: "spam" },
    draft: { label: "草稿", badge: "warn" },
    published: { label: "已发布", badge: "ok" },
    private: { label: "私密", badge: "" },
  };

  const posts = [
    {
      id: 1,
      title: "在 Workers 上写一个轻量博客",
      slug: "lightweight-blog-on-workers",
      status: "published",
      updated: "2 小时前",
      category: "架构笔记",
      tags: ["Workers", "博客", "架构"],
    },
    {
      id: 2,
      title: "拙素主题的纸书气质从哪里来",
      slug: "zhuosu-paper-style",
      status: "published",
      updated: "昨天",
      category: "设计随笔",
      tags: ["主题", "排版", "拙素"],
    },
    {
      id: 3,
      title: "Markdown 写作流：从草稿到发布",
      slug: "markdown-writing-flow",
      status: "draft",
      updated: "3 天前",
      category: "写作方法",
      tags: ["Markdown", "工作流"],
    },
    {
      id: 4,
      title: "Typecho 与 Halo 的取舍笔记",
      slug: "typecho-halo-notes",
      status: "published",
      updated: "上周",
      category: "架构笔记",
      tags: ["Typecho", "Halo", "选型"],
    },
    {
      id: 5,
      title: "留言系统兼容层设计",
      slug: "comment-compat-layer",
      status: "published",
      updated: "2 周前",
      category: "架构笔记",
      tags: ["评论", "兼容"],
    },
    {
      id: 6,
      title: "春日书单：五本慢慢读的书",
      slug: "spring-reading-list",
      status: "published",
      updated: "3 周前",
      category: "读书札记",
      tags: ["读书", "清单"],
    },
    {
      id: 7,
      title: "关于站点命名「太平」",
      slug: "about-taiping",
      status: "private",
      updated: "1 个月前",
      category: "设计随笔",
      tags: ["品牌"],
    },
    {
      id: 8,
      title: "从旧站迁移：链接与附件",
      slug: "migration-links-assets",
      status: "draft",
      updated: "1 个月前",
      category: "运维记录",
      tags: ["迁移", "D1"],
    },
  ];

  const pages = [
    { id: 11, title: "关于", slug: "about", status: "published", updated: "上周" },
    { id: 12, title: "友情链接", slug: "friends", status: "published", updated: "2 周前" },
    { id: 13, title: "归档", slug: "archives", status: "published", updated: "1 个月前" },
    { id: 14, title: "使用许可", slug: "license", status: "draft", updated: "昨天" },
  ];

  const moments = [
    {
      id: "m1",
      date: "03-12",
      text: "把控制台的深色侧栏换成纸色之后，写作的心情都不一样了。",
      meta: ["说说", "12 赞"],
      tags: ["设计", "控制台"],
    },
    {
      id: "m2",
      date: "03-09",
      text: "今天只改了间距，没有加功能。克制，也是一种进度。",
      meta: ["说说", "8 赞"],
      tags: ["随笔", "设计"],
    },
    {
      id: "m3",
      date: "03-05",
      text: "读到一句：轻量不是功能少，而是每一步都刚好够用。",
      meta: ["摘录", "21 赞"],
      tags: ["摘录", "架构"],
    },
    {
      id: "m4",
      date: "03-01",
      text: "拙素主题的纸感背景上线了，阅读时长似乎真的变长了一点。",
      meta: ["说说", "15 赞"],
      tags: ["主题", "阅读"],
    },
    {
      id: "m5",
      date: "02-26",
      text: "D1 备份脚本跑通，下次迁移应该会轻松很多。",
      meta: ["说说", "6 赞"],
      tags: ["运维", "D1"],
    },
    {
      id: "m6",
      date: "02-20",
      text: "周末读完《美的历程》第三章，适合配上一壶茶。",
      meta: ["摘录", "18 赞"],
      tags: ["读书", "摘录"],
    },
  ];

  let messages = [
    {
      id: 1,
      author: "林晚舟",
      email: "wanzhou@example.com",
      status: "pending",
      time: "10 分钟前",
      onPost: "在 Workers 上写一个轻量博客",
      content: "文章里的架构图很清楚，想请教一下 D1 与 KV 的分工边界，方便再展开写一篇吗？",
      replies: [],
    },
    {
      id: 2,
      author: "陈砚",
      email: "chenyan@example.com",
      status: "approved",
      time: "2 小时前",
      onPost: "拙素主题的纸书气质从哪里来",
      content: "拙素主题的字距和行距看着很舒服，纸感背景也不抢戏。",
      replies: [
        {
          from: "沈观澜",
          time: "1 小时前",
          content: "谢谢！后续会补一篇排版参数的说明。",
          mine: true,
        },
      ],
    },
    {
      id: 3,
      author: "苏晚晴",
      email: "suwanqing@example.com",
      status: "featured",
      time: "昨天",
      onPost: "Typecho 与 Halo 的取舍笔记",
      content: "这篇选型笔记很实在，尤其是对插件边界的讨论，收藏了。",
      replies: [],
    },
    {
      id: 4,
      author: "匿名访客",
      email: "guest@example.com",
      status: "approved",
      time: "昨天",
      onPost: "留言系统兼容层设计",
      content: "从旧站迁移过来的内容链接都正常，感谢兼容 blog-comment。",
      replies: [],
    },
    {
      id: 5,
      author: "广告机器人",
      email: "spam@example.com",
      status: "spam",
      time: "2 天前",
      onPost: "Markdown 写作流：从草稿到发布",
      content: "Buy cheap backlinks now, limited offer...",
      replies: [],
    },
    {
      id: 6,
      author: "周迟",
      email: "zhouchi@example.com",
      status: "pending",
      time: "2 天前",
      onPost: "春日书单：五本慢慢读的书",
      content: "书单里第二本我也很喜欢，有类似的随笔集推荐吗？",
      replies: [],
    },
    {
      id: 7,
      author: "何清让",
      email: "heqingrang@example.com",
      status: "pending",
      time: "3 天前",
      onPost: "从旧站迁移：链接与附件",
      content: "迁移时图片路径是怎么处理的？R2 公开访问有做缓存头吗？",
      replies: [],
    },
    {
      id: 8,
      author: "顾南枝",
      email: "gunanzhi@example.com",
      status: "featured",
      time: "上周",
      onPost: "在 Workers 上写一个轻量博客",
      content: "读完立刻去搭了一个实验项目，Workers + D1 的组合确实省心。",
      replies: [
        {
          from: "沈观澜",
          time: "上周",
          content: "很高兴对你有用，欢迎交流踩坑记录。",
          mine: true,
        },
      ],
    },
  ];

  let categories = [
    { id: "c1", name: "架构笔记", postIds: [1, 4, 5] },
    { id: "c2", name: "设计随笔", postIds: [2, 7] },
    { id: "c3", name: "写作方法", postIds: [3] },
    { id: "c4", name: "读书札记", postIds: [6] },
    { id: "c5", name: "运维记录", postIds: [8] },
  ];

  let tags = [
    { id: "t1", name: "Workers", postIds: [1] },
    { id: "t2", name: "博客", postIds: [1] },
    { id: "t3", name: "架构", postIds: [1, 4] },
    { id: "t4", name: "主题", postIds: [2] },
    { id: "t5", name: "排版", postIds: [2] },
    { id: "t6", name: "Markdown", postIds: [3] },
    { id: "t7", name: "读书", postIds: [6] },
    { id: "t8", name: "迁移", postIds: [8] },
  ];

  const navItems = Array.from(document.querySelectorAll(".nav-item[data-view]"));
  const panels = Array.from(document.querySelectorAll("[data-view-panel]"));
  const crumbsCurrent = document.querySelector(".crumb-current");
  const palette = document.getElementById("palette");
  const paletteInput = document.getElementById("palette-input");
  const openPaletteBtn = document.getElementById("open-palette");

  let messageFilter = "all";
  let activeMessageId = null;
  let taxoSelection = null;
  let uid = 100;
  let lastFocusEl = null;
  let toastTimer = 0;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function announce(message) {
    const live = document.getElementById("live-region");
    if (live) live.textContent = message;
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-on");
    announce(message);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-on");
    }, 2200);
  }

  function confirmAction(message) {
    return window.confirm(message);
  }

  function statusBadge(status) {
    const meta = statusMeta[status] || { label: status, badge: "" };
    return `<span class="badge ${meta.badge}">${meta.label}</span>`;
  }

  function setView(name) {
    if (!viewLabels[name]) return;

    navItems.forEach((item) => {
      item.classList.toggle("is-active", item.dataset.view === name);
    });

    panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.viewPanel === name);
    });

    if (crumbsCurrent) {
      crumbsCurrent.textContent = viewLabels[name];
    }

    closePalette();
    closeDrawer();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderDashboard() {
    const recent = posts.slice(0, 4);
    const recentHost = document.getElementById("dash-recent-posts");
    if (recentHost) {
      recentHost.innerHTML = recent
        .map(
          (p) => `
        <li>
          <button class="doc-title" type="button" data-view="editor">${escapeHtml(p.title)}</button>
          <div class="doc-meta">
            ${statusBadge(p.status)}
            <span>${escapeHtml(p.updated)}</span>
            <span class="dot" aria-hidden="true"></span>
            <span>${escapeHtml(p.category)}</span>
          </div>
        </li>`
        )
        .join("");
    }

    const msgHost = document.getElementById("dash-messages");
    if (msgHost) {
      msgHost.innerHTML = messages
        .slice(0, 3)
        .map(
          (m) => `
        <li class="message-item" data-message-id="${m.id}" tabindex="0" role="button">
          <div class="message-head">
            <strong>${escapeHtml(m.author)}</strong>
            ${statusBadge(m.status)}
            <time>${escapeHtml(m.time)}</time>
          </div>
          <p>${escapeHtml(m.content)}</p>
        </li>`
        )
        .join("");
    }
  }

  function renderPosts() {
    const keyword = (document.getElementById("post-search")?.value || "").trim().toLowerCase();
    const status = document.getElementById("post-status-filter")?.value || "";
    const filtered = posts.filter((p) => {
      const okStatus = !status || p.status === status;
      const okKey =
        !keyword ||
        p.title.toLowerCase().includes(keyword) ||
        p.slug.toLowerCase().includes(keyword);
      return okStatus && okKey;
    });

    const count = document.getElementById("post-count");
    if (count) count.textContent = `共 ${filtered.length} 篇`;

    const host = document.getElementById("post-rows");
    if (!host) return;

    if (!filtered.length) {
      host.innerHTML = `<li class="assoc-empty">没有匹配的文章</li>`;
      return;
    }

    host.innerHTML = filtered
      .map(
        (p) => `
      <li class="post-row">
        <div class="post-main">
          <button class="post-title" type="button" data-view="editor">${escapeHtml(p.title)}</button>
          <div class="post-meta">
            ${statusBadge(p.status)}
            <span>/posts/${escapeHtml(p.slug)}</span>
            <span class="dot" aria-hidden="true"></span>
            <span>${escapeHtml(p.category)}</span>
            <span class="dot" aria-hidden="true"></span>
            <span>${escapeHtml(p.tags.join(" · "))}</span>
            <span class="dot" aria-hidden="true"></span>
            <span>更新于 ${escapeHtml(p.updated)}</span>
          </div>
        </div>
        <div class="post-actions">
          <button class="btn ghost sm" type="button" data-view="editor">编辑</button>
          <button class="btn ghost sm danger-text" type="button" data-delete-kind="post" data-delete-id="${p.id}">删除</button>
        </div>
      </li>`
      )
      .join("");
  }

  function renderPages() {
    const host = document.getElementById("page-rows");
    if (!host) return;
    host.innerHTML = pages
      .map(
        (p) => `
      <li class="post-row">
        <div class="post-main">
          <button class="post-title" type="button">${escapeHtml(p.title)}</button>
          <div class="post-meta">
            ${statusBadge(p.status)}
            <span>/${escapeHtml(p.slug)}</span>
            <span class="dot" aria-hidden="true"></span>
            <span>更新于 ${escapeHtml(p.updated)}</span>
          </div>
        </div>
        <div class="post-actions">
          <button class="btn ghost sm" type="button">编辑</button>
          <button class="btn ghost sm danger-text" type="button" data-delete-kind="page" data-delete-id="${p.id}">删除</button>
        </div>
      </li>`
      )
      .join("");
  }

  function renderMoments() {
    const host = document.getElementById("moment-list");
    const total = document.getElementById("moment-total");
    if (total) total.textContent = `共 ${moments.length} 条`;
    if (!host) return;
    host.innerHTML = moments
      .map(
        (m) => `
      <li class="moment-item">
        <div class="moment-date">${escapeHtml(m.date)}</div>
        <div class="moment-main">
          <div class="moment-body">${escapeHtml(m.text)}</div>
          <div class="moment-meta">
            ${m.meta.map((x) => `<span>${escapeHtml(x)}</span>`).join('<span class="dot" aria-hidden="true"></span>')}
            ${(m.tags || []).map((t) => `<button class="tag-chip" type="button" data-moment-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join("")}
            <span class="moment-actions">
              <button class="btn ghost sm danger-text" type="button" data-delete-kind="moment" data-delete-id="${escapeHtml(m.id)}">删除</button>
            </span>
          </div>
        </div>
      </li>`
      )
      .join("");
  }

  function renderHeatmap() {
    const host = document.getElementById("heatmap");
    const monthLabel = document.getElementById("heatmap-month-label");
    if (!host) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    if (monthLabel) {
      monthLabel.textContent = `${year}年${month + 1}月`;
    }

    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // JS: 0=Sun ... 6=Sat; convert to Monday-first index
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells = [];
    for (let i = 0; i < startOffset; i += 1) {
      cells.push(`<span class="calendar-day is-empty" aria-hidden="true"></span>`);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const seed = (day * 13 + month * 7 + year) % 10;
      const level = day > today ? 0 : seed < 2 ? 0 : seed < 4 ? 1 : seed < 6 ? 2 : seed < 8 ? 3 : 4;
      const isToday = day === today;
      cells.push(
        `<span class="calendar-day${isToday ? " is-today" : ""}" data-level="${level}" title="${month + 1}月${day}日">${day}</span>`
      );
    }

    const remainder = (7 - ((startOffset + daysInMonth) % 7)) % 7;
    for (let i = 0; i < remainder; i += 1) {
      cells.push(`<span class="calendar-day is-empty" aria-hidden="true"></span>`);
    }

    host.innerHTML = cells.join("");
  }

  function renderMomentTagCloud() {
    const host = document.getElementById("moment-tag-cloud");
    if (!host) return;

    const counts = new Map();
    moments.forEach((m) => {
      (m.tags || []).forEach((tag) => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });

    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      host.innerHTML = `<div class="assoc-empty">暂无标签</div>`;
      return;
    }

    const max = entries[0][1] || 1;
    host.innerHTML = entries
      .map(([name, count]) => {
        const size = 12 + Math.round((count / max) * 6);
        return `<span class="tag-cloud-item" style="font-size:${size}px">#${escapeHtml(name)}<small>${count}</small></span>`;
      })
      .join("");
  }

  function deleteContent(kind, id) {
    const label =
      kind === "post" ? "这篇文章" : kind === "page" ? "这个页面" : "这条说说";
    if (!confirmAction(`确定删除${label}？`)) return;

    if (kind === "post") {
      const index = posts.findIndex((p) => p.id === id);
      if (index >= 0) posts.splice(index, 1);
      categories.forEach((c) => {
        c.postIds = c.postIds.filter((pid) => pid !== id);
      });
      tags.forEach((t) => {
        t.postIds = t.postIds.filter((pid) => pid !== id);
      });
      renderPosts();
      renderDashboard();
      renderTaxonomies();
      showToast("文章已删除");
      return;
    }

    if (kind === "page") {
      const index = pages.findIndex((p) => p.id === id);
      if (index >= 0) pages.splice(index, 1);
      renderPages();
      showToast("页面已删除");
      return;
    }

    if (kind === "moment") {
      const index = moments.findIndex((m) => m.id === String(id));
      if (index >= 0) moments.splice(index, 1);
      renderMoments();
      renderMomentTagCloud();
      showToast("说说已删除");
    }
  }

  function renderMessages() {
    const filtered =
      messageFilter === "all" ? messages : messages.filter((m) => m.status === messageFilter);

    const count = document.getElementById("message-count");
    if (count) count.textContent = `共 ${filtered.length} 条`;

    const pending = messages.filter((m) => m.status === "pending").length;
    const badge = document.getElementById("nav-msg-badge");
    if (badge) {
      badge.textContent = String(pending);
      badge.hidden = pending === 0;
    }

    const host = document.getElementById("message-list");
    if (!host) return;

    if (!filtered.length) {
      host.innerHTML = `<li class="assoc-empty">当前筛选下暂无留言</li>`;
      return;
    }

    host.innerHTML = filtered
      .map(
        (m) => `
      <li class="message-item" data-message-id="${m.id}" tabindex="0" role="button">
        <div class="message-head">
          <strong>${escapeHtml(m.author)}</strong>
          ${statusBadge(m.status)}
          <time>${escapeHtml(m.time)}</time>
          <span class="message-from">来自《${escapeHtml(m.onPost)}》</span>
        </div>
        <p>${escapeHtml(m.content)}</p>
      </li>`
      )
      .join("");
  }

  function openDrawer(messageId) {
    const message = messages.find((m) => m.id === messageId);
    const drawer = document.getElementById("message-drawer");
    if (!message || !drawer) return;

    lastFocusEl = document.activeElement;
    activeMessageId = messageId;
    drawer.hidden = false;
    document.body.style.overflow = "hidden";

    const author = document.getElementById("drawer-author");
    const time = document.getElementById("drawer-time");
    const avatar = document.getElementById("drawer-avatar");
    const title = document.getElementById("drawer-title");

    if (author) author.textContent = message.author;
    if (time) time.textContent = `${message.time} · ${message.onPost}`;
    if (avatar) avatar.textContent = message.author.slice(0, 1);
    if (title) title.textContent = message.author;

    document.querySelectorAll("#drawer-status-row .status-chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.status === message.status);
    });

    renderThread(message);

    const closeBtn = drawer.querySelector("[data-close-drawer].icon-btn");
    if (closeBtn) closeBtn.focus();
    announce(`已打开 ${message.author} 的留言对话`);
  }

  function renderThread(message) {
    const host = document.getElementById("drawer-thread");
    if (!host) return;

    const items = [
      {
        from: message.author,
        time: message.time,
        content: message.content,
        mine: false,
      },
      ...message.replies,
    ];

    host.innerHTML = items
      .map(
        (item) => `
      <div class="bubble ${item.mine ? "is-me" : ""}">
        <div class="bubble-meta">
          <span>${escapeHtml(item.from)}</span>
          <span>${escapeHtml(item.time)}</span>
        </div>
        <div>${escapeHtml(item.content)}</div>
      </div>`
      )
      .join("");
  }

  function closeDrawer() {
    const drawer = document.getElementById("message-drawer");
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    document.body.style.overflow = "";
    activeMessageId = null;
    const input = document.getElementById("reply-input");
    if (input) input.value = "";
    if (lastFocusEl && typeof lastFocusEl.focus === "function") {
      lastFocusEl.focus();
    }
    lastFocusEl = null;
  }

  function setMessageStatus(status) {
    if (activeMessageId == null) return;
    const message = messages.find((m) => m.id === activeMessageId);
    if (!message) return;
    message.status = status;
    document.querySelectorAll("#drawer-status-row .status-chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.status === status);
    });
    renderMessages();
    renderDashboard();
    const label = (statusMeta[status] && statusMeta[status].label) || status;
    showToast(`留言状态已更新为「${label}」`);
  }

  function renderTaxonomies() {
    const catHost = document.getElementById("category-list");
    const tagHost = document.getElementById("tag-list");

    if (catHost) {
      catHost.innerHTML = categories
        .map((c) => {
          const active =
            taxoSelection && taxoSelection.type === "category" && taxoSelection.id === c.id;
          return `
          <li class="taxo-item ${active ? "is-active" : ""}">
            <button class="taxo-main" type="button" data-taxo-type="category" data-taxo-id="${c.id}">
              <span class="taxo-name">${escapeHtml(c.name)}</span>
              <span class="taxo-count">${c.postIds.length} 篇文章</span>
            </button>
            <div class="taxo-actions">
              <button class="btn ghost sm danger-text" type="button" data-taxo-delete="category" data-taxo-id="${c.id}">删除</button>
            </div>
          </li>`;
        })
        .join("");
    }

    if (tagHost) {
      tagHost.innerHTML = tags
        .map((t) => {
          const active = taxoSelection && taxoSelection.type === "tag" && taxoSelection.id === t.id;
          return `
          <li class="taxo-item ${active ? "is-active" : ""}">
            <button class="taxo-main" type="button" data-taxo-type="tag" data-taxo-id="${t.id}">
              <span class="taxo-name">${escapeHtml(t.name)}</span>
              <span class="taxo-count">${t.postIds.length} 篇文章</span>
            </button>
            <div class="taxo-actions">
              <button class="btn ghost sm danger-text" type="button" data-taxo-delete="tag" data-taxo-id="${t.id}">删除</button>
            </div>
          </li>`;
        })
        .join("");
    }

    renderAssocPanel();
  }

  function getTaxoEntity() {
    if (!taxoSelection) return null;
    const list = taxoSelection.type === "category" ? categories : tags;
    return list.find((item) => item.id === taxoSelection.id) || null;
  }

  function renderAssocPanel() {
    const label = document.getElementById("taxo-active-label");
    const select = document.getElementById("assoc-post-select");
    const addBtn = document.getElementById("assoc-add-btn");
    const list = document.getElementById("assoc-list");
    const entity = getTaxoEntity();

    if (!label || !select || !addBtn || !list) return;

    if (!entity) {
      label.textContent = "选择左侧分类或标签";
      addBtn.disabled = true;
      select.innerHTML = `<option value="">请先选择分类或标签</option>`;
      list.innerHTML = `<li class="assoc-empty">尚未选择分类 / 标签</li>`;
      return;
    }

    label.textContent = `当前：${entity.name}`;
    const linked = posts.filter((p) => entity.postIds.includes(p.id));
    const candidates = posts.filter((p) => !entity.postIds.includes(p.id));

    select.innerHTML = candidates.length
      ? candidates.map((p) => `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join("")
      : `<option value="">没有可添加的文章</option>`;
    addBtn.disabled = candidates.length === 0;

    list.innerHTML = linked.length
      ? linked
          .map(
            (p) => `
        <li class="assoc-item">
          <div>
            <div class="assoc-title">${escapeHtml(p.title)}</div>
            <div class="post-meta">${statusBadge(p.status)}<span>/posts/${escapeHtml(p.slug)}</span></div>
          </div>
          <button class="btn ghost sm" type="button" data-assoc-remove="${p.id}">移除</button>
        </li>`
          )
          .join("")
      : `<li class="assoc-empty">还没有关联文章</li>`;
  }

  function selectTaxo(type, id) {
    taxoSelection = { type, id };
    renderTaxonomies();
  }

  function addTaxo(type, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const list = type === "category" ? categories : tags;
    if (list.some((item) => item.name === trimmed)) {
      showToast("名称已存在");
      return;
    }
    list.push({ id: `${type}-${uid++}`, name: trimmed, postIds: [] });
    renderTaxonomies();
    showToast(type === "category" ? "分类已添加" : "标签已添加");
  }

  function deleteTaxo(type, id) {
    if (type === "category") {
      categories = categories.filter((c) => c.id !== id);
    } else {
      tags = tags.filter((t) => t.id !== id);
    }
    if (taxoSelection && taxoSelection.id === id) {
      taxoSelection = null;
    }
    renderTaxonomies();
    showToast(type === "category" ? "分类已删除" : "标签已删除");
  }

  function addAssoc(postId) {
    const entity = getTaxoEntity();
    if (!entity || !postId) return;
    if (!entity.postIds.includes(postId)) {
      entity.postIds.push(postId);
    }
    renderTaxonomies();
  }

  function removeAssoc(postId) {
    const entity = getTaxoEntity();
    if (!entity) return;
    entity.postIds = entity.postIds.filter((id) => id !== postId);
    renderTaxonomies();
    showToast("已移除文章关联");
  }

  function openPalette() {
    if (!palette) return;
    palette.hidden = false;
    if (paletteInput) {
      paletteInput.value = "";
      paletteInput.focus();
    }
    filterPalette("");
  }

  function closePalette() {
    if (!palette) return;
    palette.hidden = true;
  }

  function filterPalette(keyword) {
    const list = document.getElementById("palette-list");
    if (!list) return;
    const key = keyword.trim().toLowerCase();
    Array.from(list.querySelectorAll("li")).forEach((li) => {
      const text = li.textContent.toLowerCase();
      li.hidden = key ? !text.includes(key) : false;
    });
  }

  document.addEventListener("click", (event) => {
    const viewTarget = event.target.closest("[data-view]");
    if (viewTarget) {
      event.preventDefault();
      setView(viewTarget.dataset.view);
      return;
    }

    const messageItem = event.target.closest("[data-message-id]");
    if (messageItem) {
      openDrawer(Number(messageItem.dataset.messageId));
      return;
    }

    const filterBtn = event.target.closest("#message-filters [data-filter]");
    if (filterBtn) {
      messageFilter = filterBtn.dataset.filter;
      document.querySelectorAll("#message-filters .tab").forEach((tab) => {
        tab.classList.toggle("is-active", tab === filterBtn);
      });
      renderMessages();
      return;
    }

    const statusChip = event.target.closest("#drawer-status-row [data-status]");
    if (statusChip) {
      setMessageStatus(statusChip.dataset.status);
      return;
    }

    if (event.target.closest("[data-close-drawer]")) {
      closeDrawer();
      return;
    }

    const taxoMain = event.target.closest("[data-taxo-type]");
    if (taxoMain) {
      selectTaxo(taxoMain.dataset.taxoType, taxoMain.dataset.taxoId);
      return;
    }

    const taxoDelete = event.target.closest("[data-taxo-delete]");
    if (taxoDelete) {
      deleteTaxo(taxoDelete.dataset.taxoDelete, taxoDelete.dataset.taxoId);
      return;
    }

    const assocRemove = event.target.closest("[data-assoc-remove]");
    if (assocRemove) {
      removeAssoc(Number(assocRemove.dataset.assocRemove));
      return;
    }

    const deleteBtn = event.target.closest("[data-delete-kind]");
    if (deleteBtn) {
      const kind = deleteBtn.dataset.deleteKind;
      const raw = deleteBtn.dataset.deleteId;
      const id = kind === "moment" ? raw : Number(raw);
      deleteContent(kind, id);
      return;
    }

    const tagChip = event.target.closest("[data-moment-tag]");
    if (tagChip) {
      const tag = tagChip.dataset.momentTag;
      showToast(`已按标签筛选：#${tag}`);
      const host = document.getElementById("moment-list");
      if (host) {
        const filtered = moments.filter((m) => (m.tags || []).includes(tag));
        host.innerHTML = filtered
          .map(
            (m) => `
          <li class="moment-item">
            <div class="moment-date">${escapeHtml(m.date)}</div>
            <div class="moment-main">
              <div class="moment-body">${escapeHtml(m.text)}</div>
              <div class="moment-meta">
                ${m.meta.map((x) => `<span>${escapeHtml(x)}</span>`).join('<span class="dot" aria-hidden="true"></span>')}
                <span class="moment-actions">
                  <button class="btn ghost sm" type="button" data-moment-clear-filter="1">显示全部</button>
                  <button class="btn ghost sm danger-text" type="button" data-delete-kind="moment" data-delete-id="${escapeHtml(m.id)}">删除</button>
                </span>
              </div>
            </div>
          </li>`
          )
          .join("");
      }
      return;
    }

    if (event.target.closest("[data-moment-clear-filter]")) {
      renderMoments();
      showToast("已显示全部说说");
      return;
    }

    if (event.target.closest("#assoc-add-btn")) {
      const select = document.getElementById("assoc-post-select");
      if (select?.value) {
        addAssoc(Number(select.value));
        showToast("已添加文章关联");
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    const isMetaK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    if (isMetaK) {
      event.preventDefault();
      if (palette?.hidden) openPalette();
      else closePalette();
      return;
    }

    if (event.key === "Escape") {
      closePalette();
      closeDrawer();
      return;
    }

    const messageItem = event.target.matches("[data-message-id]")
      ? event.target
      : event.target.closest?.("[data-message-id]");
    if (messageItem && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openDrawer(Number(messageItem.dataset.messageId));
      return;
    }

    const drawer = document.getElementById("message-drawer");
    if (drawer && !drawer.hidden && event.key === "Tab") {
      const focusable = drawer.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  openPaletteBtn?.addEventListener("click", openPalette);

  palette?.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-palette]")) {
      closePalette();
    }
  });

  paletteInput?.addEventListener("input", (event) => {
    filterPalette(event.target.value);
  });

  document.getElementById("post-search")?.addEventListener("input", renderPosts);
  document.getElementById("post-status-filter")?.addEventListener("change", renderPosts);

  const momentInput = document.getElementById("moment-input");
  const momentCount = document.getElementById("moment-count");
  momentInput?.addEventListener("input", () => {
    if (momentCount) momentCount.textContent = `${momentInput.value.length} / 280`;
  });

  document.getElementById("moment-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("moment-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }

    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    moments.unshift({
      id: `m${uid++}`,
      date: `${month}-${day}`,
      text,
      meta: ["说说", "0 赞"],
      tags: ["随笔"],
    });

    input.value = "";
    if (momentCount) momentCount.textContent = "0 / 280";
    renderMoments();
    renderMomentTagCloud();
    renderHeatmap();
    showToast("说说已发布");
  });

  document.getElementById("category-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("category-name");
    if (!input) return;
    addTaxo("category", input.value);
    input.value = "";
  });

  document.getElementById("tag-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("tag-name");
    if (!input) return;
    addTaxo("tag", input.value);
    input.value = "";
  });

  document.getElementById("reply-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("reply-input");
    const hint = document.getElementById("reply-hint");
    if (!input || activeMessageId == null) return;

    const text = input.value.trim();
    if (!text) {
      if (hint) hint.textContent = "请先输入回复内容";
      return;
    }

    const message = messages.find((m) => m.id === activeMessageId);
    if (!message) return;

    message.replies.push({
      from: "沈观澜",
      time: "刚刚",
      content: text,
      mine: true,
    });

    input.value = "";
    if (hint) hint.textContent = "回复已加入对话";
    renderThread(message);
    renderMessages();
    renderDashboard();
    showToast("回复已发送");
  });

  renderDashboard();
  renderPosts();
  renderPages();
  renderMoments();
  renderHeatmap();
  renderMomentTagCloud();
  renderMessages();
  renderTaxonomies();
})();
