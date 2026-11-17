-- =====================================================================
-- Migration 001 — анхны схем
-- Цахим виз мэдүүлгийн нэгдсэн веб программ · MySQL 8.0+ / MariaDB 10.6+
-- 11 хүснэгт (Зураг 36-д нийцүүлсэн). Энэ файлыг өөрчлөхгүй — шинэ өөрчлөлтийг
-- дараагийн дугаартай migration-оор нэмнэ (migrate.js нь checksum-аар шалгана).
-- =====================================================================
SET NAMES utf8mb4;

-- 1. Эрх ------------------------------------------------------------------
CREATE TABLE roles (
  role_id   TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code      VARCHAR(20)      NOT NULL,
  PRIMARY KEY (role_id),
  UNIQUE KEY uq_roles_code (code),
  CONSTRAINT ck_roles_code CHECK (code IN ('APPLICANT','OPERATOR','ADMIN'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Хэрэглэгч (BR-01: нэг имэйл — нэг бүртгэл; NFR-02: хэш) --------------
CREATE TABLE users (
  user_id        BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  public_id      CHAR(36)         NOT NULL,
  role_id        TINYINT UNSIGNED NOT NULL,
  email          VARCHAR(254)     NOT NULL,
  password_hash  VARCHAR(255)     NOT NULL,
  display_name   VARCHAR(150)     NOT NULL,
  is_active      BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at     DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_public_id (public_id),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_role_active (role_id, is_active),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Улс ------------------------------------------------------------------
CREATE TABLE countries (
  country_id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  iso_code            CHAR(2)           NOT NULL,
  name_mn             VARCHAR(100)      NOT NULL,
  service_status      VARCHAR(20)       NOT NULL DEFAULT 'COMING_SOON',
  official_result_url VARCHAR(2048)     NULL,
  PRIMARY KEY (country_id),
  UNIQUE KEY uq_countries_iso (iso_code),
  CONSTRAINT ck_countries_status CHECK (service_status IN ('ACTIVE','COMING_SOON','DISABLED')),
  CONSTRAINT ck_countries_url CHECK (official_result_url IS NULL OR official_result_url LIKE 'https://%')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Визийн төрөл ---------------------------------------------------------
CREATE TABLE visa_types (
  visa_type_id BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  country_id   SMALLINT UNSIGNED NOT NULL,
  code         VARCHAR(30)       NOT NULL,
  is_active    BOOLEAN           NOT NULL DEFAULT TRUE,
  PRIMARY KEY (visa_type_id),
  UNIQUE KEY uq_visa_types_country_code (country_id, code),
  CONSTRAINT fk_visa_types_country FOREIGN KEY (country_id) REFERENCES countries (country_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Визийн мэдээллийн хувилбар (BR-04: эх сурвалж, огноогүй бол нийтлэхгүй)
CREATE TABLE visa_info_versions (
  version_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  visa_type_id  BIGINT UNSIGNED NOT NULL,
  version_no    INT UNSIGNED    NOT NULL,
  name_mn       VARCHAR(180)    NOT NULL,
  description   TEXT            NULL,
  source_url    VARCHAR(2048)   NULL,
  verified_at   DATE            NULL,
  created_by    BIGINT UNSIGNED NOT NULL,
  created_at    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  published_at  DATETIME(6)     NULL,
  PRIMARY KEY (version_id),
  UNIQUE KEY uq_versions_type_no (visa_type_id, version_no),
  KEY ix_versions_published (visa_type_id, published_at),
  CONSTRAINT fk_versions_type    FOREIGN KEY (visa_type_id) REFERENCES visa_types (visa_type_id),
  CONSTRAINT fk_versions_creator FOREIGN KEY (created_by)   REFERENCES users (user_id),
  CONSTRAINT ck_versions_publish CHECK (published_at IS NULL OR (source_url IS NOT NULL AND verified_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Бүрдүүлэх материалын шаардлага ---------------------------------------
CREATE TABLE visa_requirements (
  requirement_id BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  version_id     BIGINT UNSIGNED   NOT NULL,
  code           VARCHAR(40)       NOT NULL,
  title          VARCHAR(200)      NOT NULL,
  instructions   TEXT              NULL,
  is_required    BOOLEAN           NOT NULL DEFAULT TRUE,
  sort_order     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (requirement_id),
  UNIQUE KEY uq_requirements_version_code (version_id, code),
  KEY ix_requirements_sort (version_id, sort_order),
  CONSTRAINT fk_requirements_version FOREIGN KEY (version_id) REFERENCES visa_info_versions (version_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Мэдүүлэг (BR-07: нэг илгээлт — нэг дотоод дугаар; NFR-05 idempotency) -
CREATE TABLE applications (
  application_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id            CHAR(36)        NOT NULL,
  applicant_id         BIGINT UNSIGNED NOT NULL,
  assigned_operator_id BIGINT UNSIGNED NULL,
  version_id           BIGINT UNSIGNED NOT NULL,
  idempotency_key      CHAR(36)        NOT NULL,
  status               VARCHAR(16)     NOT NULL DEFAULT 'DRAFT',
  created_at           DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  submitted_at         DATETIME(6)     NULL,
  archived_at          DATETIME(6)     NULL,
  PRIMARY KEY (application_id),
  UNIQUE KEY uq_applications_public_id (public_id),
  UNIQUE KEY uq_applications_idem (applicant_id, idempotency_key),
  KEY ix_applications_owner (applicant_id, submitted_at),
  KEY ix_applications_operator (assigned_operator_id, status),
  KEY ix_applications_status (status, submitted_at),
  CONSTRAINT fk_applications_applicant FOREIGN KEY (applicant_id)         REFERENCES users (user_id),
  CONSTRAINT fk_applications_operator  FOREIGN KEY (assigned_operator_id) REFERENCES users (user_id),
  CONSTRAINT fk_applications_version   FOREIGN KEY (version_id)           REFERENCES visa_info_versions (version_id),
  CONSTRAINT ck_applications_status CHECK (status IN ('DRAFT','SUBMITTED','IN_REVIEW','INCOMPLETE','COMPLETE')),
  CONSTRAINT ck_applications_submitted CHECK (status = 'DRAFT' OR submitted_at IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Анкет (1:1, паспортын дугаар шифрлэгдсэн) ----------------------------
CREATE TABLE application_forms (
  application_id       BIGINT UNSIGNED NOT NULL,
  family_name          VARCHAR(100)    NOT NULL,
  given_name           VARCHAR(100)    NOT NULL,
  birth_date           DATE            NOT NULL,
  nationality_code     CHAR(2)         NOT NULL,
  passport_number_enc  VARBINARY(512)  NOT NULL,
  passport_key_id      VARCHAR(64)     NOT NULL,
  passport_expires_on  DATE            NOT NULL,
  contact_email        VARCHAR(254)    NOT NULL,
  contact_phone        VARCHAR(30)     NOT NULL,
  travel_purpose       VARCHAR(500)    NOT NULL,
  intended_entry_on    DATE            NOT NULL,
  intended_exit_on     DATE            NOT NULL,
  extra_fields         JSON            NULL,
  PRIMARY KEY (application_id),
  CONSTRAINT fk_forms_application FOREIGN KEY (application_id) REFERENCES applications (application_id) ON DELETE CASCADE,
  CONSTRAINT ck_forms_dates CHECK (intended_exit_on >= intended_entry_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Хавсралт (BR-05: PDF/JPG/PNG; ≤10 MB файл) ---------------------------
CREATE TABLE application_documents (
  document_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  version_id     BIGINT UNSIGNED NOT NULL,
  requirement_id BIGINT UNSIGNED NOT NULL,
  original_name  VARCHAR(255)    NOT NULL,
  storage_key    VARCHAR(255)    NOT NULL,
  mime_type      VARCHAR(32)     NOT NULL,
  size_bytes     BIGINT UNSIGNED NOT NULL,
  sha256         CHAR(64)        NOT NULL,
  scan_status    VARCHAR(16)     NOT NULL DEFAULT 'PENDING',
  uploaded_at    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (document_id),
  UNIQUE KEY uq_documents_storage_key (storage_key),
  KEY ix_documents_application (application_id, requirement_id),
  CONSTRAINT fk_documents_application FOREIGN KEY (application_id) REFERENCES applications (application_id) ON DELETE CASCADE,
  CONSTRAINT fk_documents_version     FOREIGN KEY (version_id)     REFERENCES visa_info_versions (version_id),
  CONSTRAINT fk_documents_requirement FOREIGN KEY (requirement_id) REFERENCES visa_requirements (requirement_id),
  CONSTRAINT ck_documents_mime CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  CONSTRAINT ck_documents_size CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  CONSTRAINT ck_documents_scan CHECK (scan_status IN ('PENDING','ACCEPTED','REJECTED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Бүрдлийн үнэлгээ (зөвхөн нэмэгдэнэ; BR-09: визийн шийдвэр биш) -------
CREATE TABLE reviews (
  review_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  operator_id    BIGINT UNSIGNED NOT NULL,
  review_no      INT UNSIGNED    NOT NULL,
  completeness   VARCHAR(12)     NOT NULL,
  comment        TEXT            NULL,
  reviewed_at    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (review_id),
  UNIQUE KEY uq_reviews_app_no (application_id, review_no),
  KEY ix_reviews_operator (operator_id, reviewed_at),
  CONSTRAINT fk_reviews_application FOREIGN KEY (application_id) REFERENCES applications (application_id),
  CONSTRAINT fk_reviews_operator    FOREIGN KEY (operator_id)    REFERENCES users (user_id),
  CONSTRAINT ck_reviews_completeness CHECK (completeness IN ('COMPLETE','INCOMPLETE')),
  CONSTRAINT ck_reviews_comment CHECK (completeness = 'COMPLETE' OR (comment IS NOT NULL AND CHAR_LENGTH(comment) > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Үйлдлийн бүртгэл (нууц үг, паспорт, анкетын агуулга хадгалахгүй) ------
CREATE TABLE audit_events (
  event_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id       BIGINT UNSIGNED NULL,
  application_id BIGINT UNSIGNED NULL,
  action         VARCHAR(64)     NOT NULL,
  entity_type    VARCHAR(40)     NOT NULL,
  entity_key     VARCHAR(64)     NULL,
  request_id     CHAR(36)        NOT NULL,
  occurred_at    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (event_id),
  KEY ix_audit_time (occurred_at),
  KEY ix_audit_actor (actor_id, occurred_at),
  KEY ix_audit_action (action, occurred_at),
  CONSTRAINT fk_audit_actor       FOREIGN KEY (actor_id)       REFERENCES users (user_id),
  CONSTRAINT fk_audit_application FOREIGN KEY (application_id) REFERENCES applications (application_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Суурь эрхүүд
INSERT INTO roles (code) VALUES ('APPLICANT'), ('OPERATOR'), ('ADMIN');
