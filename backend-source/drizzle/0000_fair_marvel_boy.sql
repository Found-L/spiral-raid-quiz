CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_id` text NOT NULL,
	`quiz_version` text NOT NULL,
	`correct_count` integer NOT NULL,
	`total_count` integer NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attempts_version_participant` ON `attempts` (`quiz_version`,`participant_id`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`secret_hash` text NOT NULL,
	`game_id` text NOT NULL,
	`game_id_key` text NOT NULL,
	`nickname` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_game_id_key` ON `participants` (`game_id_key`);