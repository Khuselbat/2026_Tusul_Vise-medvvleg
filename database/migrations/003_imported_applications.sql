-- Migration 003 — Өмнөх мэдүүлэг импортлох (тайлан 4.5 “Өмнөх мэдүүлэг нэмэх”).
-- Системээс гадуур өгсөн мэдүүлгийг мэдүүлэгч өөрөө нэмнэ; “импортолсон, баталгаажаагүй”. Оператор хяналтад орохгүй.
SET NAMES utf8mb4;

CREATE TABLE imported_applications (
  import_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id       CHAR(36)        NOT NULL,
  applicant_id    BIGINT UNSIGNED NOT NULL,
  idempotency_key CHAR(36)        NOT NULL,
  country_name    VARCHAR(100)    NOT NULL,
  visa_category   VARCHAR(60)     NOT NULL,
  applied_on      DATE            NOT NULL,
  authority       VARCHAR(150)    NULL,
  official_ref    VARCHAR(64)     NULL,
  outcome         VARCHAR(12)     NOT NULL DEFAULT 'NOT_CHECKED',
  note            TEXT            NULL,
  created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (import_id),
  UNIQUE KEY uq_imports_public_id (public_id),
  UNIQUE KEY uq_imports_idem (applicant_id, idempotency_key),
  KEY ix_imports_owner (applicant_id, applied_on),
  CONSTRAINT fk_imports_applicant FOREIGN KEY (applicant_id) REFERENCES users (user_id),
  CONSTRAINT ck_imports_outcome CHECK (outcome IN ('NOT_CHECKED','PENDING','APPROVED','REFUSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
