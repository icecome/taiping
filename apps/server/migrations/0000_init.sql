CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`user_id` text NOT NULL,
	`scopes_json` text DEFAULT '[]' NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`meta_json` text,
	`ip` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_target_idx` ON `audit_logs` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`parent_id` text,
	`root_id` text,
	`depth` integer DEFAULT 0 NOT NULL,
	`author_user_id` text,
	`author_name` text NOT NULL,
	`author_email` text,
	`author_url` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`is_owner` integer DEFAULT false NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_content_idx` ON `comments` (`content_id`,`status`);--> statement-breakpoint
CREATE INDEX `comments_status_created_idx` ON `comments` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_root_idx` ON `comments` (`root_id`);--> statement-breakpoint
CREATE TABLE `content_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`revision_no` integer NOT NULL,
	`title` text NOT NULL,
	`excerpt` text,
	`body_markdown` text NOT NULL,
	`status` text NOT NULL,
	`meta_json` text DEFAULT '{}' NOT NULL,
	`note` text,
	`author_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_revisions_no_unique` ON `content_revisions` (`content_id`,`revision_no`);--> statement-breakpoint
CREATE INDEX `content_revisions_content_idx` ON `content_revisions` (`content_id`);--> statement-breakpoint
CREATE TABLE `content_terms` (
	`content_id` text NOT NULL,
	`term_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`content_id`, `term_id`)
);
--> statement-breakpoint
CREATE INDEX `content_terms_term_idx` ON `content_terms` (`term_id`);--> statement-breakpoint
CREATE TABLE `contents` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text,
	`body_markdown` text DEFAULT '' NOT NULL,
	`body_html` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`author_id` text NOT NULL,
	`cover_media_id` text,
	`template` text,
	`password` text,
	`is_pinned` integer DEFAULT false NOT NULL,
	`allow_comment` integer DEFAULT true NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`reading_minutes` integer DEFAULT 1 NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`extra_json` text DEFAULT '{}' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`seo_keywords` text,
	`canonical_url` text,
	`og_image_url` text,
	`published_at` integer,
	`scheduled_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contents_slug_unique` ON `contents` (`slug`) WHERE "contents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX `contents_status_published_idx` ON `contents` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `contents_type_status_idx` ON `contents` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `contents_author_idx` ON `contents` (`author_id`);--> statement-breakpoint
CREATE INDEX `contents_scheduled_idx` ON `contents` (`scheduled_at`);--> statement-breakpoint
CREATE TABLE `field_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`field_type` text NOT NULL,
	`options_json` text DEFAULT '[]' NOT NULL,
	`default_value_json` text,
	`applies_to_json` text DEFAULT '["*"]' NOT NULL,
	`is_required` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `field_definitions_key_unique` ON `field_definitions` (`key`);--> statement-breakpoint
CREATE TABLE `field_values` (
	`content_id` text NOT NULL,
	`field_key` text NOT NULL,
	`value_text` text,
	`value_number` integer,
	`value_bool` integer,
	`value_json` text,
	PRIMARY KEY(`content_id`, `field_key`)
);
--> statement-breakpoint
CREATE INDEX `field_values_key_idx` ON `field_values` (`field_key`);--> statement-breakpoint
CREATE TABLE `locks` (
	`key` text PRIMARY KEY NOT NULL,
	`holder` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`checksum` text NOT NULL,
	`alt_text` text,
	`caption` text,
	`folder` text DEFAULT '/' NOT NULL,
	`driver` text DEFAULT 'r2' NOT NULL,
	`external_url` text,
	`uploader_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_storage_key_unique` ON `media` (`storage_key`);--> statement-breakpoint
CREATE INDEX `media_folder_idx` ON `media` (`folder`,`created_at`);--> statement-breakpoint
CREATE INDEX `media_checksum_idx` ON `media` (`checksum`);--> statement-breakpoint
CREATE TABLE `nav_items` (
	`id` text PRIMARY KEY NOT NULL,
	`location` text DEFAULT 'header' NOT NULL,
	`label` text NOT NULL,
	`href` text NOT NULL,
	`parent_id` text,
	`target` text DEFAULT '_self' NOT NULL,
	`icon` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nav_items_location_idx` ON `nav_items` (`location`,`sort_order`);--> statement-breakpoint
CREATE TABLE `plugins` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`description` text,
	`author` text,
	`enabled` integer DEFAULT false NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`installed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`from_path` text NOT NULL,
	`to_path` text NOT NULL,
	`status_code` integer DEFAULT 301 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `redirects_from_unique` ON `redirects` (`from_path`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission` text NOT NULL,
	PRIMARY KEY(`role_id`, `permission`)
);
--> statement-breakpoint
CREATE INDEX `role_permissions_permission_idx` ON `role_permissions` (`permission`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_system` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_key_unique` ON `roles` (`key`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `settings_prefix_idx` ON `settings` (`key`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`run_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_status_run_idx` ON `tasks` (`status`,`run_at`);--> statement-breakpoint
CREATE TABLE `terms` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`parent_id` text,
	`cover_media_id` text,
	`count` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terms_type_slug_unique` ON `terms` (`type`,`slug`);--> statement-breakpoint
CREATE INDEX `terms_parent_idx` ON `terms` (`parent_id`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`granted_by` text,
	`granted_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `role_id`)
);
--> statement-breakpoint
CREATE INDEX `user_roles_user_idx` ON `user_roles` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`bio` text,
	`avatar_url` text,
	`website` text,
	`locale` text DEFAULT 'zh-CN' NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`last_login_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);