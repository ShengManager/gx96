CREATE TABLE `admin_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`passwordHash` varchar(256) NOT NULL,
	`displayName` varchar(128),
	`role` enum('master','sub') NOT NULL DEFAULT 'sub',
	`parentId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastLoginAt` timestamp,
	`lastLoginIp` varchar(64),
	`lastLoginUa` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admin_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_accounts_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `admin_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`action` varchar(128) NOT NULL,
	`module` varchar(64) NOT NULL,
	`targetId` int,
	`targetType` varchar(64),
	`details` json,
	`ipAddress` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `banks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`country` varchar(10) NOT NULL,
	`bankName` varchar(128) NOT NULL,
	`accountName` varchar(128) NOT NULL,
	`accountNumber` varchar(64) NOT NULL,
	`usageType` enum('deposit','withdraw','both','internal') NOT NULL DEFAULT 'both',
	`status` enum('active','closed','hidden') NOT NULL DEFAULT 'active',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `banks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `banners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`title` varchar(256),
	`imageUrl` text NOT NULL,
	`linkUrl` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `banners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bonus_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` text,
	`bonusType` int NOT NULL DEFAULT 0,
	`fixedAmount` decimal(14,4),
	`percentage` decimal(8,4),
	`randomMin` decimal(14,4),
	`randomMax` decimal(14,4),
	`cardImageUrl` text,
	`detailImageUrl` text,
	`claimConfig` json,
	`rolloverMultiplier` decimal(8,2),
	`turnoverTarget` decimal(14,4),
	`maxWithdraw` decimal(14,4),
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bonus_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `country_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`countryCode` varchar(10) NOT NULL,
	`phonePrefix` varchar(10) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'MYR',
	`isAllowed` boolean NOT NULL DEFAULT true,
	CONSTRAINT `country_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deposit_cycles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`adminId` int NOT NULL,
	`status` enum('active','completed') NOT NULL DEFAULT 'active',
	`depositAmount` decimal(14,4) NOT NULL DEFAULT '0',
	`bonusAmount` decimal(14,4) NOT NULL DEFAULT '0',
	`totalWithdrawn` decimal(14,4) NOT NULL DEFAULT '0',
	`hasEnteredGame` boolean NOT NULL DEFAULT false,
	`targetRollover` decimal(14,4) NOT NULL DEFAULT '0',
	`currentRollover` decimal(14,4) NOT NULL DEFAULT '0',
	`targetTurnover` decimal(14,4) NOT NULL DEFAULT '0',
	`currentTurnover` decimal(14,4) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deposit_cycles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deposit_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`amount` decimal(14,4) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `deposit_presets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deposits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`adminId` int NOT NULL,
	`cycleId` int,
	`amount` decimal(14,4) NOT NULL,
	`paymentMethod` enum('bank_transfer','api_payment') NOT NULL DEFAULT 'bank_transfer',
	`bankId` int,
	`receiptUrl` text,
	`apiPaymentRef` varchar(256),
	`apiPaymentUrl` text,
	`status` enum('pending','processing','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`handledBy` int,
	`handleNote` text,
	`rejectionReason` text,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deposits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `game_logs_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`playerId` int NOT NULL,
	`provider` varchar(64) NOT NULL,
	`gameCode` varchar(64),
	`gameName` varchar(256),
	`betAmount` decimal(14,4) NOT NULL DEFAULT '0',
	`validBet` decimal(14,4) NOT NULL DEFAULT '0',
	`payout` decimal(14,4) NOT NULL DEFAULT '0',
	`winLose` decimal(14,4) NOT NULL DEFAULT '0',
	`providerTranId` varchar(128),
	`transactionDate` timestamp,
	`rawData` json,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `game_logs_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invite_relations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inviterId` int NOT NULL,
	`inviteeId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invite_relations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `player_bonuses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`adminId` int NOT NULL,
	`bonusConfigId` int NOT NULL,
	`cycleId` int,
	`awardedAmount` decimal(14,4) NOT NULL,
	`targetRollover` decimal(14,4) NOT NULL DEFAULT '0',
	`currentRollover` decimal(14,4) NOT NULL DEFAULT '0',
	`targetTurnover` decimal(14,4) NOT NULL DEFAULT '0',
	`currentTurnover` decimal(14,4) NOT NULL DEFAULT '0',
	`status` enum('active','completed','expired','forfeited') NOT NULL DEFAULT 'active',
	`claimedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `player_bonuses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `player_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`tag` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `player_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`telegramId` varchar(64) NOT NULL,
	`telegramUsername` varchar(128),
	`telegramFirstName` varchar(128),
	`telegramLastName` varchar(128),
	`phone` varchar(32),
	`countryCode` varchar(10),
	`bankName` varchar(128),
	`bankAccountName` varchar(128),
	`bankAccountNumber` varchar(64),
	`inviteCode` varchar(32) NOT NULL,
	`invitedBy` int,
	`vipLevel` int NOT NULL DEFAULT 0,
	`kycVerified` boolean NOT NULL DEFAULT false,
	`lang` varchar(10) NOT NULL DEFAULT 'en',
	`isActive` boolean NOT NULL DEFAULT true,
	`middlewavePlayerId` varchar(128),
	`lastLoginAt` timestamp,
	`lastLoginIp` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `players_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_admin_telegram` UNIQUE(`adminId`,`telegramId`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tokenHash` varchar(256) NOT NULL,
	`accountType` enum('admin','player') NOT NULL,
	`accountId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `refresh_tokens_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `sub_account_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`module` varchar(64) NOT NULL,
	`canView` boolean NOT NULL DEFAULT false,
	`canEdit` boolean NOT NULL DEFAULT false,
	`canDelete` boolean NOT NULL DEFAULT false,
	CONSTRAINT `sub_account_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`settingKey` varchar(128) NOT NULL,
	`settingValue` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_admin_setting` UNIQUE(`adminId`,`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `telegram_bot_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`botId` int NOT NULL,
	`lang` varchar(10) NOT NULL DEFAULT 'en',
	`section` varchar(64) NOT NULL,
	`title` text,
	`body` text,
	`imageUrl` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_bot_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `telegram_bots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`botToken` varchar(256) NOT NULL,
	`botUsername` varchar(128),
	`botName` varchar(128),
	`isActive` boolean NOT NULL DEFAULT true,
	`webhookUrl` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_bots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `withdrawals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`adminId` int NOT NULL,
	`cycleId` int,
	`amount` decimal(14,4) NOT NULL,
	`bankName` varchar(128),
	`bankAccountName` varchar(128),
	`bankAccountNumber` varchar(64),
	`status` enum('pending','processing','approved','rejected') NOT NULL DEFAULT 'pending',
	`handledBy` int,
	`handleNote` text,
	`rejectionReason` text,
	`pointsRecovered` decimal(14,4),
	`usedBonus` boolean NOT NULL DEFAULT false,
	`rolloverMet` boolean NOT NULL DEFAULT false,
	`turnoverMet` boolean NOT NULL DEFAULT false,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `withdrawals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_player_status` ON `deposit_cycles` (`playerId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_player_deposits` ON `deposits` (`playerId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_admin_deposits` ON `deposits` (`adminId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_player_gamelogs` ON `game_logs_cache` (`playerId`,`provider`);--> statement-breakpoint
CREATE INDEX `idx_admin_gamelogs` ON `game_logs_cache` (`adminId`,`provider`);--> statement-breakpoint
CREATE INDEX `idx_invite_code` ON `players` (`inviteCode`);--> statement-breakpoint
CREATE INDEX `idx_player_withdrawals` ON `withdrawals` (`playerId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_admin_withdrawals` ON `withdrawals` (`adminId`,`status`);