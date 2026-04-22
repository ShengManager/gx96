CREATE TABLE `live_chat_threads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`playerId` int NOT NULL,
	`status` enum('open','handling','finished') NOT NULL DEFAULT 'open',
	`handledBy` int,
	`handledAt` timestamp,
	`finishedBy` int,
	`finishedAt` timestamp,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`unreadForAdmin` int NOT NULL DEFAULT 0,
	`unreadForPlayer` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `live_chat_threads_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_live_chat_thread` UNIQUE(`adminId`,`playerId`)
);
--> statement-breakpoint
CREATE INDEX `idx_live_chat_admin_status` ON `live_chat_threads` (`adminId`,`status`,`lastMessageAt`);
--> statement-breakpoint
CREATE INDEX `idx_live_chat_admin_unread` ON `live_chat_threads` (`adminId`,`unreadForAdmin`);
--> statement-breakpoint
CREATE INDEX `idx_live_chat_player_status` ON `live_chat_threads` (`playerId`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_live_chat_finished_at` ON `live_chat_threads` (`status`,`finishedAt`);
--> statement-breakpoint
CREATE TABLE `live_chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`adminId` int NOT NULL,
	`senderType` enum('player','admin','system') NOT NULL,
	`senderAdminId` int,
	`senderPlayerId` int,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `live_chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_live_chat_thread_time` ON `live_chat_messages` (`threadId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_live_chat_admin_time` ON `live_chat_messages` (`adminId`,`createdAt`);
