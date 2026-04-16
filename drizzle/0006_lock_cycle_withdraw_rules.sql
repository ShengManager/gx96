ALTER TABLE `deposit_cycles`
ADD COLUMN `minWithdrawSnapshot` decimal(14,4) NULL,
ADD COLUMN `maxWithdrawSnapshot` decimal(14,4) NULL;
