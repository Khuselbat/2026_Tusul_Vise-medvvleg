-- Migration 002 — Нэмэлт материалын багц (F07, UC-07 A1, тайлан 5.2 “хавсралтын шинэ хувилбар”).
-- Оператор “Дутуу” гэж үнэлсний дараа мэдүүлэгч анхны илгээлтийг ЗАСАХГҮЙГЭЭР (BR-07) нэмэлт багц илгээнэ.
-- Нэг “Дутуу” үнэлгээнд нэг багц (uq_supplements_review). Багцын файлууд application_documents.supplement_id-тай.
SET NAMES utf8mb4;

CREATE TABLE application_supplements (
  supplement_id  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  round_no       INT UNSIGNED    NOT NULL,
  review_id      BIGINT UNSIGNED NOT NULL,
  status         VARCHAR(12)     NOT NULL DEFAULT 'DRAFT',
  note           TEXT            NULL,
  created_at     DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  submitted_at   DATETIME(6)     NULL,
  PRIMARY KEY (supplement_id),
  UNIQUE KEY uq_supplements_app_round (application_id, round_no),
  UNIQUE KEY uq_supplements_review (review_id),
  CONSTRAINT fk_supplements_application FOREIGN KEY (application_id) REFERENCES applications (application_id) ON DELETE CASCADE,
  CONSTRAINT fk_supplements_review      FOREIGN KEY (review_id)      REFERENCES reviews (review_id),
  CONSTRAINT ck_supplements_status    CHECK (status IN ('DRAFT','SUBMITTED')),
  CONSTRAINT ck_supplements_submitted CHECK (status = 'DRAFT' OR submitted_at IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- NULL = анхны илгээлтийн хавсралт
ALTER TABLE application_documents
  ADD COLUMN supplement_id BIGINT UNSIGNED NULL AFTER requirement_id,
  ADD KEY ix_documents_supplement (supplement_id),
  ADD CONSTRAINT fk_documents_supplement FOREIGN KEY (supplement_id) REFERENCES application_supplements (supplement_id) ON DELETE CASCADE;
