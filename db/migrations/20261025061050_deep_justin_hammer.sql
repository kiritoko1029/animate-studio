CREATE TABLE `studio_component_folder` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_component_folder_user_name_idx` ON `studio_component_folder` (`user_id`,`name`);--> statement-breakpoint
-- Drizzle's ADD COLUMN output omits the configured delete action; keep it aligned with schema.ts.
ALTER TABLE `studio_component` ADD `folder_id` text REFERENCES studio_component_folder(id) ON DELETE SET NULL;
