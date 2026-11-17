-- Migration 008 — Үе 2: сесс, имэйл баталгаажуулалт, нууц үг сэргээх, ажилтны 2FA (TOTP), мэдэгдэл.
-- Токен, нөөц кодыг зөвхөн SHA-256 хэшээр; TOTP нууцыг AES-256-GCM-ээр (lib/crypto.js) хадгална.
SET NAMES utf8mb4;

ALTER TABLE users
  ADD COLUMN email_verified_at   DATETIME(6)    NULL AFTER display_name,
  ADD COLUMN password_changed_at DATETIME(6)    NULL AFTER email_verified_at,
  ADD COLUMN mfa_secret_enc      VARBINARY(256) NULL AFTER password_changed_at,
  ADD COLUMN mfa_key_id          VARCHAR(64)    NULL AFTER mfa_secret_enc,
  ADD COLUMN mfa_enabled_at      DATETIME(6)    NULL AFTER mfa_key_id,
  ADD COLUMN mfa_last_step       BIGINT         NULL AFTER mfa_enabled_at;

-- Энэ migration-оос өмнө үүссэн бүртгэлүүдийг баталгаажсан гэж үзнэ (тэдэнд баталгаажуулах шаардлага байгаагүй)
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

-- Сесс: JWT бүр session_id-тай; гарах/бүх төхөөрөмжөөс гарах/нууц үг солиход серверээс хүчингүй болгоно
CREATE TABLE user_sessions (
  session_id   CHAR(36)        NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  last_seen_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at   DATETIME(6)     NOT NULL,
  revoked_at   DATETIME(6)     NULL,
  user_agent   VARCHAR(200)    NULL,
  PRIMARY KEY (session_id),
  KEY ix_sessions_user (user_id, revoked_at, expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Нэг удаагийн, хугацаатай токен (имэйл баталгаажуулах, нууц үг сэргээх, 2FA-ийн завсрын алхам)
CREATE TABLE user_tokens (
  token_id    BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED  NOT NULL,
  purpose     VARCHAR(20)      NOT NULL,
  token_hash  CHAR(64)         NOT NULL,
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at  DATETIME(6)      NOT NULL,
  used_at     DATETIME(6)      NULL,
  PRIMARY KEY (token_id),
  UNIQUE KEY uq_tokens_hash (token_hash),
  KEY ix_tokens_user (user_id, purpose, used_at),
  CONSTRAINT fk_tokens_user FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT ck_tokens_purpose CHECK (purpose IN ('VERIFY_EMAIL','RESET_PASSWORD','MFA_PENDING'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mfa_recovery_codes (
  code_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  code_hash  CHAR(64)        NOT NULL,
  created_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  used_at    DATETIME(6)     NULL,
  PRIMARY KEY (code_id),
  UNIQUE KEY uq_recovery_user_hash (user_id, code_hash),
  CONSTRAINT fk_recovery_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Систем доторх мэдэгдэл (хонх) + имэйлийн outbox. Текстийг хадгалахгүй — kind + лавлах дугаараас үүсгэнэ (хувийн мэдээлэлгүй).
CREATE TABLE notifications (
  notification_id BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED  NOT NULL,
  kind            VARCHAR(32)      NOT NULL,
  application_id  BIGINT UNSIGNED  NULL,
  ref             VARCHAR(36)      NULL,
  created_at      DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  read_at         DATETIME(6)      NULL,
  email_status    VARCHAR(10)      NOT NULL DEFAULT 'PENDING',
  email_attempts  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  emailed_at      DATETIME(6)      NULL,
  PRIMARY KEY (notification_id),
  KEY ix_notifications_user (user_id, read_at, created_at),
  KEY ix_notifications_outbox (email_status, created_at),
  CONSTRAINT fk_notifications_user        FOREIGN KEY (user_id)        REFERENCES users (user_id),
  CONSTRAINT fk_notifications_application FOREIGN KEY (application_id) REFERENCES applications (application_id),
  CONSTRAINT ck_notifications_email CHECK (email_status IN ('PENDING','SENT','FAILED','SKIPPED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
