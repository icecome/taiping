/**
 * deps.js - On-demand CDN dependency loader with Promise caching.
 * Zero npm runtime deps: heavy renderers (KaTeX, Mermaid, viz.js) are
 * injected only when a matching block is first encountered.
 */

const CDN = {
  katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
  katexJs: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
  mermaidJs: 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js',
  vizJs: 'https://cdn.jsdelivr.net/npm/viz.js@2.1.2/viz.js'
};

const cache = new Map();

function loadScript(src) {
  if (cache.has(src)) return cache.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { cache.delete(src); reject(new Error('依赖加载失败: ' + src)); };
    document.head.appendChild(s);
  });
  cache.set(src, p);
  return p;
}

function loadStyleFile(href) {
  if (cache.has(href)) return cache.get(href);
  const p = new Promise((resolve, reject) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = () => resolve();
    l.onerror = () => { cache.delete(href); reject(new Error('样式加载失败: ' + href)); };
    document.head.appendChild(l);
  });
  cache.set(href, p);
  return p;
}

// Lazy fetchers, only invoked when a matching block is rendered.
const loaded = {
  katex: null,
  mermaid: null,
  viz: null
};

export function loadKaTeX() {
  loaded.katex = loaded.katex || Promise.all([
    loadStyleFile(CDN.katexCss),
    loadScript(CDN.katexJs)
  ]);
  return loaded.katex;
}

export function loadMermaid() {
  loaded.mermaid = loaded.mermaid || loadScript(CDN.mermaidJs);
  return loaded.mermaid;
}

export function loadViz() {
  loaded.viz = loaded.viz || loadScript(CDN.vizJs);
  return loaded.viz;
}