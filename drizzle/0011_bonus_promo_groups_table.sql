CREATE TABLE IF NOT EXISTS `bonus_promo_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `adminId` int NOT NULL,
  `groupKey` varchar(128) NOT NULL,
  `title` varchar(256) DEFAULT NULL,
  `bannerUrl` text,
  `sortIndex` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bonus_promo_groups_admin_key` (`adminId`,`groupKey`),
  KEY `idx_bonus_promo_groups_admin` (`adminId`)
);

INSERT INTO `bonus_promo_groups` (`adminId`, `groupKey`, `title`, `bannerUrl`, `sortIndex`)
SELECT
  `adminId`,
  TRIM(`promoGroupKey`) AS `groupKey`,
  MAX(`promoGroupTitle`) AS `title`,
  MAX(`promoGroupBannerUrl`) AS `bannerUrl`,
  MIN(`promoGroupSort`) AS `sortIndex`
FROM `bonus_configs`
WHERE TRIM(`promoGroupKey`) <> ''
GROUP BY `adminId`, TRIM(`promoGroupKey`)
ON DUPLICATE KEY UPDATE
  `title` = COALESCE(VALUES(`title`), `bonus_promo_groups`.`title`),
  `bannerUrl` = COALESCE(NULLIF(VALUES(`bannerUrl`), ''), `bonus_promo_groups`.`bannerUrl`);
