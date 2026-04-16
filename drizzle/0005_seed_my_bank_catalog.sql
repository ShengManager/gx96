INSERT INTO `bank_catalog` (`country`, `bankCode`, `bankName`, `isActive`, `sortOrder`) VALUES
('MY', 'MBBEMYKL', 'Maybank', true, 10),
('MY', 'CIBBMYKL', 'CIMB Bank', true, 20),
('MY', 'PBBEMYKL', 'Public Bank', true, 30),
('MY', 'RHBBMYKL', 'RHB Bank', true, 40),
('MY', 'HLBBMYKL', 'Hong Leong Bank', true, 50),
('MY', 'UOVBMYKL', 'UOB Malaysia', true, 60),
('MY', 'OCBCMYKL', 'OCBC Bank Malaysia', true, 70),
('MY', 'AMMBMYKL', 'AmBank', true, 80),
('MY', 'BIMBMYKL', 'Bank Islam Malaysia', true, 90),
('MY', 'BSNMMYKL', 'Bank Simpanan Nasional', true, 100),
('MY', 'HLIBMYKL', 'Hong Leong Islamic Bank', true, 110),
('MY', 'AFBQMYKL', 'Affin Bank', true, 120),
('MY', 'ABMBMYKL', 'Alliance Bank Malaysia', true, 130),
('MY', 'CTBBMYKL', 'Citibank Malaysia', true, 140)
ON DUPLICATE KEY UPDATE
`bankName` = VALUES(`bankName`),
`isActive` = VALUES(`isActive`),
`sortOrder` = VALUES(`sortOrder`);

