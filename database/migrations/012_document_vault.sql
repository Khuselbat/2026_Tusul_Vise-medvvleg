-- Migration 012 — бичиг баримтын сан: баримтын ТӨРЛИЙН каталог (зөвхөн ангилал — визийн шаардлага биш, BR-04-д хамаарахгүй)
-- ба мэдүүлэгчийн профайлд хадгалсан баримтууд. Файлын дүрэм application_documents-тэй ижил (BR-05).
SET NAMES utf8mb4;

CREATE TABLE document_types (
  code       VARCHAR(40)       NOT NULL,
  name_mn    VARCHAR(150)      NOT NULL,
  has_expiry BOOLEAN           NOT NULL DEFAULT FALSE,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active  BOOLEAN           NOT NULL DEFAULT TRUE,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- has_expiry: UI-д “хүчинтэй хугацаа”-г санал болгох эсэх. Хугацааг хэрэглэгч баримт дээрхээр оруулна (систем зохиохгүй).
INSERT INTO document_types (code, name_mn, has_expiry, sort_order) VALUES
  ('PASSPORT_COPY',   'Гадаад паспортын хуулбар',         TRUE,  10),
  ('PHOTO',           'Цээж зураг (3.5 × 4.5 см)',          FALSE, 20),
  ('EMPLOYMENT_CERT', 'Ажлын газрын тодорхойлолт',          TRUE,  30),
  ('BANK_STATEMENT',  'Банкны хуулга / дансны үлдэгдэл',     TRUE,  40),
  ('FAMILY_CERT',     'Гэр бүлийн лавлагаа (гэрлэлт, төрсний)', TRUE, 50),
  ('SCHOOL_CERT',     'Сургуулийн тодорхойлолт / диплом',    TRUE,  60),
  ('OTHER',           'Бусад баримт',                       TRUE,  90);

CREATE TABLE profile_documents (
  document_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  type_code     VARCHAR(40)     NOT NULL,
  title         VARCHAR(200)    NULL,
  original_name VARCHAR(255)    NOT NULL,
  storage_key   VARCHAR(255)    NOT NULL,
  mime_type     VARCHAR(32)     NOT NULL,
  size_bytes    BIGINT UNSIGNED NOT NULL,
  sha256        CHAR(64)        NOT NULL,
  scan_status   VARCHAR(16)     NOT NULL DEFAULT 'PENDING',
  scanned_at    DATETIME(6)     NULL,
  issued_on     DATE            NULL,
  valid_until   DATE            NULL,
  uploaded_at   DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (document_id),
  UNIQUE KEY uq_profile_docs_storage_key (storage_key),
  KEY ix_profile_docs_user (user_id, type_code),
  CONSTRAINT fk_profile_docs_user FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT fk_profile_docs_type FOREIGN KEY (type_code) REFERENCES document_types (code),
  CONSTRAINT ck_profile_docs_mime CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  CONSTRAINT ck_profile_docs_size CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  CONSTRAINT ck_profile_docs_scan CHECK (scan_status IN ('PENDING','ACCEPTED','REJECTED')),
  CONSTRAINT ck_profile_docs_dates CHECK (issued_on IS NULL OR valid_until IS NULL OR valid_until >= issued_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
