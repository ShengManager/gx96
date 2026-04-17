ALTER TABLE `bonus_configs`
ADD COLUMN `ruleVersion` int NOT NULL DEFAULT 1;

ALTER TABLE `player_bonuses`
ADD COLUMN `idempotencyKey` varchar(128) NULL,
ADD COLUMN `claimPeriodKey` varchar(64) NULL,
ADD COLUMN `sourceEvent` varchar(64) NULL DEFAULT 'manual_claim',
ADD COLUMN `sourceRef` varchar(128) NULL,
ADD COLUMN `ruleVersion` int NOT NULL DEFAULT 1,
ADD COLUMN `claimMeta` json NULL;

CREATE UNIQUE INDEX `uq_bonus_claim_idempotency`
ON `player_bonuses` (`adminId`, `playerId`, `bonusConfigId`, `idempotencyKey`);

CREATE INDEX `idx_bonus_claim_period`
ON `player_bonuses` (`adminId`, `playerId`, `bonusConfigId`, `claimPeriodKey`);

CREATE TABLE `bonus_ledger` (
  `id` int NOT NULL AUTO_INCREMENT,
  `adminId` int NOT NULL,
  `playerId` int NOT NULL,
  `bonusConfigId` int NOT NULL,
  `playerBonusId` int NULL,
  `eventType` enum('claim_attempt','claim_awarded','claim_rejected','claim_duplicate') NOT NULL,
  `status` enum('success','failed') NOT NULL,
  `idempotencyKey` varchar(128) NULL,
  `claimPeriodKey` varchar(64) NULL,
  `ruleVersion` int NULL,
  `requestSource` varchar(64) NULL,
  `reasonCode` varchar(64) NULL,
  `message` text NULL,
  `inputSnapshot` json NULL,
  `outputSnapshot` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE INDEX `idx_bonus_ledger_claim`
ON `bonus_ledger` (`adminId`, `playerId`, `bonusConfigId`, `createdAt`);

CREATE INDEX `idx_bonus_ledger_idem`
ON `bonus_ledger` (`idempotencyKey`);
