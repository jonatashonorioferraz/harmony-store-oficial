CREATE TABLE `studio_image_human_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `workflow_run_id` text NOT NULL,
  `slot` integer NOT NULL CHECK (`slot` BETWEEN 1 AND 6),
  `asset_id` text NOT NULL,
  `decision` text NOT NULL CHECK (`decision` IN ('approved','rejected')),
  `feedback` text,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`workflow_run_id`) REFERENCES `studio_workflow_runs`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `studio_image_human_review_lookup_idx` ON `studio_image_human_reviews` (`workflow_run_id`,`slot`,`created_at`);
