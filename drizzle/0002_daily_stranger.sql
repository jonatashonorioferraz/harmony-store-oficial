CREATE TABLE `studio_usage_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workflow_run_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`reserved_usd_micros` integer NOT NULL,
	`actual_usd_micros` integer,
	`usage_json` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `studio_ad_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_run_id`) REFERENCES `studio_workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_usage_idempotency_unique` ON `studio_usage_ledger` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `studio_usage_project_status_idx` ON `studio_usage_ledger` (`project_id`,`status`);