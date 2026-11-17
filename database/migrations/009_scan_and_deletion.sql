-- Migration 009 — Үе 3: вирус шалгалт (ClamAV) ба бүртгэл устгах хүсэлт.
SET NAMES utf8mb4;

-- Хавсралт: PENDING → ACCEPTED/REJECTED (асинхрон шалгалт). Одоо байгаа мөрүүд ACCEPTED хэвээр.
ALTER TABLE application_documents
  ADD COLUMN scanned_at DATETIME(6) NULL AFTER scan_status,
  ADD KEY ix_documents_scan (scan_status);

-- Нотолгоо файлд ч ижил шалгалт
ALTER TABLE evidence_files
  ADD COLUMN scan_status VARCHAR(16) NOT NULL DEFAULT 'ACCEPTED' AFTER sha256,
  ADD COLUMN scanned_at  DATETIME(6) NULL AFTER scan_status,
  ADD KEY ix_evidence_scan (scan_status),
  ADD CONSTRAINT ck_evidence_scan CHECK (scan_status IN ('PENDING','ACCEPTED','REJECTED'));

-- Бүртгэл устгах хүсэлт (тайлан 4.5): мэдүүлэгч хүсэлт гаргана → админ баталгаажуулна → хувийн мэдээлэл устна
CREATE TABLE account_deletion_requests (
  request_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  status        VARCHAR(12)     NOT NULL DEFAULT 'PENDING',
  reason        VARCHAR(500)    NULL,
  requested_at  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  decided_by    BIGINT UNSIGNED NULL,
  decided_at    DATETIME(6)     NULL,
  decision_note VARCHAR(500)    NULL,
  PRIMARY KEY (request_id),
  KEY ix_deletion_status (status, requested_at),
  KEY ix_deletion_user (user_id, status),
  CONSTRAINT fk_deletion_user    FOREIGN KEY (user_id)    REFERENCES users (user_id),
  CONSTRAINT fk_deletion_decider FOREIGN KEY (decided_by) REFERENCES users (user_id),
  CONSTRAINT ck_deletion_status CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT ck_deletion_decided CHECK (status IN ('PENDING','CANCELLED') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
