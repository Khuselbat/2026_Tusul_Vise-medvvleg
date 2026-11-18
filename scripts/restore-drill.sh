#!/usr/bin/env bash
# Үе 5: сар бүрийн СЭРГЭЭЛТИЙН ТУРШИЛТ — нөөцийг production-оос ТУСДАА сан (civiz_restore_drill) болон түр хавтсанд
# сэргээж, бичлэг ↔ файлын SHA-256-г 100% тулгаад, хугацааг хэмжиж, туршилтын санг устгана. Production-д хүрэхгүй.
#
#   scripts/restore-drill.sh                          # хамгийн сүүлийн локал нөөц
#   scripts/restore-drill.sh backups/20261111T020000Z
#   DRILL_FROM_REMOTE=1 scripts/restore-drill.sh      # BACKUP_REMOTE-оос хамгийн сүүлийнхийг татаж шалгана (санал болгох)
#   BACKUP_MODE=docker scripts/restore-drill.sh
#
# cron (сар бүрийн 1-нд 03:00): 0 3 1 * * cd /opt/civiz && BACKUP_MODE=docker DRILL_FROM_REMOTE=1 scripts/restore-drill.sh >> /var/log/civiz-drill.log 2>&1
# Эрх: туршилтын сан үүсгэх/устгахад DB админ (host: DB_ADMIN_USER/DB_ADMIN_PASSWORD, анхдагч root/DB_ROOT_PASSWORD;
#      docker: db контейнерын root). Үр дүн `backups/restore-drill.log`-д нэг мөрөөр нэмэгдэнэ.
source "$(dirname "$0")/lib/common.sh"

DRILL_DB="${DRILL_DB:-civiz_restore_drill}"
[ "$DRILL_DB" != "$DB_NAME" ] || die "DRILL_DB нь production сан ($DB_NAME)-тай ижил байж болохгүй"
[[ "$DRILL_DB" =~ ^[A-Za-z0-9_]+$ ]] || die "DRILL_DB нэр буруу"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/civiz-drill.XXXXXX")"
cleanup() {
  [ "${KEEP_DRILL:-0}" = 1 ] || echo "DROP DATABASE IF EXISTS \`$DRILL_DB\`;" | db_admin_exec "" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
START=$(date +%s)

# 1. Нөөц сонгох
if [ "${DRILL_FROM_REMOTE:-0}" = 1 ]; then
  [ -n "${BACKUP_REMOTE:-}" ] || die "DRILL_FROM_REMOTE=1 үед BACKUP_REMOTE заавал"
  LATEST=$(rclone lsf --dirs-only "$BACKUP_REMOTE" | sed 's#/$##' | grep -E '^20[0-9]{6}T[0-9]{6}Z$' | sort | tail -n 1)
  [ -n "$LATEST" ] || die "$BACKUP_REMOTE дээр нөөц олдсонгүй"
  SRC="$WORK/$LATEST"
  log "Гадаад сангаас татаж байна: $BACKUP_REMOTE/$LATEST"
  rclone copy "$BACKUP_REMOTE/$LATEST" "$SRC"
else
  SRC="${1:-$(ls -1d "$BACKUP_DIR"/20*Z 2>/dev/null | sort | tail -n 1)}"
  [ -n "$SRC" ] && [ -d "$SRC" ] || die "Нөөц олдсонгүй ($BACKUP_DIR). Эхлээд scripts/backup.sh"
fi
NAME=$(basename "$SRC")
log "Туршилт: $NAME → сан “$DRILL_DB”"

# 2. Бүрэн бүтэн байдал ба нас
verify_sums "$SRC"
AGE_H=$((($(date -u +%s) - $(date -u -d "$(echo "$NAME" | sed -E 's/^(....)(..)(..)T(..)(..)(..)Z$/\1-\2-\3 \4:\5:\6/')" +%s 2>/dev/null || date -u +%s)) / 3600))

# 3. Тусдаа санд сэргээх
{
  echo "DROP DATABASE IF EXISTS \`$DRILL_DB\`;"
  echo "CREATE DATABASE \`$DRILL_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
} | db_admin_exec ""
gzip -dc "$SRC/db.sql.gz" | db_admin_exec "$DRILL_DB"
TABLES=$(echo "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()" | db_admin_exec "$DRILL_DB" -N)
APPS=$(echo "SELECT COUNT(*) FROM applications WHERE status <> 'DRAFT'" | db_admin_exec "$DRILL_DB" -N)
SCHEMA=$(echo "SELECT MAX(version) FROM schema_migrations" | db_admin_exec "$DRILL_DB" -N)

# 4. Файл сэргээж бичлэгтэй тулгах (verify-storage: SHA-256 + хэмжээ, анкетгүй мэдүүлэг 0)
mkdir -p "$WORK/files"
STORE="$WORK/files/storage"
if [ -f "$SRC/files.tar.gz" ]; then
  tar -C "$WORK/files" -xzf "$SRC/files.tar.gz"
  STORE="$WORK/files/$(archive_top "$SRC/files.tar.gz")"
fi
mkdir -p "$STORE"
set +e
if [ "$BACKUP_MODE" = docker ]; then
  # app image-ийн node + FILE_KEY (шифрлэлт тайлах) ашиглана; root-ийн эрхээр туршилтын санд холбогдоно
  VERIFY=$(dc run --rm --no-deps -T --user "$(id -u):$(id -g)" \
    -v "$STORE:/drill/storage:ro" -e STORAGE_DIR=/drill/storage -e STORAGE_DRIVER=local \
    -e DB_NAME="$DRILL_DB" -e DB_USER=root -e DB_PASSWORD="${DB_ROOT_PASSWORD:?DB_ROOT_PASSWORD (.env) хэрэгтэй}" \
    app node scripts/verify-storage.js 2>&1)
else
  VERIFY=$(cd server && STORAGE_DIR="$STORE" STORAGE_DRIVER=local DB_NAME="$DRILL_DB" \
    DB_USER="${DB_ADMIN_USER:-root}" DB_PASSWORD="${DB_ADMIN_PASSWORD:-${DB_ROOT_PASSWORD:-}}" \
    node scripts/verify-storage.js 2>&1)
fi
RC=$?
set -e
echo "$VERIFY" | sed 's/^/  /'

DUR=$(($(date +%s) - START))
RESULT=$([ $RC -eq 0 ] && echo PASS || echo FAIL)
LINE="$(date -u +%Y-%m-%dT%H:%M:%SZ) $RESULT backup=$NAME age_h=$AGE_H schema=$SCHEMA tables=$TABLES submitted_apps=$APPS duration_s=$DUR mode=$BACKUP_MODE"
mkdir -p "$BACKUP_DIR"
echo "$LINE" >> "$BACKUP_DIR/restore-drill.log"
echo "$LINE"
[ $RC -eq 0 ] || die "Сэргээлтийн туршилт АМЖИЛТГҮЙ — нөөцийн процессыг шалгана уу"
if [ -n "${DRILL_PING_URL:-}" ]; then curl -fsS -m 10 --retry 3 "$DRILL_PING_URL" >/dev/null || true; fi
log "Сэргээлтийн туршилт амжилттай (${DUR} сек; зорилт ≤ 4 цаг)."
