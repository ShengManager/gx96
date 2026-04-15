CREATE TABLE `domain_acl` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`domain` varchar(256) NOT NULL,
	`purpose` enum('admin','player','both') NOT NULL DEFAULT 'both',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `domain_acl_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_admin_domain` UNIQUE(`adminId`,`domain`)
);
--> statement-breakpoint
CREATE TABLE `frontend_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`templateId` varchar(64) NOT NULL DEFAULT 'default',
	`customCss` text,
	`customHeadHtml` text,
	`customBodyJs` text,
	`primaryColor` varchar(32),
	`logoUrl` text,
	`faviconUrl` text,
	`siteName` varchar(128),
	`footerText` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `frontend_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_admin_frontend` UNIQUE(`adminId`)
);
