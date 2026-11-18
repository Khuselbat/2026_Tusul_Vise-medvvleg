# shellcheck shell=bash
# backup.sh / restore.sh / restore-drill.sh-ийн нийтлэг функцүүд (Үе 5).
#
# BACKUP_MODE=host   — MySQL болон файлын хавтас энэ машин дээр (mysqldump/mysql клиент хэрэгтэй)
# BACKUP_MODE=docker — `docker compose` (db, app контейнер); нууц үгийг контейнерын орчноос авна
#
# Тохиргоо: репоны үндсэн `.env` (байвал) автоматаар уншигдана; орчны хувьсагч давуу.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# .env-ийг уншина, гэхдээ аль хэдийн тохируулсан орчны хувьсагчийг дарж бичихгүй
if [ -f "${ENV_FILE:-.env}" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"
    val="${BASH_REMATCH[2]}"
    [ -n "${!key+x}" ] && continue
    if [[ "$val" =~ ^\"(.*)\"$ || "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
    export "$key=$val"
  done < "${ENV_FILE:-.env}"
fi

: "${BACKUP_MODE:=host}"
: "${DB_HOST:=127.0.0.1}" "${DB_PORT:=3306}" "${DB_USER:=civiz}" "${DB_PASSWORD:=civiz_pass}" "${DB_NAME:=civiz}"
: "${STORAGE_DRIVER:=local}" "${STORAGE_DIR:=storage}" "${BACKUP_DIR:=backups}"
# Сервер STORAGE_DIR-ийг server/-ээс харьцангуйгаар уншдаг (config.js)
case "$STORAGE_DIR" in /* | [A-Za-z]:*) STORAGE_PATH="$STORAGE_DIR" ;; *) STORAGE_PATH="server/$STORAGE_DIR" ;; esac

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() {
  log "АЛДАА: $*" >&2
  exit 1
}

dc() { docker compose "$@"; }

# MySQL клиентийн нэр (MariaDB-д mariadb-dump/mariadb)
MYSQLDUMP="${MYSQLDUMP:-$(command -v mysqldump || command -v mariadb-dump || echo mysqldump)}"
MYSQL="${MYSQL:-$(command -v mysql || command -v mariadb || echo mysql)}"
DUMP_OPTS=(--single-transaction --quick --routines --triggers --hex-blob --no-tablespaces --default-character-set=utf8mb4)

sha256_tool() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

# Програмын сангийн dump → stdout
db_dump() {
  if [ "$BACKUP_MODE" = docker ]; then
    dc exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump -u"$MYSQL_USER" "$@" "$MYSQL_DATABASE"' sh "${DUMP_OPTS[@]}"
  else
    MYSQL_PWD="$DB_PASSWORD" "$MYSQLDUMP" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "${DUMP_OPTS[@]}" "$DB_NAME"
  fi
}

# stdin-ээс SQL-ийг програмын санд ажиллуулна. $1 = нэмэлт mysql сонголт (жишээ -N)
db_exec() {
  if [ "$BACKUP_MODE" = docker ]; then
    dc exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" "$@" "$MYSQL_DATABASE"' sh "$@"
  else
    MYSQL_PWD="$DB_PASSWORD" "$MYSQL" --default-character-set=utf8mb4 -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$@" "$DB_NAME"
  fi
}

# Админ (root) эрхээр SQL — зөвхөн сэргээлтийн туршилтын тусдаа сан үүсгэх/устгахад. $1 = сан ("" бол сонгохгүй)
db_admin_exec() {
  local db="$1"
  shift
  if [ "$BACKUP_MODE" = docker ]; then
    dc exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 -uroot "$@"' sh "$@" ${db:+"$db"}
  else
    MYSQL_PWD="${DB_ADMIN_PASSWORD:-${DB_ROOT_PASSWORD:-}}" "$MYSQL" --default-character-set=utf8mb4 -h "$DB_HOST" -P "$DB_PORT" \
      -u "${DB_ADMIN_USER:-root}" "$@" ${db:+"$db"}
  fi
}

# Хувийн файлын хавтас → tar.gz stdout (архив доторх үндэс нь `storage/`)
files_archive() {
  if [ "$BACKUP_MODE" = docker ]; then
    dc exec -T app tar -C /app/server -czf - storage
  else
    [ -d "$STORAGE_PATH" ] || mkdir -p "$STORAGE_PATH"
    tar -C "$(dirname "$STORAGE_PATH")" -czf - "$(basename "$STORAGE_PATH")"
  fi
}

files_in_backup() { [ "$STORAGE_DRIVER" = local ]; }

# Нөөцийн бүрэн бүтэн байдал (SHA256SUMS)
verify_sums() { (cd "$1" && sha256_tool -c --quiet SHA256SUMS) || die "$1: хяналтын нийлбэр таарахгүй — нөөц гэмтсэн"; }

# Файлын архивын дээд хавтасны нэр (STORAGE_DIR-ээс хамаарч `storage` биш байж болно). head ашиглахгүй — pipefail/SIGPIPE
archive_top() { tar -tzf "$1" | awk -F/ 'NR == 1 { print ($1 == "." ? $2 : $1) }'; }
