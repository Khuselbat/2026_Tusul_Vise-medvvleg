-- Migration 010 — Үе 4: анкетын ноорог автоматаар хадгалах. Бүрэн бус анкетыг (паспорт агуулж болзошгүй)
-- AES-256-GCM-ээр шифрлэсэн JSON болгон хадгална; эцсийн “Үргэлжлүүлэх”-ээр application_forms-д бичигдэж, автомат хадгалалт арилна.
SET NAMES utf8mb4;

ALTER TABLE applications
  ADD COLUMN form_autosave_enc    VARBINARY(8192) NULL AFTER archived_at,
  ADD COLUMN form_autosave_key_id VARCHAR(64)     NULL AFTER form_autosave_enc,
  ADD COLUMN form_autosave_at     DATETIME(6)     NULL AFTER form_autosave_key_id;
