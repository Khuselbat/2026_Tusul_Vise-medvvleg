#!/usr/bin/env bash
# NFR-04: өгөгдлийн сан + хувийн файлын нөөц (өдөр бүр cron-оор ажиллуулна; нөөцийн нас ≤24 цаг)
#   0 2 * * * /opt/civiz/scripts/backup.sh >> /var/log/civiz-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DB_HOST:=127.0.0.1}" "${DB_PORT:=3306}" "${DB_USER:=civiz}" "${DB_PASSWORD:=civiz_pass}" "${DB_NAME:=civiz}"
: "${STORAGE_DIR:=server/storage}" "${BACKUP_DIR:=backups}" "${KEEP_DAYS:=30}"

TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$BACKUP_DIR/$TS"
mkdir -p "$OUT"
chmod 700 "$BACKUP_DIR"

MYSQL_PWD="$DB_PASSWORD" mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
  --single-transaction --routines --triggers --hex-blob --default-character-set=utf8mb4 "$DB_NAME" | gzip -9 > "$OUT/db.sql.gz"
tar -C "$(dirname "$STORAGE_DIR")" -czf "$OUT/files.tar.gz" "$(basename "$STORAGE_DIR")"
( cd "$OUT" && sha256sum db.sql.gz files.tar.gz > SHA256SUMS )

# Хуучин нөөцийг устгах (хадгалах хугацааг байгууллагын журмаар батална)
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +
echo "Нөөц үүслээ: $OUT"
