#!/usr/bin/env bash
# NFR-04 / Үе 5: өгөгдлийн сан + хувийн файлын нөөц → (сонголтоор) гадаад сан руу хуулна.
#
#   scripts/backup.sh                       # .env-ийн тохиргоогоор
#   BACKUP_MODE=docker scripts/backup.sh    # docker compose (db, app контейнер)
#
# cron (өдөр бүр 02:00 UTC; нөөцийн нас ≤24 цаг):
#   0 2 * * * cd /opt/civiz && BACKUP_MODE=docker scripts/backup.sh >> /var/log/civiz-backup.log 2>&1
#
# Тохиргоо (.env эсвэл орчин):
#   BACKUP_DIR=backups          локал нөөцийн хавтас (chmod 700)
#   KEEP_DAYS=14                локалд хадгалах хоног
#   BACKUP_REMOTE=offsite:civiz rclone-ийн алсын зам (заавал **crypt** төрлийн remote — нөөцөд хувийн мэдээлэл бий)
#   REMOTE_KEEP_DAYS=90         гадаад санд хадгалах хоног
#   BACKUP_PING_URL=…           амжилттай дууссаны дараа GET (Uptime Kuma push / healthchecks.io) — нөөц тасарвал мэдэгдэнэ
#
# Гаралт: backups/<UTC огноо>/{db.sql.gz, files.tar.gz, MANIFEST.txt, SHA256SUMS}
# STORAGE_DRIVER=s3 бол файлыг энд нөөцлөхгүй — bucket-ийн versioning/replication-оор (docs/DEPLOYMENT.md §6).
source "$(dirname "$0")/lib/common.sh"

: "${KEEP_DAYS:=14}" "${REMOTE_KEEP_DAYS:=90}"
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$BACKUP_DIR/$TS"
umask 077
mkdir -p "$OUT"
chmod 700 "$BACKUP_DIR"
trap '[ -f "$OUT/SHA256SUMS" ] || { log "Нөөц бүтэлгүй — дутуу хавтсыг устгав: $OUT"; rm -rf "$OUT"; }' EXIT

log "Нөөц эхэллээ ($BACKUP_MODE): $OUT"
db_dump | gzip -9 > "$OUT/db.sql.gz"
gzip -t "$OUT/db.sql.gz"
# Dump бүрэн дууссан эсэх (mysqldump төгсгөлд "-- Dump completed" бичдэг)
gzip -dc "$OUT/db.sql.gz" | tail -n 1 | grep -q 'Dump completed' || die "DB dump дутуу байна"

if files_in_backup; then
  files_archive > "$OUT/files.tar.gz"
  gzip -t "$OUT/files.tar.gz"
  NFILES=$(tar -tzf "$OUT/files.tar.gz" | grep -cv '/$' || true)
else
  NFILES="(s3 — энд нөөцлөөгүй)"
fi

SCHEMA=$(echo 'SELECT MAX(version) FROM schema_migrations' | db_exec -N 2>/dev/null || echo '?')
{
  echo "created_utc=$TS"
  echo "mode=$BACKUP_MODE"
  echo "database=$DB_NAME"
  echo "schema_version=$SCHEMA"
  echo "storage_driver=$STORAGE_DRIVER"
  echo "files=$NFILES"
  echo "app_commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
} > "$OUT/MANIFEST.txt"
(cd "$OUT" && sha256_tool db.sql.gz $(files_in_backup && echo files.tar.gz) MANIFEST.txt > SHA256SUMS)
log "Нөөц үүслээ: $OUT ($(du -sh "$OUT" | cut -f1), schema $SCHEMA, файл $NFILES)"

# Гадаад сан руу (3-2-1 зарчим: нэг хуулбар өөр газар)
if [ -n "${BACKUP_REMOTE:-}" ]; then
  command -v rclone >/dev/null || die "BACKUP_REMOTE тохируулсан ч rclone суугаагүй (https://rclone.org/install/)"
  remote_name="${BACKUP_REMOTE%%:*}"
  if ! rclone listremotes --long | grep -E "^${remote_name}:[[:space:]]+crypt" >/dev/null; then
    [ "${BACKUP_ALLOW_UNENCRYPTED_REMOTE:-0}" = 1 ] || die "“${remote_name}:” нь crypt remote биш. Нөөцөд хувийн мэдээлэл байгаа тул шифрлэсэн remote ашиглана (docs/DEPLOYMENT.md §6)."
  fi
  rclone copy "$OUT" "$BACKUP_REMOTE/$TS" --immutable
  # Хуулсныг буцааж татаж тулгана (crypt remote-д hash шууд харьцуулагдахгүй тул --download)
  rclone check "$OUT" "$BACKUP_REMOTE/$TS" --one-way --download
  log "Гадаад сан руу хуулав: $BACKUP_REMOTE/$TS"
  rclone delete "$BACKUP_REMOTE" --min-age "${REMOTE_KEEP_DAYS}d" && rclone rmdirs "$BACKUP_REMOTE" --leave-root || true
fi

# Локал хуучин нөөц (хадгалах хугацааг байгууллагын журмаар батална)
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*Z' -mtime +"$KEEP_DAYS" -exec rm -rf {} +

if [ -n "${BACKUP_PING_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$BACKUP_PING_URL" >/dev/null || log "Анхааруулга: BACKUP_PING_URL руу мэдэгдэж чадсангүй"
fi
log "Дууслаа."
