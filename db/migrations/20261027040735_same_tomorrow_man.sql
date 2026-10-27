-- void:allow-destructive
-- Reviewed additive migration: adds version history and backfills existing share snapshots without dropping tables or rows.
CREATE TABLE `studio_page_version` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`user_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`source_version` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `studio_page`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_page_version_page_version_idx` ON `studio_page_version` (`page_id`,`version`);--> statement-breakpoint
CREATE INDEX `studio_page_version_user_page_idx` ON `studio_page_version` (`user_id`,`page_id`,`version`);--> statement-breakpoint
ALTER TABLE `studio_page_share` ADD `active_version` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
INSERT INTO `studio_page_version` (`id`, `page_id`, `user_id`, `version`, `snapshot`, `source_version`, `created_at`)
SELECT `page_id` || ':1', `page_id`, `user_id`, 1, `snapshot`, NULL, `published_at` FROM `studio_page_share`;
--> statement-breakpoint
UPDATE `studio_page_share` SET `active_version` = 1;