CREATE TABLE `studio_media` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`hash` text NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`page_id`) REFERENCES `studio_page`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_media_storage_key_unique` ON `studio_media` (`storage_key`);--> statement-breakpoint
CREATE INDEX `studio_media_owner_page_idx` ON `studio_media` (`user_id`,`page_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER "studio_media_count_limit"
BEFORE INSERT ON "studio_media"
WHEN (SELECT COUNT(*) FROM "studio_media" WHERE "page_id" = NEW."page_id") >= 100
BEGIN SELECT RAISE(ABORT, 'studio_media_count_limit'); END;--> statement-breakpoint
CREATE TRIGGER "studio_media_bytes_limit"
BEFORE INSERT ON "studio_media"
WHEN (SELECT COALESCE(SUM("size"), 0) + NEW."size" FROM "studio_media" WHERE "page_id" = NEW."page_id") > 52428800
BEGIN SELECT RAISE(ABORT, 'studio_media_bytes_limit'); END;