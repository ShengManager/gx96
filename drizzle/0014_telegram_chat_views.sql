CREATE TABLE `telegram_chat_views` (
	`id` int AUTO_INCREMENT NOT NULL,
	`botId` int NOT NULL,
	`chatId` bigint NOT NULL,
	`viewKey` varchar(64) NOT NULL,
	`messageId` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_chat_views_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_tg_view` UNIQUE(`botId`,`chatId`,`viewKey`)
);
--> statement-breakpoint
CREATE INDEX `idx_tg_view_chat` ON `telegram_chat_views` (`botId`,`chatId`);
