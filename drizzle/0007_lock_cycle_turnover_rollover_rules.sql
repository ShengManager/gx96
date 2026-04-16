ALTER TABLE `deposit_cycles`
ADD COLUMN `rolloverMultiplierSnapshot` decimal(10,4) NULL,
ADD COLUMN `turnoverMultiplierSnapshot` decimal(10,4) NULL;
