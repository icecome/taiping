/**
 * 权限目录（单一真值）
 *
 * 该文件同时被服务端（RBAC 判定）与后台（界面按权限显隐）引用，因此不允许依赖
 * 任何 Workers / Node 专有 API，也不允许引用数据库层。
 *
 * 权限键统一为 `资源.动作`，`.own` 后缀表示"仅限本人创建的对象"，
 * 由服务端在判定时把 own 权限与对象作者一起校验（见 lib/rbac.ts）。
 */

export const PERMISSION_GROUPS = [
  { key: "content", label: "内容" },
  { key: "term", label: "分类与标签" },
  { key: "comment", label: "评论" },
  { key: "media", label: "媒体库" },
  { key: "user", label: "用户" },
  { key: "role", label: "角色与权限" },
  { key: "setting", label: "系统设置" },
  { key: "theme", label: "模板与主题" },
  { key: "plugin", label: "插件" },
  { key: "field", label: "内容模型" },
  { key: "nav", label: "导航" },
  { key: "system", label: "系统运维" },
] as const;

export type PermissionGroupKey = (typeof PERMISSION_GROUPS)[number]["key"];

export interface PermissionDefinition {
  key: string;
  label: string;
  group: PermissionGroupKey;
  description: string;
}

export const PERMISSIONS = [
  // 内容
  { key: "content.read", label: "查看内容", group: "content", description: "查看后台内容列表与详情" },
  { key: "content.create", label: "创建内容", group: "content", description: "新建文章、页面、动态、项目" },
  { key: "content.update.own", label: "编辑本人内容", group: "content", description: "编辑由自己创建的内容" },
  { key: "content.update.any", label: "编辑任意内容", group: "content", description: "编辑他人创建的内容" },
  { key: "content.delete.own", label: "删除本人内容", group: "content", description: "把本人创建的内容移入回收站" },
  { key: "content.delete.any", label: "删除任意内容", group: "content", description: "把他人创建的内容移入回收站" },
  { key: "content.publish.own", label: "发布本人内容", group: "content", description: "把本人内容直接发布到前台" },
  { key: "content.publish.any", label: "发布任意内容", group: "content", description: "发布他人内容，或跳过审核" },
  { key: "content.review", label: "审核内容", group: "content", description: "审批待审内容并发布" },
  { key: "content.restore", label: "恢复与彻底删除", group: "content", description: "从回收站恢复或物理清除内容" },
  // 分类与标签
  { key: "term.read", label: "查看分类标签", group: "term", description: "读取分类树与标签列表" },
  { key: "term.manage", label: "管理分类标签", group: "term", description: "新增、修改、删除、排序分类与标签" },
  // 评论
  { key: "comment.read", label: "查看评论", group: "comment", description: "查看待审与已发布评论" },
  { key: "comment.moderate", label: "审核评论", group: "comment", description: "通过、标记垃圾、驳回评论" },
  { key: "comment.delete", label: "删除评论", group: "comment", description: "从回收站删除评论" },
  { key: "comment.reply", label: "回复评论", group: "comment", description: "以后台身份回复访客评论" },
  // 媒体
  { key: "media.read", label: "查看媒体", group: "media", description: "浏览媒体库" },
  { key: "media.upload", label: "上传媒体", group: "media", description: "上传图片与文件到对象存储" },
  { key: "media.update", label: "编辑媒体信息", group: "media", description: "修改替代文本、说明与文件夹" },
  { key: "media.delete.own", label: "删除本人媒体", group: "media", description: "删除自己上传的文件" },
  { key: "media.delete.any", label: "删除任意媒体", group: "media", description: "删除他人上传的文件" },
  // 用户
  { key: "user.read", label: "查看用户", group: "user", description: "查看用户列表与资料" },
  { key: "user.create", label: "创建用户", group: "user", description: "新增后台用户" },
  { key: "user.update", label: "编辑用户", group: "user", description: "修改资料、重置密码、停用账号" },
  { key: "user.delete", label: "删除用户", group: "user", description: "删除后台用户" },
  { key: "user.assignRole", label: "分配角色", group: "user", description: "调整用户角色，属于高危操作" },
  // 角色
  { key: "role.read", label: "查看角色", group: "role", description: "查看角色与权限矩阵" },
  { key: "role.manage", label: "管理角色", group: "role", description: "新建角色并调整权限集合" },
  // 设置
  { key: "setting.read", label: "查看系统设置", group: "setting", description: "读取站点配置" },
  { key: "setting.manage", label: "修改系统设置", group: "setting", description: "写入站点、主题、插件配置" },
  // 主题
  { key: "theme.read", label: "查看主题", group: "theme", description: "查看可用主题与模板清单" },
  { key: "theme.manage", label: "切换主题", group: "theme", description: "启用主题并保存主题配置" },
  // 插件
  { key: "plugin.read", label: "查看插件", group: "plugin", description: "查看插件清单与状态" },
  { key: "plugin.manage", label: "管理插件", group: "plugin", description: "启用、停用与配置插件" },
  // 内容模型
  { key: "field.read", label: "查看内容模型", group: "field", description: "查看自定义字段定义" },
  { key: "field.manage", label: "管理内容模型", group: "field", description: "新增、修改、删除自定义字段" },
  // 导航
  { key: "nav.read", label: "查看导航", group: "nav", description: "查看导航菜单配置" },
  { key: "nav.manage", label: "管理导航", group: "nav", description: "新增、排序、启停导航项" },
  // 系统运维
  { key: "system.audit.read", label: "查看操作日志", group: "system", description: "读取审计日志" },
  { key: "system.task.run", label: "执行维护任务", group: "system", description: "手工触发清理、重建索引等任务" },
  { key: "system.token.manage", label: "管理 API 令牌", group: "system", description: "创建与吊销访问令牌" },
] as const satisfies readonly PermissionDefinition[];

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

