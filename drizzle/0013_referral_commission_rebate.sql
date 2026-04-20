CREATE TABLE IF NOT EXISTS `referral_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `adminId` int NOT NULL,
  `commissionEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `inviteRewardEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `inviteRewardThreshold` int NOT NULL DEFAULT 0,
  `inviteRewardAmount` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `firstDepositRewardEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `firstDepositPercent` decimal(8,4) NOT NULL DEFAULT '0.0000',
  `firstDepositMaxAmount` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `rebateEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `rebatePercent` decimal(8,4) NOT NULL DEFAULT '0.0000',
  `rebateBase` enum('valid_bet','net_loss') NOT NULL DEFAULT 'valid_bet',
  `rebateMinBase` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_referral_rules_admin` (`adminId`)
);

CREATE TABLE IF NOT EXISTS `referral_ledger` (
  `id` int NOT NULL AUTO_INCREMENT,
  `adminId` int NOT NULL,
  `inviterPlayerId` int NOT NULL,
  `inviteePlayerId` int DEFAULT NULL,
  `rewardType` enum('invite_milestone','first_deposit_commission','rebate') NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `sourceDepositId` int DEFAULT NULL,
  `periodDate` varchar(32) DEFAULT NULL,
  `baseAmount` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `rewardAmount` decimal(14,4) NOT NULL DEFAULT '0.0000',
  `note` text,
  `extraMeta` json DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_referral_ledger_idem` (`adminId`, `idempotencyKey`),
  KEY `idx_referral_ledger_inviter` (`adminId`, `inviterPlayerId`, `createdAt`),
  KEY `idx_referral_ledger_type` (`adminId`, `rewardType`, `createdAt`)
);
