-- =====================================================================
-- Цахим виз мэдүүлгийн нэгдсэн веб программ (civiz) — бүрэн схем
-- Огноо: 2026-11-25 · MySQL 8.0+ · utf8mb4 / utf8mb4_unicode_ci · InnoDB
-- 26 хүснэгт · 44 FOREIGN KEY · 25 UNIQUE · 38 CHECK · 38 INDEX (PK-ээс гадна)
--
-- Migration 001–013-ийн ЭЦСИЙН ТӨЛӨВ: бүх migration-ыг түр санд ажиллуулж, mysqldump --no-data-аар
-- гаргасан CREATE TABLE-ууд. ER диаграм гаргах хэрэгсэлд (MySQL Workbench, dbdiagram.io, DBeaver,
-- drawSQL) зориулав. schema_migrations хүснэгт, AUTO_INCREMENT утгуудыг оруулаагүй.
--
-- ⚠ Ажиллаж буй сангийн эх сурвалж нь database/migrations/ хэвээр (npm run db:migrate).
--   Энэ файлыг migration-ын оронд бүү ашигла; хүснэгт байгаа санд ажиллуулбал "already exists" алдаа өгнө.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS civiz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE civiz;

-- ---------------------------------------------------------------------
-- 1. Хэрэглэгч ба нэвтрэлт
-- Эрх, хэрэглэгчийн бүртгэл, сесс, нэг удаагийн токен (BR-01, NFR-02).
-- ---------------------------------------------------------------------