export function permissionLabel(key: string): string {
  return PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}

/** 角色 key。owner 是唯一的超级角色，权限判定时短路放行。 */
export const ROLE_KEYS = ["owner", "admin", "editor", "author", "contributor", "subscriber"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export interface BuiltinRoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  sortOrder: number;
  /** "*" 代表全部权限。 */
  permissions: Permission[] | ["*"];
}

const READ_ONLY_EDITOR = [
  "content.read",
  "term.read",
  "term.manage",
  "comment.read",
  "comment.moderate",
  "comment.delete",
  "comment.reply",
  "media.read",
  "media.upload",
  "media.update",
  "media.delete.any",
  "user.read",
  "role.read",
  "setting.read",
  "theme.read",
  "plugin.read",
  "field.read",
  "nav.read",
  "nav.manage",
  "content.create",
  "content.update.any",
  "content.delete.any",
  "content.publish.any",
  "content.review",
  "content.restore",
] as const satisfies readonly Permission[];

export const BUILTIN_ROLES: BuiltinRoleDefinition[] = [
  {
    key: "owner",
    name: "站点所有者",
    description: "拥有全部权限，包括角色管理与 API 令牌；不可删除，权限不可下调。",
    sortOrder: 1,
    permissions: ["*"],
  },
  {
    key: "admin",
    name: "管理员",
    description: "除 API 令牌管理外的全部权限，可管理用户与角色。",
    sortOrder: 2,
    permissions: ALL_PERMISSIONS.filter((p) => p !== "system.token.manage"),
  },
  {
    key: "editor",
    name: "编辑",
    description: "管理全部内容、分类标签、评论、媒体与导航，可调整内容模型。",
    sortOrder: 3,
    permissions: [...READ_ONLY_EDITOR, "field.manage"],
  },
  {
    key: "author",
    name: "作者",
    description: "只能编辑并发布自己创建的内容，可上传媒体、回复评论。",
    sortOrder: 4,
    permissions: [
      "content.read",
      "content.create",
      "content.update.own",
      "content.delete.own",
      "content.publish.own",
      "term.read",
      "comment.read",
      "comment.reply",
      "media.read",
      "media.upload",
      "media.delete.own",
      "field.read",
      "nav.read",
      "setting.read",
    ],
  },
  {
    key: "contributor",
    name: "投稿者",
    description: "可以撰写草稿并提交审核，但不能发布，也不能删除已发布内容。",
    sortOrder: 5,
    permissions: [
      "content.read",
      "content.create",
      "content.update.own",
      "term.read",
      "media.read",
      "media.upload",
      "field.read",
    ],
  },
  {
    key: "subscriber",
    name: "订阅者",
    description: "仅可登录前台账号参与评论，不进入后台。",
    sortOrder: 6,
    permissions: [],
  },
];

/** 判定某角色是否拥有某权限；owner 短路放行。 */
export function roleGrants(roleKey: string, permissions: readonly string[], permission: Permission): boolean {
  if (roleKey === "owner") return true;
  return permissions.includes(permission);
}
