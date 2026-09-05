-- Runs once, on first container start, as root.
--
-- Creates two extra databases beside the application one:
--
--   *_test    the isolated database the Jest integration suites use, so tests
--             never share a schema with development data.
--
--   *_shadow  the scratch database `prisma migrate dev` needs to diff the schema.
--             Prisma would normally create it on the fly, but that requires the
--             CREATE DATABASE privilege, which the application user must not
--             have. Creating it here keeps that privilege off the app account.

CREATE DATABASE IF NOT EXISTS `dhofar_portal_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `dhofar_portal_shadow`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `dhofar_portal`.* TO 'dhofar'@'%';
GRANT ALL PRIVILEGES ON `dhofar_portal_test`.* TO 'dhofar'@'%';
GRANT ALL PRIVILEGES ON `dhofar_portal_shadow`.* TO 'dhofar'@'%';

FLUSH PRIVILEGES;
