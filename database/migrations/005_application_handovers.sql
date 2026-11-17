-- Migration 005 — “Эрх бүхий байгууллагад хүргүүлсэн” төлөв (тайлан 4.2, 5.3).
-- Хуваарилагдсан оператор “Бүрдэл бүрэн” мэдүүлгийг бодитоор хүргүүлсний дараа албан дугаар, огноо, нотолгоотой бүртгэнэ.
SET NAMES utf8mb4;

ALTER TABLE applications DROP CONSTRAINT ck_applications_status;
ALTER TABLE applications ADD CONSTRAINT ck_applications_status
  CHECK (status IN ('DRAFT','SUBMITTED','IN_REVIEW','INCOMPLETE','COMPLETE','DELIVERED'));

CREATE TABLE application_handovers (
  handover_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id   BIGINT UNSIGNED NOT NULL,
  operator_id      BIGINT UNSIGNED NOT NULL,
  authority        VARCHAR(150)    NOT NULL,
  official_ref     VARCHAR(64)     NOT NULL,
  delivered_on     DATE            NOT NULL,
  evidence_file_id BIGINT UNSIGNED NOT NULL,
  note             TEXT            NULL,
  recorded_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (handover_id),
  UNIQUE KEY uq_handovers_application (application_id),
  UNIQUE KEY uq_handovers_evidence (evidence_file_id),
  CONSTRAINT fk_handovers_application FOREIGN KEY (application_id)   REFERENCES applications (application_id),
  CONSTRAINT fk_handovers_operator    FOREIGN KEY (operator_id)      REFERENCES users (user_id),
  CONSTRAINT fk_handovers_evidence    FOREIGN KEY (evidence_file_id) REFERENCES evidence_files (file_id),
  CONSTRAINT ck_handovers_ref CHECK (CHAR_LENGTH(official_ref) > 0 AND CHAR_LENGTH(authority) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
