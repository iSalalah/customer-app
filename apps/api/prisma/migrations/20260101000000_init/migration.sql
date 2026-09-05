-- Initial schema for the Dhofar Municipality Self-Service Citizen Portal.
-- Generated to match prisma/schema.prisma. All DATETIME values are UTC.

-- CreateTable
CREATE TABLE `departments` (
    `id` CHAR(36) NOT NULL,
    `nameAr` VARCHAR(160) NOT NULL,
    `nameEn` VARCHAR(160) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departments_nameAr_key`(`nameAr`),
    UNIQUE INDEX `departments_nameEn_key`(`nameEn`),
    INDEX `departments_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sections` (
    `id` CHAR(36) NOT NULL,
    `departmentId` CHAR(36) NOT NULL,
    `nameAr` VARCHAR(160) NOT NULL,
    `nameEn` VARCHAR(160) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sections_departmentId_isActive_idx`(`departmentId`, `isActive`),
    UNIQUE INDEX `sections_departmentId_nameAr_key`(`departmentId`, `nameAr`),
    UNIQUE INDEX `sections_departmentId_nameEn_key`(`departmentId`, `nameEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `municipal_services` (
    `id` CHAR(36) NOT NULL,
    `departmentId` CHAR(36) NOT NULL,
    `sectionId` CHAR(36) NULL,
    `nameAr` VARCHAR(200) NOT NULL,
    `nameEn` VARCHAR(200) NOT NULL,
    `descriptionAr` VARCHAR(1000) NULL,
    `descriptionEn` VARCHAR(1000) NULL,
    `attachmentsRequired` BOOLEAN NOT NULL DEFAULT false,
    `minAttachments` SMALLINT NOT NULL DEFAULT 0,
    `maxAttachments` SMALLINT NOT NULL DEFAULT 5,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `municipal_services_departmentId_isActive_idx`(`departmentId`, `isActive`),
    INDEX `municipal_services_sectionId_idx`(`sectionId`),
    UNIQUE INDEX `municipal_services_departmentId_nameAr_key`(`departmentId`, `nameAr`),
    UNIQUE INDEX `municipal_services_departmentId_nameEn_key`(`departmentId`, `nameEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff` (
    `id` CHAR(36) NOT NULL,
    `nameAr` VARCHAR(160) NOT NULL,
    `nameEn` VARCHAR(160) NULL,
    `username` VARCHAR(64) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('MANAGER', 'SECTION_HEAD', 'EMPLOYEE') NOT NULL,
    `departmentId` CHAR(36) NOT NULL,
    `sectionId` CHAR(36) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `failedLoginCount` SMALLINT NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `staff_username_key`(`username`),
    INDEX `staff_departmentId_sectionId_isActive_idx`(`departmentId`, `sectionId`, `isActive`),
    INDEX `staff_role_isActive_idx`(`role`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_sessions` (
    `id` CHAR(36) NOT NULL,
    `staffId` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `familyId` CHAR(36) NOT NULL,
    `userAgent` VARCHAR(255) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `rotatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `staff_sessions_tokenHash_key`(`tokenHash`),
    INDEX `staff_sessions_staffId_revokedAt_idx`(`staffId`, `revokedAt`),
    INDEX `staff_sessions_familyId_idx`(`familyId`),
    INDEX `staff_sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `citizens` (
    `id` CHAR(36) NOT NULL,
    `phoneNumber` VARCHAR(20) NOT NULL,
    `civilIdEncrypted` VARCHAR(512) NULL,
    `civilIdHash` CHAR(64) NULL,
    `fullName` VARCHAR(160) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `citizens_phoneNumber_key`(`phoneNumber`),
    UNIQUE INDEX `citizens_civilIdHash_key`(`civilIdHash`),
    INDEX `citizens_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `citizen_sessions` (
    `id` CHAR(36) NOT NULL,
    `citizenId` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `kioskId` VARCHAR(64) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,
    `idleExpiresAt` DATETIME(3) NOT NULL,
    `absoluteExpiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `citizen_sessions_tokenHash_key`(`tokenHash`),
    INDEX `citizen_sessions_citizenId_revokedAt_idx`(`citizenId`, `revokedAt`),
    INDEX `citizen_sessions_idleExpiresAt_idx`(`idleExpiresAt`),
    INDEX `citizen_sessions_absoluteExpiresAt_idx`(`absoluteExpiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `otp_challenges` (
    `id` CHAR(36) NOT NULL,
    `phoneNumber` VARCHAR(20) NOT NULL,
    `codeHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `resendAvailableAt` DATETIME(3) NOT NULL,
    `attemptCount` SMALLINT NOT NULL DEFAULT 0,
    `maxAttempts` SMALLINT NOT NULL DEFAULT 5,
    `consumedAt` DATETIME(3) NULL,
    `invalidatedAt` DATETIME(3) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `otp_challenges_phoneNumber_createdAt_idx`(`phoneNumber`, `createdAt`),
    INDEX `otp_challenges_phoneNumber_consumedAt_invalidatedAt_idx`(`phoneNumber`, `consumedAt`, `invalidatedAt`),
    INDEX `otp_challenges_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `requests` (
    `id` CHAR(36) NOT NULL,
    `referenceNumber` VARCHAR(20) NOT NULL,
    `idempotencyKey` VARCHAR(80) NOT NULL,
    `citizenId` CHAR(36) NOT NULL,
    `serviceId` CHAR(36) NOT NULL,
    `departmentId` CHAR(36) NOT NULL,
    `sectionId` CHAR(36) NULL,
    `assignedTo` CHAR(36) NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'NEED_INFO', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `requests_referenceNumber_key`(`referenceNumber`),
    INDEX `requests_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `requests_departmentId_status_createdAt_idx`(`departmentId`, `status`, `createdAt`),
    INDEX `requests_sectionId_status_createdAt_idx`(`sectionId`, `status`, `createdAt`),
    INDEX `requests_assignedTo_status_createdAt_idx`(`assignedTo`, `status`, `createdAt`),
    INDEX `requests_citizenId_createdAt_idx`(`citizenId`, `createdAt`),
    INDEX `requests_serviceId_idx`(`serviceId`),
    INDEX `requests_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `requests_citizenId_idempotencyKey_key`(`citizenId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attachments` (
    `id` CHAR(36) NOT NULL,
    `requestId` CHAR(36) NOT NULL,
    `originalFileName` VARCHAR(255) NOT NULL,
    `storageKey` VARCHAR(255) NOT NULL,
    `storageProvider` ENUM('LOCAL', 'S3') NOT NULL DEFAULT 'LOCAL',
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `checksum` CHAR(64) NOT NULL,
    `scanStatus` ENUM('PENDING', 'CLEAN', 'INFECTED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `scannedAt` DATETIME(3) NULL,
    `uploadedByType` ENUM('CITIZEN', 'STAFF', 'SYSTEM') NOT NULL DEFAULT 'CITIZEN',
    `uploadedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `attachments_storageKey_key`(`storageKey`),
    INDEX `attachments_requestId_idx`(`requestId`),
    INDEX `attachments_checksum_idx`(`checksum`),
    INDEX `attachments_scanStatus_idx`(`scanStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `request_logs` (
    `id` CHAR(36) NOT NULL,
    `requestId` CHAR(36) NOT NULL,
    `actorType` ENUM('CITIZEN', 'STAFF', 'SYSTEM') NOT NULL,
    `staffId` CHAR(36) NULL,
    `citizenId` CHAR(36) NULL,
    `action` ENUM('CREATED', 'AUTO_ROUTED', 'ASSIGNED', 'REASSIGNED', 'STATUS_CHANGED', 'INTERNAL_NOTE_ADDED', 'CITIZEN_VISIBLE_NOTE_ADDED', 'CITIZEN_REPLIED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REJECTED') NOT NULL,
    `previousStatus` ENUM('PENDING', 'IN_PROGRESS', 'NEED_INFO', 'APPROVED', 'REJECTED') NULL,
    `newStatus` ENUM('PENDING', 'IN_PROGRESS', 'NEED_INFO', 'APPROVED', 'REJECTED') NULL,
    `visibility` ENUM('INTERNAL', 'CITIZEN_VISIBLE') NOT NULL DEFAULT 'INTERNAL',
    `notes` TEXT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `request_logs_requestId_createdAt_idx`(`requestId`, `createdAt`),
    INDEX `request_logs_requestId_visibility_createdAt_idx`(`requestId`, `visibility`, `createdAt`),
    INDEX `request_logs_staffId_createdAt_idx`(`staffId`, `createdAt`),
    INDEX `request_logs_action_createdAt_idx`(`action`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `authentication_audits` (
    `id` CHAR(36) NOT NULL,
    `actorType` ENUM('CITIZEN', 'STAFF') NOT NULL,
    `eventType` ENUM('STAFF_LOGIN_SUCCESS', 'STAFF_LOGIN_FAILURE', 'STAFF_LOGIN_LOCKED', 'STAFF_LOGOUT', 'STAFF_REFRESH_SUCCESS', 'STAFF_REFRESH_REUSE_DETECTED', 'CITIZEN_OTP_REQUESTED', 'CITIZEN_OTP_VERIFY_SUCCESS', 'CITIZEN_OTP_VERIFY_FAILURE', 'CITIZEN_LOGOUT', 'CITIZEN_SESSION_EXPIRED') NOT NULL,
    `actorId` CHAR(36) NULL,
    `identifier` VARCHAR(120) NULL,
    `success` BOOLEAN NOT NULL,
    `reason` VARCHAR(120) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `requestId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `authentication_audits_actorType_eventType_createdAt_idx`(`actorType`, `eventType`, `createdAt`),
    INDEX `authentication_audits_identifier_createdAt_idx`(`identifier`, `createdAt`),
    INDEX `authentication_audits_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sections` ADD CONSTRAINT `sections_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `municipal_services` ADD CONSTRAINT `municipal_services_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `municipal_services` ADD CONSTRAINT `municipal_services_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `sections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `staff_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `staff_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `sections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_sessions` ADD CONSTRAINT `staff_sessions_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `citizen_sessions` ADD CONSTRAINT `citizen_sessions_citizenId_fkey` FOREIGN KEY (`citizenId`) REFERENCES `citizens`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_citizenId_fkey` FOREIGN KEY (`citizenId`) REFERENCES `citizens`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `municipal_services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `sections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_assignedTo_fkey` FOREIGN KEY (`assignedTo`) REFERENCES `staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `request_logs` ADD CONSTRAINT `request_logs_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `request_logs` ADD CONSTRAINT `request_logs_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `request_logs` ADD CONSTRAINT `request_logs_citizenId_fkey` FOREIGN KEY (`citizenId`) REFERENCES `citizens`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
