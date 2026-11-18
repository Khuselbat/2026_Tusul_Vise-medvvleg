#!/usr/bin/env bash
# NFR-04: нөөцөөс PRODUCTION санг сэргээх (зорилт ≤4 цаг). Одоогийн өгөгдлийг ДАРЖ БИЧНЭ.
# Эхлээд `scripts/restore-drill.sh`-ээр тусдаа санд туршиж, нөөц бүрэн гэдгийг шалгаарай.
#
#   scripts/restore.sh backups/20261111T020000Z
#   BACKUP_MODE=docker scripts/restore.sh backups/20261111T020000Z
#   rclone copy offsite:civiz/20261111T020000Z backups/20261111T020000Z   # гадаад сангаас эхлээд татна
#
# Алхам: хяналтын нийлбэр → баталгаажуулалт → (docker) app зогсооно → одоогийн хүснэгтүүдийг устгаж dump сэргээнэ →
#        файлын хавтсыг солино → verify-storage (бичлэг ↔ файл SHA-256 100%) → app эхлүүлнэ (migration автоматаар).
source "$(dirname "$0")/lib/common.sh"

SRC="${1:?Нөөцийн хавтас заана уу (жишээ: backups/20261111T020000Z)}"
[ -f "$SRC/SHA256SUMS" ] || die "$SRC/SHA256SUMS олдсонгүй"
verify_sums "$SRC"
[ -f "$SRC/MANIFEST.txt" ] && sed 's/^/  /' "$SRC/MANIFEST.txt"

if [ "${RESTORE_CONFIRM:-}" != yes ]; then
  read -r -p "“$DB_NAME” сан болон хувийн файлуудыг ($BACKUP_MODE) дарж бичих үү? (yes/no) " ans
  [ "$ans" = yes ] || {
    echo "Цуцаллаа."
    exit 1
  }
fi
START=$(date +%s)

if [ "$BACKUP_MODE" = docker ]; then
  log "app-ийг зогсооно (сэргээлтийн үед бичилт орохгүй)"
  dc stop app
fi

log "Өгөгдлийн сан сэргээж байна"
# Нөөцийн дараа нэмэгдсэн хүснэгт (шинэ migration) үлдэхгүйн тулд эхлээд бүх хүснэгтийг устгана
DROPS=$(echo "SELECT CONCAT('DROP TABLE IF EXISTS \`', TABLE_NAME, '\`;') FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'" | db_exec -N)
{
  echo 'SET FOREIGN_KEY_CHECKS = 0;'
  echo "$DROPS"
  echo 'SET FOREIGN_KEY_CHECKS = 1;'
  gzip -dc "$SRC/db.sql.gz"
} | db_exec

if [ -f "$SRC/files.tar.gz" ]; then
  log "Хувийн файлуудыг сэргээж байна"
  if [ "$BACKUP_MODE" = docker ]; then
    # Архивын дээд хавтас (storage эсвэл өөр STORAGE_DIR-ийн нэр)-ын агуулгыг volume-ийн үндсэнд байрлуулна
    dc run --rm --no-deps -T --entrypoint sh app -c \
      'cd /app/server/storage && find . -mindepth 1 -delete && tar -xzf - && d=$(ls -A) &&
       find "$d" -mindepth 1 -maxdepth 1 -exec mv {} . \; && rmdir "$d"' < "$SRC/files.tar.gz"
  else
    # Архивын дээд хавтас өөр нэртэй байж болох тул түр хавтсанд задлаад STORAGE_PATH болгож байрлуулна
    TMP_RESTORE="$(dirname "$STORAGE_PATH")/.restore.$$"
    rm -rf "$TMP_RESTORE" && mkdir -p "$TMP_RESTORE"
    tar -C "$TMP_RESTORE" -xzf "$SRC/files.tar.gz"
    rm -rf "$STORAGE_PATH"
    mv "$TMP_RESTORE/$(archive_top "$SRC/files.tar.gz")" "$STORAGE_PATH"
    rm -rf "$TMP_RESTORE"
  fi
fi

log "Бичлэг ↔ файлын хяналтын нийлбэрийг тулгаж байна"
if [ "$BACKUP_MODE" = docker ]; then
  dc run --rm --no-deps -T app node scripts/verify-storage.js
  dc start app
else
  (cd server && node scripts/verify-storage.js)
fi
log "Сэргээлт дууслаа ($(($(date +%s) - START)) сек). App эхлэхдээ хэрэгжээгүй migration-уудыг ажиллуулна."
