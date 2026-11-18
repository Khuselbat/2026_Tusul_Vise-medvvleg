-- Migration 011 — мэдүүлэгчийн профайл: БНСУ-ын визийн мэдүүлэгт давтан ашиглагдах хувийн мэдээллийг нэг удаа оруулна.
-- Бүх талбар сонголттой (аажмаар бөглөнө); паспортын дугаар AES-256-GCM (application_forms-тэй ижил түлхүүр, key id-тай).
-- Аяллын тухай мэдээлэл (зорилго, огноо, байрлах хаяг) мэдүүлэг бүрт өөр тул энд хадгалахгүй.
SET NAMES utf8mb4;

CREATE TABLE applicant_profiles (
  user_id             BIGINT UNSIGNED NOT NULL,
  family_name         VARCHAR(100)    NULL,
  given_name          VARCHAR(100)    NULL,
  birth_date          DATE            NULL,
  sex                 CHAR(1)         NULL,
  nationality_code    CHAR(2)         NULL,
  marital_status      VARCHAR(16)     NULL,
  passport_number_enc VARBINARY(512)  NULL,
  passport_key_id     VARCHAR(64)     NULL,
  passport_issued_on  DATE            NULL,
  passport_expires_on DATE            NULL,
  contact_email       VARCHAR(254)    NULL,
  contact_phone       VARCHAR(30)     NULL,
  home_address        VARCHAR(500)    NULL,
  occupation          VARCHAR(200)    NULL,
  employer_or_school  VARCHAR(200)    NULL,
  updated_at          DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT ck_profiles_sex CHECK (sex IS NULL OR sex IN ('M','F')),
  CONSTRAINT ck_profiles_marital CHECK (marital_status IS NULL OR marital_status IN ('SINGLE','MARRIED','DIVORCED','WIDOWED')),
  CONSTRAINT ck_profiles_passport CHECK ((passport_number_enc IS NULL) = (passport_key_id IS NULL)),
  CONSTRAINT ck_profiles_passport_dates CHECK (
    passport_issued_on IS NULL OR passport_expires_on IS NULL OR passport_expires_on > passport_issued_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
