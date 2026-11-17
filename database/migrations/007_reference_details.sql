-- Migration 007 — Лавлахын нэмэлт талбар (тайлан 5.2, Q4):
-- шаардлага бүрт хэнд хамаарах нөхцөл, эх хувь/хуулбар, орчуулгын шаардлага; хувилбарт шалгасан ажилтан.
SET NAMES utf8mb4;

ALTER TABLE visa_requirements
  ADD COLUMN applies_to       VARCHAR(300) NULL AFTER instructions,
  ADD COLUMN original_or_copy VARCHAR(12)  NULL AFTER applies_to,
  ADD COLUMN translation_note VARCHAR(500) NULL AFTER original_or_copy,
  ADD CONSTRAINT ck_requirements_original CHECK (original_or_copy IS NULL OR original_or_copy IN ('ORIGINAL','COPY','BOTH'));

ALTER TABLE visa_info_versions
  ADD COLUMN verified_by BIGINT UNSIGNED NULL AFTER verified_at,
  ADD CONSTRAINT fk_versions_verifier FOREIGN KEY (verified_by) REFERENCES users (user_id);

-- Өмнө нь шалгасан огноотой хувилбарын шалгагчийг үүсгэгчээр нь тэмдэглэнэ
UPDATE visa_info_versions SET verified_by = created_by WHERE verified_at IS NOT NULL AND verified_by IS NULL;
