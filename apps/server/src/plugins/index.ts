/**
 * 插件注册入口。
 *
 * 新增插件 = 建一个文件导出 PluginManifest + 在这里加一行 registerPlugin。
 * 插件是被 import 进来的，所以要确保内置插件都在这里被引用一次，否则会被 tree-shaking 掉。
 */
import { registerPlugin } from "../lib/hooks";
import { codeCopyPlugin } from "./code-copy";
import { commentNotifyPlugin } from "./comment-notify";
import { copyrightPlugin } from "./copyright";
import { headingAnchorsPlugin } from "./heading-anchors";
import { tocPlugin } from "./toc";

let registered = false;

export function registerBuiltinPlugins(): void {
  if (registered) return;
  registered = true;
  for (const manifest of [tocPlugin, copyrightPlugin, codeCopyPlugin, headingAnchorsPlugin, commentNotifyPlugin]) {
    try {
      registerPlugin(manifest);
    } catch (error) {
      console.error("[plugins] register failed", error);
    }
  }
}

export { codeCopyPlugin, commentNotifyPlugin, copyrightPlugin, headingAnchorsPlugin, tocPlugin };
