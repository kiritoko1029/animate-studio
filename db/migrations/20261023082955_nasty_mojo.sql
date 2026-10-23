CREATE TABLE `studio_component_share` (
	`component_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`snapshot` text NOT NULL,
	`revision` integer NOT NULL,
	`published_at` text NOT NULL,
	FOREIGN KEY (`component_id`) REFERENCES `studio_component`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_component_share_token_unique` ON `studio_component_share` (`token`);--> statement-breakpoint
CREATE TABLE `studio_component` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`definition` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `studio_component_user_updated_idx` ON `studio_component` (`user_id`,`updated_at`);