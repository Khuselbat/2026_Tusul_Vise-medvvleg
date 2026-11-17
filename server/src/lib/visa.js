import { config } from '../config.js';

/** Тухайн визийн төрлийн хамгийн сүүлд нийтэлсэн хувилбарын дугаарыг буцаах дэд асуулга */
export const LATEST_PUBLISHED = `(SELECT MAX(v2.version_no) FROM visa_info_versions v2
   WHERE v2.visa_type_id = v.visa_type_id AND v2.published_at IS NOT NULL)`;

/**
 * Мэдүүлэг эхлүүлэх боломжтой эсэх (BR-03, Зураг 41):
 * улс ACTIVE + тохиргоогоор зөвшөөрсөн, төрөл идэвхтэй, хувилбар нийтлэгдсэн бөгөөд хамгийн сүүлийнх.
 */
export function canApply(row) {
  return (
    row.service_status === 'ACTIVE' &&
    config.submittableCountries.includes(row.iso_code) &&
    !!row.type_active &&
    !!row.published_at &&
    row.version_no === row.latest_no
  );
}

export function applyBlockReason(row) {
  if (!config.submittableCountries.includes(row.iso_code) || row.service_status !== 'ACTIVE') {
    return 'Энэ улсын мэдүүлэг авах үйлчилгээ одоогоор нээгдээгүй байна.';
  }
  if (!row.type_active) return 'Энэ визийн төрөлд шинэ мэдүүлэг хүлээн авахгүй байна.';
  if (!row.published_at) return 'Энэ мэдээлэл нийтлэгдээгүй байна.';
  if (row.version_no !== row.latest_no) return 'Энэ нь хуучин хувилбар. Хамгийн сүүлийн мэдээллээр мэдүүлэг эхлүүлнэ үү.';
  return null;
}

export const STATUS_LABEL = {
  DRAFT: 'Ноорог',
  SUBMITTED: 'Илгээсэн',
  IN_REVIEW: 'Бүрдэл хянаж байна',
  INCOMPLETE: 'Нэмэлт материал шаардсан',
  COMPLETE: 'Бүрдэл бүрэн',
  DELIVERED: 'Эрх бүхий байгууллагад хүргүүлсэн',
};
