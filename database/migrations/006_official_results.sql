-- Migration 006 — Албан ёсны үр дүн (F11, тайлан 5.3). Мэдүүлэгч порталаас харсан үр дүнгээ бүртгэнэ —
-- системийн шийдвэр БИШ. Зөвхөн нэмэгдэнэ (засах/устгахгүй); бичлэг байхгүй = “Шалгаагүй”.
-- Оператор нотолгоо файлтай бичлэгийг тусдаа тэмдэглэлээр тулгана; мэдүүлэгчийн бичлэгийг өөрчлөхгүй.
SET NAMES utf8mb4;

CREATE TABLE official_results (
  result_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id   BIGINT UNSIGNED NOT NULL,
  entry_no         INT UNSIGNED    NOT NULL,
  idempotency_key  CHAR(36)        NOT NULL,
  outcome          VARCHAR(12)     NOT NULL,
  checked_on       DATE            NOT NULL,
  source           VARCHAR(150)    NOT NULL,
  source_url       VARCHAR(2048)   NULL,
  evidence_file_id BIGINT UNSIGNED NULL,
  recorded_by      BIGINT UNSIGNED NOT NULL,
  recorded_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (result_id),
  UNIQUE KEY uq_results_app_entry (application_id, entry_no),
  UNIQUE KEY uq_results_idem (application_id, idempotency_key),
  UNIQUE KEY uq_results_evidence (evidence_file_id),
  CONSTRAINT fk_results_application FOREIGN KEY (application_id)   REFERENCES applications (application_id),
  CONSTRAINT fk_results_evidence    FOREIGN KEY (evidence_file_id) REFERENCES evidence_files (file_id),
  CONSTRAINT fk_results_recorder    FOREIGN KEY (recorded_by)      REFERENCES users (user_id),
  CONSTRAINT ck_results_outcome CHECK (outcome IN ('PENDING','APPROVED','REFUSED')),
  CONSTRAINT ck_results_url     CHECK (source_url IS NULL OR source_url LIKE 'https://%')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE official_result_verifications (
  verification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  result_id       BIGINT UNSIGNED NOT NULL,
  operator_id     BIGINT UNSIGNED NOT NULL,
  verdict         VARCHAR(10)     NOT NULL,
  note            TEXT            NULL,
  verified_at     DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (verification_id),
  UNIQUE KEY uq_verifications_result (result_id),
  CONSTRAINT fk_verifications_result   FOREIGN KEY (result_id)   REFERENCES official_results (result_id),
  CONSTRAINT fk_verifications_operator FOREIGN KEY (operator_id) REFERENCES users (user_id),
  CONSTRAINT ck_verifications_verdict CHECK (verdict IN ('MATCHES','MISMATCH')),
  CONSTRAINT ck_verifications_note    CHECK (verdict = 'MATCHES' OR (note IS NOT NULL AND CHAR_LENGTH(note) > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
