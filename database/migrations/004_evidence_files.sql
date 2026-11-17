-- Migration 004 — Нотолгоо файл: хүргүүлсэн баримт (HANDOVER), албан үр дүнгийн баримт (OFFICIAL_RESULT),
-- импортолсон мэдүүлгийн баримт (IMPORT). BR-05 шалгалт ижил; файлд зөвхөн /api/files/evidence/:id-аар хандана.
-- MySQL нь CHECK-д орсон баганад FK-ийн ON DELETE үйлдэл зөвшөөрдөггүй тул устгалыг кодоор хийнэ.
SET NAMES utf8mb4;

CREATE TABLE evidence_files (
  file_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind           VARCHAR(16)     NOT NULL,
  application_id BIGINT UNSIGNED NULL,
  import_id      BIGINT UNSIGNED NULL,
  uploaded_by    BIGINT UNSIGNED NOT NULL,
  original_name  VARCHAR(255)    NOT NULL,
  storage_key    VARCHAR(255)    NOT NULL,
  mime_type      VARCHAR(32)     NOT NULL,
  size_bytes     BIGINT UNSIGNED NOT NULL,
  sha256         CHAR(64)        NOT NULL,
  uploaded_at    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (file_id),
  UNIQUE KEY uq_evidence_storage_key (storage_key),
  KEY ix_evidence_application (application_id),
  KEY ix_evidence_import (import_id),
  CONSTRAINT fk_evidence_application FOREIGN KEY (application_id) REFERENCES applications (application_id),
  CONSTRAINT fk_evidence_import      FOREIGN KEY (import_id)      REFERENCES imported_applications (import_id),
  CONSTRAINT fk_evidence_uploader    FOREIGN KEY (uploaded_by)    REFERENCES users (user_id),
  CONSTRAINT ck_evidence_kind  CHECK (kind IN ('HANDOVER','OFFICIAL_RESULT','IMPORT')),
  CONSTRAINT ck_evidence_owner CHECK (
    (kind = 'IMPORT' AND import_id IS NOT NULL AND application_id IS NULL)
    OR (kind <> 'IMPORT' AND application_id IS NOT NULL AND import_id IS NULL)),
  CONSTRAINT ck_evidence_mime CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  CONSTRAINT ck_evidence_size CHECK (size_bytes > 0 AND size_bytes <= 10485760)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
