CREATE TABLE `studio_configuration_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`version` integer NOT NULL,
	`value_json` text NOT NULL,
	`status` text NOT NULL,
	`change_reason` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_configuration_key_version_unique` ON `studio_configuration_versions` (`key`,`version`);
--> statement-breakpoint
CREATE INDEX `studio_configuration_key_status_idx` ON `studio_configuration_versions` (`key`,`status`);
