// Үе 3 — шифрлэлтийн түлхүүр эргүүлэх. Шинэ түлхүүрийг PASSPORT_KEY/PASSPORT_KEY_ID (FILE_KEY/FILE_KEY_ID)-д,
// хуучныг PASSPORT_KEYS_OLD="k1:hex" (FILE_KEYS_OLD="f1:hex")-д тохируулаад ажиллуулна:
//   npm run keys:rotate -- --dry-run      юу өөрчлөгдөхийг тоолно
//   npm run keys:rotate                   паспорт + 2FA нууцыг шинэ түлхүүрээр дахин шифрлэнэ
//   npm run keys:rotate -- --files        мөн хадгалсан файлуудыг (STORAGE_ENCRYPT=1 үед шифрлэнэ/дахин шифрлэнэ)
// Мөр бүрийг тусад нь шинэчилдэг тул тасарвал дахин ажиллуулахад аюулгүй. Дууссаны дараа verify-storage ажиллуулж,
// хуучин түлхүүрийг *OLD-оос хасна.
import { pool, query } from '../src/db.js';
import { config } from '../src/config.js';
import { encryptPassport, decryptPassport } from '../src/lib/crypto.js';
import { rewriteRaw, decryptBlob, encryptBlob, encryptedKeyId, isEncrypted } from '../src/lib/storage.js';

const dryRun = process.argv.includes('--dry-run');
const withFiles = process.argv.includes('--files');
const out = { passports: 0, mfaSecrets: 0, files: 0, errors: 0 };
const current = config.passportKeyId;

function reencrypt(buf, keyId) {
  const plain = decryptPassport(buf, keyId);
  if (plain === null) throw new Error(`түлхүүр олдсонгүй: ${keyId}`);
  return encryptPassport(plain);
}

try {
  // 1. Паспортын дугаар
  for (const r of await query(
    'SELECT application_id, passport_number_enc, passport_key_id FROM application_forms WHERE passport_key_id <> ?',
    [current],
  )) {
    try {
      const enc = reencrypt(r.passport_number_enc, r.passport_key_id);
      if (!dryRun) {
        await query(
          'UPDATE application_forms SET passport_number_enc = ?, passport_key_id = ? WHERE application_id = ? AND passport_key_id = ?',
          [enc.data, enc.keyId, r.application_id, r.passport_key_id],
        );
      }
      out.passports += 1;
    } catch (e) {
      out.errors += 1;
      console.error(`Паспорт (мэдүүлэг ${r.application_id}): ${e.message}`);
    }
  }

  // 2. Ажилтны 2FA нууц
  for (const r of await query(
    'SELECT user_id, mfa_secret_enc, mfa_key_id FROM users WHERE mfa_secret_enc IS NOT NULL AND mfa_key_id <> ?',
    [current],
  )) {
    try {
      const enc = reencrypt(r.mfa_secret_enc, r.mfa_key_id);
      if (!dryRun) {
        await query('UPDATE users SET mfa_secret_enc = ?, mfa_key_id = ? WHERE user_id = ? AND mfa_key_id = ?', [
          enc.data,
          enc.keyId,
          r.user_id,
          r.mfa_key_id,
        ]);
      }
      out.mfaSecrets += 1;
    } catch (e) {
      out.errors += 1;
      console.error(`2FA нууц (хэрэглэгч ${r.user_id}): ${e.message}`);
    }
  }

  // 3. Файлууд (сонголттой)
  if (withFiles) {
    const keys = [
      ...(await query("SELECT storage_key FROM application_documents WHERE scan_status <> 'REJECTED'")),
      ...(await query("SELECT storage_key FROM evidence_files WHERE scan_status <> 'REJECTED'")),
    ].map((x) => x.storage_key);
    for (const k of keys) {
      try {
        const changed = await rewriteRaw(k, (raw) => {
          const needs = config.storage.encrypt ? !isEncrypted(raw) || encryptedKeyId(raw) !== config.storage.keyId : isEncrypted(raw); // шифрлэлтийг унтраасан бол тайлж бичнэ
          if (!needs) return null;
          if (dryRun) {
            out.files += 1;
            return null;
          }
          const plain = decryptBlob(raw);
          return config.storage.encrypt ? encryptBlob(plain) : plain;
        });
        if (changed) out.files += 1;
      } catch (e) {
        out.errors += 1;
        console.error(`Файл ${k}: ${e.message}`);
      }
    }
  }
  console.log(`${dryRun ? '[dry-run] ' : ''}Түлхүүр эргүүлэлт → паспорт ${current}, файл ${config.storage.keyId}:`, out);
  if (out.errors) process.exitCode = 1;
} catch (e) {
  console.error(`Түлхүүр эргүүлэлт амжилтгүй: ${e.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