CREATE TABLE `roles` (
  `role_id` tinyint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Эрхийн код: APPLICANT / OPERATOR / ADMIN',
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uq_roles_code` (`code`),
  CONSTRAINT `ck_roles_code` CHECK ((`code` in (_utf8mb4'APPLICANT',_utf8mb4'OPERATOR',_utf8mb4'ADMIN')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Хэрэглэгчийн эрх: APPLICANT, OPERATOR, ADMIN';

CREATE TABLE `users` (
  `user_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Гадагш харагдах UUID',
  `role_id` tinyint unsigned NOT NULL COMMENT 'Эрх → roles',
  `email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Нэвтрэх имэйл (давтагдашгүй)',
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Нууц үгийн bcrypt хэш',
  `display_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Харагдах нэр',
  `email_verified_at` datetime(6) DEFAULT NULL COMMENT 'Имэйл баталгаажсан огноо',
  `password_changed_at` datetime(6) DEFAULT NULL,
  `mfa_secret_enc` varbinary(256) DEFAULT NULL COMMENT 'TOTP нууц (AES-256-GCM шифрлэгдсэн)',
  `mfa_key_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mfa_enabled_at` datetime(6) DEFAULT NULL COMMENT '2FA идэвхжсэн огноо',
  `mfa_last_step` bigint DEFAULT NULL COMMENT 'Сүүлд ашигласан TOTP алхам (replay хамгаалалт)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Идэвхтэй эсэх',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Үүсгэсэн огноо',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_users_public_id` (`public_id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `ix_users_role_active` (`role_id`,`is_active`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Системийн хэрэглэгч (мэдүүлэгч, оператор, админ); нэг имэйл — нэг бүртгэл (BR-01)';

CREATE TABLE `user_sessions` (
  `session_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Сессийн UUID (JWT-д орно)',
  `user_id` bigint unsigned NOT NULL COMMENT '→ users.user_id',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Үүсгэсэн огноо',
  `last_seen_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `expires_at` datetime(6) NOT NULL COMMENT 'Хугацаа дуусах огноо',
  `revoked_at` datetime(6) DEFAULT NULL COMMENT 'Хүчингүй болгосон огноо',
  `user_agent` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`session_id`),
  KEY `ix_sessions_user` (`user_id`,`revoked_at`,`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Нэвтэрсэн сесс; JWT бүр session_id-тай, серверээс хүчингүй болгоно';

CREATE TABLE `user_tokens` (
  `token_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `user_id` bigint unsigned NOT NULL COMMENT '→ users.user_id',
  `purpose` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Зориулалт: VERIFY_EMAIL / RESET_PASSWORD / MFA_PENDING',
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Токены SHA-256 хэш',
  `attempts` tinyint unsigned NOT NULL DEFAULT '0' COMMENT 'Буруу оролдлогын тоо',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Үүсгэсэн огноо',
  `expires_at` datetime(6) NOT NULL COMMENT 'Хугацаа дуусах огноо',
  `used_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`token_id`),
  UNIQUE KEY `uq_tokens_hash` (`token_hash`),
  KEY `ix_tokens_user` (`user_id`,`purpose`,`used_at`),
  CONSTRAINT `fk_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `ck_tokens_purpose` CHECK ((`purpose` in (_utf8mb4'VERIFY_EMAIL',_utf8mb4'RESET_PASSWORD',_utf8mb4'MFA_PENDING')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Нэг удаагийн хугацаатай токен (имэйл баталгаажуулах, нууц үг сэргээх, 2FA завсрын алхам); зөвхөн SHA-256 хэш';

-- ---------------------------------------------------------------------
-- 2. Визийн лавлах
-- Улс → визийн төрөл → хувилбар → материалын шаардлага; баримтын төрлийн каталог (BR-04).
-- ---------------------------------------------------------------------

CREATE TABLE `countries` (
  `country_id` smallint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `iso_code` char(2) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ISO 3166-1 alpha-2 код',
  `name_mn` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Монгол нэр',
  `service_status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'COMING_SOON' COMMENT 'Үйлчилгээ: ACTIVE / COMING_SOON / DISABLED',
  `official_result_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Албан үр дүн шалгах портал (https)',
  PRIMARY KEY (`country_id`),
  UNIQUE KEY `uq_countries_iso` (`iso_code`),
  CONSTRAINT `ck_countries_status` CHECK ((`service_status` in (_utf8mb4'ACTIVE',_utf8mb4'COMING_SOON',_utf8mb4'DISABLED'))),
  CONSTRAINT `ck_countries_url` CHECK (((`official_result_url` is null) or (`official_result_url` like _utf8mb4'https://%')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Улс ба үйлчилгээний төлөв (эхний хувилбарт зөвхөн KR мэдүүлэг авна)';

CREATE TABLE `visa_types` (
  `visa_type_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `country_id` smallint unsigned NOT NULL COMMENT '→ countries.country_id',
  `code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Визийн код (жишээ: C-3-9)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`visa_type_id`),
  UNIQUE KEY `uq_visa_types_country_code` (`country_id`,`code`),
  CONSTRAINT `fk_visa_types_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`country_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Улс бүрийн визийн төрөл (жишээ: C-3-9)';

CREATE TABLE `visa_info_versions` (
  `version_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `visa_type_id` bigint unsigned NOT NULL COMMENT '→ visa_types.visa_type_id',
  `version_no` int unsigned NOT NULL COMMENT 'Хувилбарын дугаар',
  `name_mn` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Монгол нэр',
  `description` text COLLATE utf8mb4_unicode_ci,
  `source_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Албан эх сурвалжийн холбоос',
  `verified_at` date DEFAULT NULL COMMENT 'Эх сурвалжтай тулгаж шалгасан огноо',
  `verified_by` bigint unsigned DEFAULT NULL COMMENT '→ users.user_id',
  `created_by` bigint unsigned NOT NULL COMMENT '→ users.user_id',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Үүсгэсэн огноо',
  `published_at` datetime(6) DEFAULT NULL COMMENT 'Нийтэлсэн огноо (NULL = ноорог)',
  PRIMARY KEY (`version_id`),
  UNIQUE KEY `uq_versions_type_no` (`visa_type_id`,`version_no`),
  KEY `ix_versions_published` (`visa_type_id`,`published_at`),
  KEY `fk_versions_creator` (`created_by`),
  KEY `fk_versions_verifier` (`verified_by`),
  CONSTRAINT `fk_versions_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_versions_type` FOREIGN KEY (`visa_type_id`) REFERENCES `visa_types` (`visa_type_id`),
  CONSTRAINT `fk_versions_verifier` FOREIGN KEY (`verified_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `ck_versions_publish` CHECK (((`published_at` is null) or ((`source_url` is not null) and (`verified_at` is not null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Визийн мэдээллийн хувилбар; эх сурвалж + шалгасан огноогүй бол нийтлэхгүй, нийтэлснийг засахгүй (BR-04)';

CREATE TABLE `visa_requirements` (
  `requirement_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `version_id` bigint unsigned NOT NULL COMMENT '→ visa_info_versions.version_id',
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Шаардлагын код (хувилбар дотор давтагдашгүй)',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `instructions` text COLLATE utf8mb4_unicode_ci,
  `applies_to` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Хэнд хамаарах нөхцөл',
  `original_or_copy` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ORIGINAL / COPY / BOTH',
  `translation_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Хэл/орчуулгын шаардлага',
  `is_required` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Заавал эсэх',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'Эрэмбэ',
  PRIMARY KEY (`requirement_id`),
  UNIQUE KEY `uq_requirements_version_code` (`version_id`,`code`),
  KEY `ix_requirements_sort` (`version_id`,`sort_order`),
  CONSTRAINT `fk_requirements_version` FOREIGN KEY (`version_id`) REFERENCES `visa_info_versions` (`version_id`),
  CONSTRAINT `ck_requirements_original` CHECK (((`original_or_copy` is null) or (`original_or_copy` in (_utf8mb4'ORIGINAL',_utf8mb4'COPY',_utf8mb4'BOTH'))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Хувилбар бүрийн бүрдүүлэх материалын шаардлага';

CREATE TABLE `document_types` (
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Баримтын төрлийн код (жишээ: PASSPORT_COPY)',
  `name_mn` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Монгол нэр',
  `has_expiry` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Хүчинтэй хугацаатай эсэх',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'Эрэмбэ',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Баримтын төрлийн каталог (ангилал — визийн шаардлага биш)';

CREATE TABLE `requirement_document_types` (
  `requirement_id` bigint unsigned NOT NULL COMMENT '→ visa_requirements.requirement_id',
  `type_code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '→ document_types.code',
  PRIMARY KEY (`requirement_id`,`type_code`),
  KEY `ix_req_doc_types_type` (`type_code`),
  CONSTRAINT `fk_req_doc_types_requirement` FOREIGN KEY (`requirement_id`) REFERENCES `visa_requirements` (`requirement_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_req_doc_types_type` FOREIGN KEY (`type_code`) REFERENCES `document_types` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Шаардлага ↔ баримтын төрөл (олон-олон холбоо, D-61)';

-- ---------------------------------------------------------------------
-- 3. Мэдүүлэг
-- Мэдүүлэг, анкет (паспорт шифрлэгдсэн), системээс гадуур өгсөн мэдүүлгийн импорт (BR-06/07, NFR-05).
-- ---------------------------------------------------------------------

CREATE TABLE `applications` (
  `application_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Лавлах дугаар (жишээ: KR-20261105-XXXXXX)',
  `applicant_id` bigint unsigned NOT NULL COMMENT 'Мэдүүлэгч → users',
  `assigned_operator_id` bigint unsigned DEFAULT NULL COMMENT 'Хуваарилагдсан оператор → users',
  `version_id` bigint unsigned NOT NULL COMMENT 'Илгээх үеийн визийн мэдээллийн хувилбар',
  `idempotency_key` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Давхар илгээлтээс сэргийлэх түлхүүр (NFR-05)',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT / SUBMITTED / IN_REVIEW / INCOMPLETE / COMPLETE / DELIVERED',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Үүсгэсэн огноо',
  `submitted_at` datetime(6) DEFAULT NULL COMMENT 'Илгээсэн огноо',
  `archived_at` datetime(6) DEFAULT NULL COMMENT 'Архивласан огноо',
  `form_autosave_enc` varbinary(8192) DEFAULT NULL COMMENT 'Анкетын автомат хадгалсан ноорог (AES-256-GCM JSON)',
  `form_autosave_key_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `form_autosave_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`application_id`),
  UNIQUE KEY `uq_applications_public_id` (`public_id`),
  UNIQUE KEY `uq_applications_idem` (`applicant_id`,`idempotency_key`),
  KEY `ix_applications_owner` (`applicant_id`,`submitted_at`),
  KEY `ix_applications_operator` (`assigned_operator_id`,`status`),
  KEY `ix_applications_status` (`status`,`submitted_at`),
  KEY `fk_applications_version` (`version_id`),
  CONSTRAINT `fk_applications_applicant` FOREIGN KEY (`applicant_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_applications_operator` FOREIGN KEY (`assigned_operator_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_applications_version` FOREIGN KEY (`version_id`) REFERENCES `visa_info_versions` (`version_id`),
  CONSTRAINT `ck_applications_status` CHECK ((`status` in (_utf8mb4'DRAFT',_utf8mb4'SUBMITTED',_utf8mb4'IN_REVIEW',_utf8mb4'INCOMPLETE',_utf8mb4'COMPLETE',_utf8mb4'DELIVERED'))),
  CONSTRAINT `ck_applications_submitted` CHECK (((`status` = _utf8mb4'DRAFT') or (`submitted_at` is not null)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Визийн мэдүүлэг; нэг илгээлт — нэг дотоод дугаар, idempotency (BR-07, NFR-05)';

CREATE TABLE `application_forms` (
  `application_id` bigint unsigned NOT NULL COMMENT 'Мэдүүлэг → applications (1:1)',
  `family_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `given_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `birth_date` date NOT NULL,
  `nationality_code` char(2) COLLATE utf8mb4_unicode_ci NOT NULL,
  `passport_number_enc` varbinary(512) NOT NULL COMMENT 'Паспортын дугаар (AES-256-GCM шифрлэгдсэн)',
  `passport_key_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Паспортын шифрлэлтийн түлхүүрийн ID',
  `passport_expires_on` date NOT NULL COMMENT 'Паспортын хүчинтэй хугацаа',
  `contact_email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_phone` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `travel_purpose` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Зорчих зорилго',
  `intended_entry_on` date NOT NULL,
  `intended_exit_on` date NOT NULL,
  `extra_fields` json DEFAULT NULL COMMENT 'Нэмэлт талбарууд (JSON)',
  PRIMARY KEY (`application_id`),
  CONSTRAINT `fk_forms_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`) ON DELETE CASCADE,
  CONSTRAINT `ck_forms_dates` CHECK ((`intended_exit_on` >= `intended_entry_on`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Мэдүүлгийн анкет (мэдүүлэгтэй 1:1); паспортын дугаар AES-256-GCM';

CREATE TABLE `imported_applications` (
  `import_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Гадагш харагдах UUID',
  `applicant_id` bigint unsigned NOT NULL COMMENT '→ users.user_id',
  `idempotency_key` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Давхар илгээлтээс сэргийлэх түлхүүр (NFR-05)',
  `country_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `visa_category` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `applied_on` date NOT NULL,
  `authority` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `official_ref` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `outcome` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NOT_CHECKED' COMMENT 'NOT_CHECKED / PENDING / APPROVED / REFUSED (мэдүүлэгчийн мэдээлснээр)',
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Үүсгэсэн огноо',
  PRIMARY KEY (`import_id`),
  UNIQUE KEY `uq_imports_public_id` (`public_id`),
  UNIQUE KEY `uq_imports_idem` (`applicant_id`,`idempotency_key`),
  KEY `ix_imports_owner` (`applicant_id`,`applied_on`),
  CONSTRAINT `fk_imports_applicant` FOREIGN KEY (`applicant_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `ck_imports_outcome` CHECK ((`outcome` in (_utf8mb4'NOT_CHECKED',_utf8mb4'PENDING',_utf8mb4'APPROVED',_utf8mb4'REFUSED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Системээс гадуур өгсөн өмнөх мэдүүлэг — мэдүүлэгч өөрөө нэмсэн, баталгаажаагүй';

-- ---------------------------------------------------------------------
-- 4. Хяналт ба үр дүн
-- Бүрдлийн үнэлгээ, нэмэлт материалын багц, хавсралт файл, нотолгоо, хүргүүлсэн бүртгэл, албан үр дүн ба тулгалт.
-- application_documents нь application_supplements-ээс хамаардаг тул FK-ийн дарааллаар энд байрлана (BR-05, BR-09).
-- ---------------------------------------------------------------------

CREATE TABLE `reviews` (
  `review_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `application_id` bigint unsigned NOT NULL COMMENT '→ applications.application_id',
  `operator_id` bigint unsigned NOT NULL COMMENT '→ users.user_id',
  `review_no` int unsigned NOT NULL COMMENT 'Үнэлгээний дараалал (мэдүүлэг дотор)',
  `completeness` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'COMPLETE (Бүрэн) / INCOMPLETE (Дутуу) — визийн шийдвэр биш',
  `comment` text COLLATE utf8mb4_unicode_ci COMMENT 'Тайлбар (Дутуу бол заавал)',
  `reviewed_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`review_id`),
  UNIQUE KEY `uq_reviews_app_no` (`application_id`,`review_no`),
  KEY `ix_reviews_operator` (`operator_id`,`reviewed_at`),
  CONSTRAINT `fk_reviews_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`),
  CONSTRAINT `fk_reviews_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `ck_reviews_comment` CHECK (((`completeness` = _utf8mb4'COMPLETE') or ((`comment` is not null) and (char_length(`comment`) > 0)))),
  CONSTRAINT `ck_reviews_completeness` CHECK ((`completeness` in (_utf8mb4'COMPLETE',_utf8mb4'INCOMPLETE')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Операторын бүрдлийн үнэлгээ (Бүрэн/Дутуу); зөвхөн нэмэгдэнэ, визийн шийдвэр биш (BR-09)';

CREATE TABLE `application_supplements` (
  `supplement_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `application_id` bigint unsigned NOT NULL COMMENT '→ applications.application_id',
  `round_no` int unsigned NOT NULL COMMENT 'Нэмэлт материалын давталт',
  `review_id` bigint unsigned NOT NULL COMMENT '“Дутуу” үнэлгээ → reviews',
  `status` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT / SUBMITTED',
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Үүсгэсэн огноо',
  `submitted_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`supplement_id`),
  UNIQUE KEY `uq_supplements_app_round` (`application_id`,`round_no`),
  UNIQUE KEY `uq_supplements_review` (`review_id`),
  CONSTRAINT `fk_supplements_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_supplements_review` FOREIGN KEY (`review_id`) REFERENCES `reviews` (`review_id`),
  CONSTRAINT `ck_supplements_status` CHECK ((`status` in (_utf8mb4'DRAFT',_utf8mb4'SUBMITTED'))),
  CONSTRAINT `ck_supplements_submitted` CHECK (((`status` = _utf8mb4'DRAFT') or (`submitted_at` is not null)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='“Дутуу” үнэлгээний дараах нэмэлт материалын багц (нэг үнэлгээнд нэг)';

CREATE TABLE `application_documents` (
  `document_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `application_id` bigint unsigned NOT NULL COMMENT '→ applications.application_id',
  `version_id` bigint unsigned NOT NULL COMMENT 'Хавсаргасан үеийн хувилбар → visa_info_versions',
  `requirement_id` bigint unsigned NOT NULL COMMENT 'Аль шаардлагад → visa_requirements',
  `supplement_id` bigint unsigned DEFAULT NULL COMMENT 'Нэмэлт багц → application_supplements (NULL = анхны илгээлт)',
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Байршуулсан файлын нэр',
  `storage_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Файлын сан дахь түлхүүр (зам биш)',
  `mime_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'application/pdf / image/jpeg / image/png',
  `size_bytes` bigint unsigned NOT NULL COMMENT 'Файлын хэмжээ, байт (≤10 MB)',
  `sha256` char(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Файлын SHA-256 хэш',
  `scan_status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING' COMMENT 'Вирус шалгалт: PENDING / ACCEPTED / REJECTED',
  `source_profile_document_id` bigint unsigned DEFAULT NULL COMMENT 'Хуулагдсан профайлын баримт (FK-гүй — профайлын баримт устсан ч хэвээр)',
  `scanned_at` datetime(6) DEFAULT NULL,
  `uploaded_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`document_id`),
  UNIQUE KEY `uq_documents_storage_key` (`storage_key`),
  KEY `ix_documents_application` (`application_id`,`requirement_id`),
  KEY `fk_documents_version` (`version_id`),
  KEY `fk_documents_requirement` (`requirement_id`),
  KEY `ix_documents_supplement` (`supplement_id`),
  KEY `ix_documents_scan` (`scan_status`),
  CONSTRAINT `fk_documents_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_documents_requirement` FOREIGN KEY (`requirement_id`) REFERENCES `visa_requirements` (`requirement_id`),
  CONSTRAINT `fk_documents_supplement` FOREIGN KEY (`supplement_id`) REFERENCES `application_supplements` (`supplement_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_documents_version` FOREIGN KEY (`version_id`) REFERENCES `visa_info_versions` (`version_id`),
  CONSTRAINT `ck_documents_mime` CHECK ((`mime_type` in (_utf8mb4'application/pdf',_utf8mb4'image/jpeg',_utf8mb4'image/png'))),
  CONSTRAINT `ck_documents_scan` CHECK ((`scan_status` in (_utf8mb4'PENDING',_utf8mb4'ACCEPTED',_utf8mb4'REJECTED'))),
  CONSTRAINT `ck_documents_size` CHECK (((`size_bytes` > 0) and (`size_bytes` <= 10485760)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Мэдүүлгийн хавсралт файл: PDF/JPG/PNG, ≤10 MB (BR-05)';

CREATE TABLE `evidence_files` (
  `file_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `kind` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'HANDOVER / OFFICIAL_RESULT / IMPORT',
  `application_id` bigint unsigned DEFAULT NULL COMMENT '→ applications.application_id',
  `import_id` bigint unsigned DEFAULT NULL COMMENT '→ imported_applications.import_id',
  `uploaded_by` bigint unsigned NOT NULL COMMENT 'Байршуулсан хэрэглэгч → users',
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Байршуулсан файлын нэр',
  `storage_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Файлын сан дахь түлхүүр (зам биш)',
  `mime_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'application/pdf / image/jpeg / image/png',
  `size_bytes` bigint unsigned NOT NULL COMMENT 'Файлын хэмжээ, байт (≤10 MB)',
  `sha256` char(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Файлын SHA-256 хэш',
  `scan_status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACCEPTED' COMMENT 'Вирус шалгалт: PENDING / ACCEPTED / REJECTED',
  `scanned_at` datetime(6) DEFAULT NULL,
  `uploaded_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`file_id`),
  UNIQUE KEY `uq_evidence_storage_key` (`storage_key`),
  KEY `ix_evidence_application` (`application_id`),
  KEY `ix_evidence_import` (`import_id`),
  KEY `fk_evidence_uploader` (`uploaded_by`),
  KEY `ix_evidence_scan` (`scan_status`),
  CONSTRAINT `fk_evidence_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`),
  CONSTRAINT `fk_evidence_import` FOREIGN KEY (`import_id`) REFERENCES `imported_applications` (`import_id`),
  CONSTRAINT `fk_evidence_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `ck_evidence_kind` CHECK ((`kind` in (_utf8mb4'HANDOVER',_utf8mb4'OFFICIAL_RESULT',_utf8mb4'IMPORT'))),
  CONSTRAINT `ck_evidence_mime` CHECK ((`mime_type` in (_utf8mb4'application/pdf',_utf8mb4'image/jpeg',_utf8mb4'image/png'))),
  CONSTRAINT `ck_evidence_owner` CHECK ((((`kind` = _utf8mb4'IMPORT') and (`import_id` is not null) and (`application_id` is null)) or ((`kind` <> _utf8mb4'IMPORT') and (`application_id` is not null) and (`import_id` is null)))),
  CONSTRAINT `ck_evidence_scan` CHECK ((`scan_status` in (_utf8mb4'PENDING',_utf8mb4'ACCEPTED',_utf8mb4'REJECTED'))),
  CONSTRAINT `ck_evidence_size` CHECK (((`size_bytes` > 0) and (`size_bytes` <= 10485760)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Нотолгоо файл: хүргүүлсэн баримт, албан үр дүнгийн баримт, импортын баримт';

CREATE TABLE `application_handovers` (
  `handover_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `application_id` bigint unsigned NOT NULL COMMENT '→ applications.application_id',
  `operator_id` bigint unsigned NOT NULL COMMENT 'Хүргүүлсэн оператор → users',
  `authority` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Хүлээн авсан байгууллага',
  `official_ref` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Албан бүртгэлийн дугаар',
  `delivered_on` date NOT NULL,
  `evidence_file_id` bigint unsigned NOT NULL COMMENT 'Хүргүүлсэн нотолгоо → evidence_files',
  `note` text COLLATE utf8mb4_unicode_ci,
  `recorded_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`handover_id`),
  UNIQUE KEY `uq_handovers_application` (`application_id`),
  UNIQUE KEY `uq_handovers_evidence` (`evidence_file_id`),
  KEY `fk_handovers_operator` (`operator_id`),
  CONSTRAINT `fk_handovers_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`),
  CONSTRAINT `fk_handovers_evidence` FOREIGN KEY (`evidence_file_id`) REFERENCES `evidence_files` (`file_id`),
  CONSTRAINT `fk_handovers_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `ck_handovers_ref` CHECK (((char_length(`official_ref`) > 0) and (char_length(`authority`) > 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Эрх бүхий байгууллагад хүргүүлсэн бүртгэл (мэдүүлэг бүрт нэг)';

CREATE TABLE `official_results` (
  `result_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `application_id` bigint unsigned NOT NULL COMMENT '→ applications.application_id',
  `entry_no` int unsigned NOT NULL COMMENT 'Бүртгэлийн дараалал (мэдүүлэг дотор)',
  `idempotency_key` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Давхар илгээлтээс сэргийлэх түлхүүр (NFR-05)',
  `outcome` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'PENDING / APPROVED / REFUSED (мэдүүлэгчийн мэдээлснээр)',
  `checked_on` date NOT NULL COMMENT 'Порталаас шалгасан огноо',
  `source` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Эх сурвалжийн нэр',
  `source_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_file_id` bigint unsigned DEFAULT NULL COMMENT '→ evidence_files.file_id',
  `recorded_by` bigint unsigned NOT NULL COMMENT 'Бүртгэсэн мэдүүлэгч → users',
  `recorded_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`result_id`),
  UNIQUE KEY `uq_results_app_entry` (`application_id`,`entry_no`),
  UNIQUE KEY `uq_results_idem` (`application_id`,`idempotency_key`),
  UNIQUE KEY `uq_results_evidence` (`evidence_file_id`),
  KEY `fk_results_recorder` (`recorded_by`),
  CONSTRAINT `fk_results_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`),
  CONSTRAINT `fk_results_evidence` FOREIGN KEY (`evidence_file_id`) REFERENCES `evidence_files` (`file_id`),
  CONSTRAINT `fk_results_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `ck_results_outcome` CHECK ((`outcome` in (_utf8mb4'PENDING',_utf8mb4'APPROVED',_utf8mb4'REFUSED'))),
  CONSTRAINT `ck_results_url` CHECK (((`source_url` is null) or (`source_url` like _utf8mb4'https://%')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Мэдүүлэгчийн мэдээлсэн албан үр дүн; зөвхөн нэмэгдэнэ, системийн шийдвэр биш (D-13)';

CREATE TABLE `official_result_verifications` (
  `verification_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `result_id` bigint unsigned NOT NULL COMMENT '→ official_results.result_id',
  `operator_id` bigint unsigned NOT NULL COMMENT 'Тулгасан оператор → users',
  `verdict` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'MATCHES / MISMATCH',
  `note` text COLLATE utf8mb4_unicode_ci,
  `verified_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`verification_id`),
  UNIQUE KEY `uq_verifications_result` (`result_id`),
  KEY `fk_verifications_operator` (`operator_id`),
  CONSTRAINT `fk_verifications_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_verifications_result` FOREIGN KEY (`result_id`) REFERENCES `official_results` (`result_id`),
  CONSTRAINT `ck_verifications_note` CHECK (((`verdict` = _utf8mb4'MATCHES') or ((`note` is not null) and (char_length(`note`) > 0)))),
  CONSTRAINT `ck_verifications_verdict` CHECK ((`verdict` in (_utf8mb4'MATCHES',_utf8mb4'MISMATCH')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Оператор албан үр дүнг нотолгоотой тулгасан тэмдэглэл (D-14)';

-- ---------------------------------------------------------------------
-- 5. Профайл ба бичиг баримтын сан
-- Мэдүүлэгт ХУУЛЖ ашиглах хувийн мэдээлэл ба баримтууд; оператор/админд харагдахгүй.
-- ---------------------------------------------------------------------

CREATE TABLE `applicant_profiles` (
  `user_id` bigint unsigned NOT NULL COMMENT 'Мэдүүлэгч → users (1:1)',
  `family_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `given_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `sex` char(1) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nationality_code` char(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `marital_status` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'SINGLE / MARRIED / DIVORCED / WIDOWED',
  `passport_number_enc` varbinary(512) DEFAULT NULL COMMENT 'Паспортын дугаар (AES-256-GCM шифрлэгдсэн)',
  `passport_key_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Паспортын шифрлэлтийн түлхүүрийн ID',
  `passport_issued_on` date DEFAULT NULL,
  `passport_expires_on` date DEFAULT NULL COMMENT 'Паспортын хүчинтэй хугацаа',
  `contact_email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `home_address` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `occupation` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employer_or_school` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `ck_profiles_marital` CHECK (((`marital_status` is null) or (`marital_status` in (_utf8mb4'SINGLE',_utf8mb4'MARRIED',_utf8mb4'DIVORCED',_utf8mb4'WIDOWED')))),
  CONSTRAINT `ck_profiles_passport` CHECK (((`passport_number_enc` is null) = (`passport_key_id` is null))),
  CONSTRAINT `ck_profiles_passport_dates` CHECK (((`passport_issued_on` is null) or (`passport_expires_on` is null) or (`passport_expires_on` > `passport_issued_on`))),
  CONSTRAINT `ck_profiles_sex` CHECK (((`sex` is null) or (`sex` in (_utf8mb4'M',_utf8mb4'F'))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Мэдүүлэгчийн профайл — мэдүүлэгт хуулж ашиглах хувийн мэдээлэл (паспорт шифрлэгдсэн)';

CREATE TABLE `profile_documents` (
  `document_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `user_id` bigint unsigned NOT NULL COMMENT '→ users.user_id',
  `type_code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Баримтын төрөл → document_types',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Байршуулсан файлын нэр',
  `storage_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Файлын сан дахь түлхүүр (зам биш)',
  `mime_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'application/pdf / image/jpeg / image/png',
  `size_bytes` bigint unsigned NOT NULL COMMENT 'Файлын хэмжээ, байт (≤10 MB)',
  `sha256` char(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Файлын SHA-256 хэш',
  `scan_status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING' COMMENT 'Вирус шалгалт: PENDING / ACCEPTED / REJECTED',
  `scanned_at` datetime(6) DEFAULT NULL,
  `issued_on` date DEFAULT NULL,
  `valid_until` date DEFAULT NULL COMMENT 'Хүчинтэй хугацаа',
  `uploaded_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`document_id`),
  UNIQUE KEY `uq_profile_docs_storage_key` (`storage_key`),
  KEY `ix_profile_docs_user` (`user_id`,`type_code`),
  KEY `fk_profile_docs_type` (`type_code`),
  CONSTRAINT `fk_profile_docs_type` FOREIGN KEY (`type_code`) REFERENCES `document_types` (`code`),
  CONSTRAINT `fk_profile_docs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `ck_profile_docs_dates` CHECK (((`issued_on` is null) or (`valid_until` is null) or (`valid_until` >= `issued_on`))),
  CONSTRAINT `ck_profile_docs_mime` CHECK ((`mime_type` in (_utf8mb4'application/pdf',_utf8mb4'image/jpeg',_utf8mb4'image/png'))),
  CONSTRAINT `ck_profile_docs_scan` CHECK ((`scan_status` in (_utf8mb4'PENDING',_utf8mb4'ACCEPTED',_utf8mb4'REJECTED'))),
  CONSTRAINT `ck_profile_docs_size` CHECK (((`size_bytes` > 0) and (`size_bytes` <= 10485760)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Мэдүүлэгчийн бичиг баримтын сан (зөвхөн эзэмшигч хандана)';

-- ---------------------------------------------------------------------
-- 6. Аюулгүй байдал, аудит, мэдэгдэл
-- 2FA нөөц код, үйлдлийн бүртгэл, бүртгэл устгах хүсэлт, мэдэгдэл/имэйлийн outbox.
-- ---------------------------------------------------------------------

CREATE TABLE `mfa_recovery_codes` (
  `code_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `user_id` bigint unsigned NOT NULL COMMENT '→ users.user_id',
  `code_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Нөөц кодын SHA-256 хэш',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Үүсгэсэн огноо',
  `used_at` datetime(6) DEFAULT NULL COMMENT 'Ашигласан огноо (нэг удаа)',
  PRIMARY KEY (`code_id`),
  UNIQUE KEY `uq_recovery_user_hash` (`user_id`,`code_hash`),
  CONSTRAINT `fk_recovery_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ажилтны 2FA-ийн нэг удаагийн нөөц код (SHA-256 хэш)';

CREATE TABLE `audit_events` (
  `event_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `actor_id` bigint unsigned DEFAULT NULL COMMENT 'Үйлдэл хийсэн хэрэглэгч → users',
  `application_id` bigint unsigned DEFAULT NULL COMMENT '→ applications.application_id',
  `action` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Үйлдлийн код',
  `entity_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Объектын төрөл',
  `entity_key` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Объектын түлхүүр (агуулга биш)',
  `request_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'HTTP хүсэлтийн ID',
  `occurred_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`event_id`),
  KEY `ix_audit_time` (`occurred_at`),
  KEY `ix_audit_actor` (`actor_id`,`occurred_at`),
  KEY `ix_audit_action` (`action`,`occurred_at`),
  KEY `fk_audit_application` (`application_id`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_audit_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Үйлдлийн бүртгэл; нууц үг, паспорт, анкетын агуулга, файлын зам хадгалахгүй';

CREATE TABLE `account_deletion_requests` (
  `request_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `user_id` bigint unsigned NOT NULL COMMENT '→ users.user_id',
  `status` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING / APPROVED / REJECTED / CANCELLED',
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requested_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `decided_by` bigint unsigned DEFAULT NULL COMMENT 'Шийдвэрлэсэн админ → users',
  `decided_at` datetime(6) DEFAULT NULL,
  `decision_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  KEY `ix_deletion_status` (`status`,`requested_at`),
  KEY `ix_deletion_user` (`user_id`,`status`),
  KEY `fk_deletion_decider` (`decided_by`),
  CONSTRAINT `fk_deletion_decider` FOREIGN KEY (`decided_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_deletion_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `ck_deletion_decided` CHECK (((`status` in (_utf8mb4'PENDING',_utf8mb4'CANCELLED')) or ((`decided_by` is not null) and (`decided_at` is not null)))),
  CONSTRAINT `ck_deletion_status` CHECK ((`status` in (_utf8mb4'PENDING',_utf8mb4'APPROVED',_utf8mb4'REJECTED',_utf8mb4'CANCELLED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Бүртгэл/хувийн мэдээлэл устгах хүсэлт (мэдүүлэгч гаргана, админ шийдвэрлэнэ)';

CREATE TABLE `notifications` (
  `notification_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Анхдагч түлхүүр',
  `user_id` bigint unsigned NOT NULL COMMENT '→ users.user_id',
  `kind` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Мэдэгдлийн төрөл (lib/notify.js KINDS)',
  `application_id` bigint unsigned DEFAULT NULL COMMENT '→ applications.application_id',
  `ref` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Лавлах дугаар',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Үүсгэсэн огноо',
  `read_at` datetime(6) DEFAULT NULL,
  `email_status` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING' COMMENT 'Имэйл: PENDING / SENT / FAILED / SKIPPED',
  `email_attempts` tinyint unsigned NOT NULL DEFAULT '0',
  `emailed_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`notification_id`),
  KEY `ix_notifications_user` (`user_id`,`read_at`,`created_at`),
  KEY `ix_notifications_outbox` (`email_status`,`created_at`),
  KEY `fk_notifications_application` (`application_id`),
  CONSTRAINT `fk_notifications_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `ck_notifications_email` CHECK ((`email_status` in (_utf8mb4'PENDING',_utf8mb4'SENT',_utf8mb4'FAILED',_utf8mb4'SKIPPED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Систем доторх мэдэгдэл + имэйлийн outbox (текстгүй — зөвхөн kind + лавлах дугаар)';

-- ---------------------------------------------------------------------
-- Лавлах өгөгдөл (migration 001: roles, 012: document_types-аар ордог)
-- ---------------------------------------------------------------------

INSERT INTO `roles` (`role_id`, `code`) VALUES (3,'ADMIN');
INSERT INTO `roles` (`role_id`, `code`) VALUES (1,'APPLICANT');
INSERT INTO `roles` (`role_id`, `code`) VALUES (2,'OPERATOR');
INSERT INTO `document_types` (`code`, `name_mn`, `has_expiry`, `sort_order`, `is_active`) VALUES ('BANK_STATEMENT','Банкны хуулга / дансны үлдэгдэл',1,40,1);
INSERT INTO `document_types` (`code`, `name_mn`, `has_expiry`, `sort_order`, `is_active`) VALUES ('EMPLOYMENT_CERT','Ажлын газрын тодорхойлолт',1,30,1);
INSERT INTO `document_types` (`code`, `name_mn`, `has_expiry`, `sort_order`, `is_active`) VALUES ('FAMILY_CERT','Гэр бүлийн лавлагаа (гэрлэлт, төрсний)',1,50,1);
INSERT INTO `document_types` (`code`, `name_mn`, `has_expiry`, `sort_order`, `is_active`) VALUES ('OTHER','Бусад баримт',1,90,1);
INSERT INTO `document_types` (`code`, `name_mn`, `has_expiry`, `sort_order`, `is_active`) VALUES ('PASSPORT_COPY','Гадаад паспортын хуулбар',1,10,1);
INSERT INTO `document_types` (`code`, `name_mn`, `has_expiry`, `sort_order`, `is_active`) VALUES ('PHOTO','Цээж зураг (3.5 × 4.5 см)',0,20,1);
INSERT INTO `document_types` (`code`, `name_mn`, `has_expiry`, `sort_order`, `is_active`) VALUES ('SCHOOL_CERT','Сургуулийн тодорхойлолт / диплом',1,60,1);

SET FOREIGN_KEY_CHECKS = 1;
