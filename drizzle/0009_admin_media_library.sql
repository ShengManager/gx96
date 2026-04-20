CREATE TABLE `admin_media_library` (
  `id` int AUTO_INCREMENT NOT NULL,
  `adminId` int NOT NULL,
  `objectKey` varchar(512) NOT NULL,
  `publicUrl` text,
  `originalName` varchar(256),
  `contentType` varchar(128),
  `byteSize` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `admin_media_library_id` PRIMARY KEY(`id`),
  KEY `idx_admin_media_admin` (`adminId`)
);
