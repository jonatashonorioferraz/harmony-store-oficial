CREATE TABLE `studio_category_palette_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`palette_name` text NOT NULL,
	`version` integer NOT NULL,
	`options_json` text NOT NULL,
	`status` text NOT NULL,
	`change_reason` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_palette_category_name_version_unique` ON `studio_category_palette_versions` (`category`,`palette_name`,`version`);
--> statement-breakpoint
CREATE INDEX `studio_palette_category_status_idx` ON `studio_category_palette_versions` (`category`,`status`);
