CREATE TABLE `studio_ad_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`marketplace` text NOT NULL,
	`status` text NOT NULL,
	`active_workflow_run_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `studio_projects_owner_status_idx` ON `studio_ad_projects` (`owner_id`,`status`);--> statement-breakpoint
CREATE TABLE `studio_agent_knowledge_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_role` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`content_json` text NOT NULL,
	`change_reason` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`published_at` text,
	`archived_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_knowledge_role_version_unique` ON `studio_agent_knowledge_versions` (`agent_role`,`version`);--> statement-breakpoint
CREATE INDEX `studio_knowledge_role_status_idx` ON `studio_agent_knowledge_versions` (`agent_role`,`status`);--> statement-breakpoint
CREATE TABLE `studio_artifact_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`stage_run_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`status` text NOT NULL,
	`text_content` text,
	`asset_id` text,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `studio_ad_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stage_run_id`) REFERENCES `studio_stage_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `studio_source_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `studio_candidates_project_status_idx` ON `studio_artifact_candidates` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `studio_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`actor_id` text NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`metadata_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `studio_ad_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `studio_audit_project_created_idx` ON `studio_audit_events` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `studio_audit_entity_idx` ON `studio_audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `studio_product_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`facts_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `studio_ad_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_snapshots_project_version_unique` ON `studio_product_snapshots` (`project_id`,`version`);--> statement-breakpoint
CREATE TABLE `studio_review_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`reviewer_role` text NOT NULL,
	`decision` text NOT NULL,
	`score` integer,
	`reasons_json` text NOT NULL,
	`knowledge_version_id` text,
	`decided_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `studio_artifact_candidates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `studio_reviews_candidate_idx` ON `studio_review_decisions` (`candidate_id`);--> statement-breakpoint
CREATE TABLE `studio_source_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`original_name` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `studio_ad_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_assets_storage_key_unique` ON `studio_source_assets` (`storage_key`);--> statement-breakpoint
CREATE INDEX `studio_assets_project_kind_idx` ON `studio_source_assets` (`project_id`,`kind`);--> statement-breakpoint
CREATE TABLE `studio_stage_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`stage_key` text NOT NULL,
	`attempt` integer NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`agent_role` text,
	`knowledge_version_id` text,
	`input_hash` text,
	`output_json` text,
	`error_json` text,
	`usage_json` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workflow_run_id`) REFERENCES `studio_workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_stage_idempotency_unique` ON `studio_stage_runs` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `studio_stage_attempt_unique` ON `studio_stage_runs` (`workflow_run_id`,`stage_key`,`attempt`);--> statement-breakpoint
CREATE INDEX `studio_stage_workflow_status_idx` ON `studio_stage_runs` (`workflow_run_id`,`status`);--> statement-breakpoint
CREATE TABLE `studio_workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`configuration_json` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `studio_ad_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `studio_workflows_project_status_idx` ON `studio_workflow_runs` (`project_id`,`status`);