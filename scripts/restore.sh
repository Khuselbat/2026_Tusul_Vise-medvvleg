#!/usr/bin/env bash
# NFR-04: нөөцөөс сэргээх (≤4 цаг). Жишээ: scripts/restore.sh backups/20261111T020000Z
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:?Нөөцийн хавтас заана уу}"
: "${DB_HOST:=127.0.0.1}" "${DB_PORT:=3306}" "${DB_USER:=civiz}" "${DB_PASSWORD:=civiz_pass}" "${DB_NAME:=civiz}"
: "${STORAGE_DIR:=server/storage}"

( cd "$SRC" && sha256sum -c SHA256SUMS )
read -r -p "“$DB_NAME” сан болон “$STORAGE_DIR”-ийг дарж бичих үү? (yes/no) " ans
[ "$ans" = "yes" ] || { echo "Цуцаллаа."; exit 1; }

gunzip -c "$SRC/db.sql.gz" | MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME"
rm -rf "$STORAGE_DIR"
mkdir -p "$(dirname "$STORAGE_DIR")"
tar -C "$(dirname "$STORAGE_DIR")" -xzf "$SRC/files.tar.gz"

# Бичлэг ба файлын хяналтын нийлбэрийг 100% тулгана
( cd server && node scripts/verify-storage.js )
echo "Сэргээлт дууслаа."
