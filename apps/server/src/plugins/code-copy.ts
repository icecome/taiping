/**
 * 内置插件：code-copy（代码块一键复制）
 *
 * 复制按钮的 DOM 由 lib/markdown.ts 渲染 <figcaption> 时生成（那里能拿到语言名），
 * 插件只负责注入少量事件绑定脚本 —— 这样按钮始终有，脚本挂了也只是点了没反应，
 * 不会出现"没有按钮"的死状态。
 */
import type { PluginManifest } from "../lib/hooks";

const SCRIPT = `<script>(function(){if(window.__tpCopyBound)return;window.__tpCopyBound=1;
document.addEventListener("click",function(event){
  var button=event.target.closest("[data-copy]");if(!button)return;
  var figure=button.closest(".md-code");if(!figure)return;
  var code=figure.querySelector("code");if(!code)return;
  var text=code.innerText;
  var done=function(){var old=button.textContent;button.textContent="已复制";setTimeout(function(){button.textContent=old;},1600);};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done).catch(function(){});}
  else{var area=document.createElement("textarea");area.value=text;document.body.appendChild(area);area.select();
    try{document.execCommand("copy");done();}catch(e){}document.body.removeChild(area);}
});})();</script>`;

export const codeCopyPlugin: PluginManifest = {
  key: "code-copy",
  name: "代码块复制",
  version: "1.0.0",
  description: "为代码块的一键复制按钮注入事件绑定脚本，约 1KB 内联。",
  author: "太平",
  /**
   * 默认关闭：内置主题的 manifest.scripts 已经包含同一份复制逻辑。
   * 主题没有自带的复制脚本时才启用它，避免同一次点击触发两个监听器。
   */
  defaultEnabled: false,
  settings: [{ key: "buttonText", label: "按钮文案", type: "text", default: "复制" }],
  hooks: {
    filters: {
      "site.footerHtml": (payload) => ({ ...payload, html: `${payload.html}\n${SCRIPT}` }),
    },
  },
};
