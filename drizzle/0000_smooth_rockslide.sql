CREATE TABLE `draft_contributors` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`user_id` text NOT NULL,
	`first_contributed_at` integer NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `draft_contributors_draft_idx` ON `draft_contributors` (`draft_id`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`quoted_body` text,
	`thread_id` text,
	`forward_root_id` text,
	`forwarded_from_id` text,
	`recipients_json` text DEFAULT '[]' NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`became_public_at` integer,
	`auto_send_at` integer,
	`last_heartbeat_at` integer NOT NULL,
	`locked_by` text,
	`locked_at` integer,
	`fast_mode` integer DEFAULT false NOT NULL,
	`self_destruct_duration_ms` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`locked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `drafts_owner_idx` ON `drafts` (`owner_id`);--> statement-breakpoint
CREATE INDEX `drafts_public_idx` ON `drafts` (`is_public`);--> statement-breakpoint
CREATE TABLE `email_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`email_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`opened_at` integer,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `email_recipients_email_idx` ON `email_recipients` (`email_id`);--> statement-breakpoint
CREATE INDEX `email_recipients_user_idx` ON `email_recipients` (`user_id`);--> statement-breakpoint
CREATE TABLE `emails` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`quoted_body` text,
	`thread_id` text,
	`forward_root_id` text,
	`forwarded_from_id` text,
	`hesitation_ms` integer NOT NULL,
	`contributors_json` text DEFAULT '[]' NOT NULL,
	`sent_at` integer NOT NULL,
	`self_destruct_at` integer,
	`destroyed_at` integer,
	`fast_mode` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `emails_thread_idx` ON `emails` (`thread_id`);--> statement-breakpoint
CREATE INDEX `emails_sender_idx` ON `emails` (`sender_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_user_idx` ON `events` (`user_id`);--> statement-breakpoint
CREATE INDEX `events_type_idx` ON `events` (`type`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`address` text NOT NULL,
	`password_hash` text NOT NULL,
	`fast_mode` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_address_unique` ON `users` (`address`);