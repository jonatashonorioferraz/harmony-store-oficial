CREATE TABLE `studio_visual_references` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `scope` text NOT NULL CHECK (`scope` IN ('global','category','model')),
  `category` text,
  `model_name` text,
  `shot_type` text NOT NULL CHECK (`shot_type` IN ('catalog-cover','product-detail','variations','use-occasion','versatile-composition')),
  `transfer_mode` text NOT NULL CHECK (`transfer_mode` IN ('style','style-composition','scenario','lighting')),
  `guidance` text NOT NULL,
  `never_do_json` text NOT NULL,
  `storage_key` text NOT NULL,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `sha256` text NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('active','retired')),
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  `retired_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_visual_reference_storage_unique` ON `studio_visual_references` (`storage_key`);
--> statement-breakpoint
CREATE INDEX `studio_visual_reference_lookup_idx` ON `studio_visual_references` (`status`,`shot_type`,`scope`,`category`,`model_name`);
