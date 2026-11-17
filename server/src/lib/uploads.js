// Файл хүлээн авах нийтлэг давхарга (BR-05): multer (санах ойд), magic byte шалгалт, хадгалах, алдаа гарвал цэвэрлэх.
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from './errors.js';
import { detectType, saveFile, removeFile, safeFileName } from './storage.js';
import { initialScanStatus, kickScanner } from './scanner.js';

/**
 * multipart хүсэлтийг хүлээн авна. `maxFiles` > 1 бол `field` нэрээр массив (req.files), үгүй бол req.file.
 */
export function receiveFiles({ field = 'file', maxFiles = 1 } = {}) {
  const m = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.limits.fileBytes, files: maxFiles, fields: 20, fieldSize: 16 * 1024 },
  });
  const handler = maxFiles === 1 ? m.single(field) : m.array(field, maxFiles);
  return (req, res, next) =>
    handler(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(badRequest('Файлын хэмжээ 10 MB-аас их байна.'));
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(badRequest(`Хамгийн ихдээ ${maxFiles} файл хавсаргана.`));
      }
      return next(badRequest('Файл хүлээн авахад алдаа гарлаа. Дахин оролдоно уу.'));
    });
}

/** Файлын төрлийг агуулгаар нь тогтооно; зөвшөөрөгдөөгүй бол 400. */
export function checkFile(file) {
  if (!file || !file.size) throw badRequest('Файл сонгоно уу.');
  const mime = detectType(file.buffer, file.originalname);
  if (!mime) throw badRequest('Зөвхөн PDF, JPG, PNG файл хүлээн авна. Файлын агуулга өргөтгөлтэйгээ таарахгүй байна.');
  return mime;
}

/**
 * Шалгасан файлуудыг хадгалалтад бичнэ. Аль нэг нь бүтэлгүйтвэл бичсэнийг устгана.
 * @returns {Promise<Array<{storageKey, sha256, mime, size, originalName}>>}
 */
export async function storeFiles(files) {
  const checked = files.map((f) => ({ f, mime: checkFile(f) }));
  const stored = [];
  try {
    for (const { f, mime } of checked) {
      const { storageKey, sha256 } = await saveFile(f.buffer);
      stored.push({ storageKey, sha256, mime, size: f.size, originalName: safeFileName(f.originalname) });
    }
    return stored;
  } catch (e) {
    await discardFiles(stored);
    throw e;
  }
}

/** DB бичилт бүтэлгүйтсэн үед хадгалсан файлыг үлдээхгүй (UC-04 E2/E4). */
export async function discardFiles(stored) {
  await Promise.all(stored.map((s) => removeFile(s.storageKey).catch(() => {})));
}

/** evidence_files мөр нэмнэ (транзакц дотор `q`). */
export async function insertEvidence(q, { kind, applicationId = null, importId = null, uploadedBy, file }) {
  const ins = await q(
    `INSERT INTO evidence_files (kind, application_id, import_id, uploaded_by, original_name, storage_key, mime_type, size_bytes, sha256, scan_status)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [kind, applicationId, importId, uploadedBy, file.originalName, file.storageKey, file.mime, file.size, file.sha256, initialScanStatus()],
  );
  kickScanner();
  return ins.insertId;
}

/** Мэдүүлгийн хавсралтын нийт хэмжээ (анхны + нэмэлт багц) — BR-05 нийт ≤100 MB. */
export async function applicationBytesUsed(q, applicationId) {
  const rows = await q('SELECT COALESCE(SUM(size_bytes),0) AS total FROM application_documents WHERE application_id = ?', [applicationId]);
  return Number(rows[0].total);
}
