import { query } from '../db.js';

/**
 * Үйлдлийн бүртгэл. Нууц үг, паспортын эх утга, анкетын агуулга, файлын холбоосыг
 * энд ХЭЗЭЭ Ч дамжуулахгүй — зөвхөн үйлдэл, объектын төрөл, түлхүүр.
 * `q` дамжуулбал тухайн транзакцын дотор бичнэ.
 */
export async function audit(req, { action, entityType, entityKey = null, applicationId = null, actorId }, q = query) {
  await q(
    `INSERT INTO audit_events (actor_id, application_id, action, entity_type, entity_key, request_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      actorId !== undefined ? actorId : (req.user?.id ?? null),
      applicationId,
      action,
      entityType,
      entityKey === null ? null : String(entityKey).slice(0, 64),
      req.id,
    ],
  );
}
