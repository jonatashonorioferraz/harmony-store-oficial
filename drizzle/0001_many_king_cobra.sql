CREATE TABLE `studio_excellence_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`review_decision_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`marketplace` text NOT NULL,
	`product_category` text NOT NULL,
	`agent_role` text NOT NULL,
	`context_json` text NOT NULL,
	`decisions_json` text NOT NULL,
	`approval_reason` text NOT NULL,
	`tags_json` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`retired_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `studio_ad_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `studio_artifact_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`review_decision_id`) REFERENCES `studio_review_decisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_excellence_candidate_unique` ON `studio_excellence_items` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `studio_excellence_type_marketplace_idx` ON `studio_excellence_items` (`artifact_type`,`marketplace`,`status`);--> statement-breakpoint
CREATE INDEX `studio_excellence_category_status_idx` ON `studio_excellence_items` (`product_category`,`status`);