CREATE TABLE `bank_catalog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`country` varchar(10) NOT NULL,
	`bankCode` varchar(32) NOT NULL,
	`bankName` varchar(128) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `bank_catalog_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_country_code` UNIQUE(`country`,`bankCode`)
);
