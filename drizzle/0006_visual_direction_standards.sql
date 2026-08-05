CREATE TABLE `studio_visual_references_v2` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `scope` text NOT NULL CHECK (`scope` IN ('global','category','model')),
  `category` text,
  `model_name` text,
  `shot_type` text NOT NULL CHECK (`shot_type` IN ('catalog-cover','product-detail','variations','purchase-contents','use-occasion','product-size')),
  `transfer_mode` text NOT NULL CHECK (`transfer_mode` IN ('style','style-composition','scenario','lighting')),
  `guidance` text NOT NULL,
  `never_do_json` text NOT NULL,
  `analysis_json` text,
  `analysis_status` text NOT NULL DEFAULT 'pending' CHECK (`analysis_status` IN ('pending','approved','rejected')),
  `storage_key` text NOT NULL,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `sha256` text NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('active','retired')),
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  `approved_at` text,
  `retired_at` text
);
--> statement-breakpoint
INSERT INTO `studio_visual_references_v2` (`id`,`title`,`scope`,`category`,`model_name`,`shot_type`,`transfer_mode`,`guidance`,`never_do_json`,`analysis_json`,`analysis_status`,`storage_key`,`content_type`,`size_bytes`,`sha256`,`status`,`created_by`,`created_at`,`approved_at`,`retired_at`)
SELECT `id`,`title`,`scope`,`category`,`model_name`,CASE WHEN `shot_type` = 'versatile-composition' THEN 'purchase-contents' ELSE `shot_type` END,`transfer_mode`,`guidance`,`never_do_json`,NULL,'pending',`storage_key`,`content_type`,`size_bytes`,`sha256`,`status`,`created_by`,`created_at`,NULL,`retired_at` FROM `studio_visual_references`;
--> statement-breakpoint
DROP TABLE `studio_visual_references`;
--> statement-breakpoint
ALTER TABLE `studio_visual_references_v2` RENAME TO `studio_visual_references`;
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_visual_reference_storage_unique` ON `studio_visual_references` (`storage_key`);
--> statement-breakpoint
CREATE INDEX `studio_visual_reference_lookup_idx` ON `studio_visual_references` (`status`,`analysis_status`,`shot_type`,`scope`,`category`,`model_name`);
--> statement-breakpoint
CREATE TABLE `studio_visual_standard_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `category` text NOT NULL,
  `shot_type` text NOT NULL CHECK (`shot_type` IN ('catalog-cover','product-detail','variations','purchase-contents','use-occasion','product-size')),
  `version` integer NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('draft','published','archived')),
  `purpose` text NOT NULL,
  `specification_json` text NOT NULL,
  `source_reference_ids_json` text NOT NULL,
  `change_reason` text NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  `published_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_visual_standard_category_shot_version_unique` ON `studio_visual_standard_versions` (`category`,`shot_type`,`version`);
--> statement-breakpoint
CREATE INDEX `studio_visual_standard_published_lookup_idx` ON `studio_visual_standard_versions` (`category`,`shot_type`,`status`,`version`);
