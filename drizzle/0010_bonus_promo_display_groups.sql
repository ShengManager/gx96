ALTER TABLE `bonus_configs`
  ADD COLUMN `promoGroupKey` varchar(128) NOT NULL DEFAULT '',
  ADD COLUMN `promoGroupTitle` varchar(256),
  ADD COLUMN `promoGroupBannerUrl` text,
  ADD COLUMN `promoGroupSort` int NOT NULL DEFAULT 0;
