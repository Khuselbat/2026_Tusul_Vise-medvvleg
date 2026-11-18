# Production байршуулалт (VPS)

Энэ заавар нь “Цахим виз” системийг нэг VPS дээр **Docker Compose + Caddy (автомат HTTPS)**-ээр байршуулах, нөөцлөх,
хянах, шинэчлэх алхмуудыг агуулна. Жишээ: Ubuntu 24.04 LTS, домэйн `viz.example.mn`.

> Хурдан хяналт: §1 → §2 → §3 → §4 → §5 (нөөц) → §6 (мониторинг) → §10 хяналтын хуудас.

---

## 1. Шаардлага

| Зүйл | Хамгийн бага | Санал болгох |
|---|---|---|
| CPU / RAM | 2 vCPU / 2 GB | 2–4 vCPU / 4 GB (ClamAV асаавал +1.5 GB) |
| Диск | 20 GB SSD | 40 GB+ (хавсралт ≤100 MB/мэдүүлэг; нөөц локалд 14 хоног) |
| ҮС | Ubuntu 22.04/24.04 LTS, Debian 12 | |
| Сүлжээ | Нийтийн IPv4, 80 ба 443 порт нээлттэй | |
| Бусад | Домэйн (A бичлэг), SMTP эрх (имэйл илгээх), гадаад нөөцийн сан (S3/B2/өөр сервер) | |

Ачааллын туршилтаар (README §Ачааллын туршилт) 100 зэрэг хэрэглэгчийг нэг инстанс хангалттай даана.

## 2. DNS

Домэйн бүртгэгчийн самбарт:

```
viz.example.mn.   A     <VPS-ийн IPv4>
viz.example.mn.   AAAA  <IPv6>          # байвал
```

`dig +short viz.example.mn` нь VPS-ийн IP-г буцаах хүртэл (ихэвчлэн 5–30 мин) хүлээнэ — Caddy TLS гэрчилгээг
Let's Encrypt-ээс авахдаа домэйн энэ сервер рүү заасан байхыг шаарддаг.

## 3. Сервер бэлтгэх (нэг удаа)

```bash
# root-оор: ажлын хэрэглэгч + SSH түлхүүр
adduser civiz && usermod -aG sudo civiz
rsync --archive --chown=civiz:civiz ~/.ssh /home/civiz
# /etc/ssh/sshd_config: PasswordAuthentication no, PermitRootLogin no → systemctl reload ssh

# Галт хана: зөвхөн SSH, HTTP, HTTPS (MySQL, 4000 порт гадагш нээгдэхгүй)
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw enable

# Аюулгүй байдлын шинэчлэл автоматаар
apt update && apt install -y unattended-upgrades git rclone && dpkg-reconfigure -plow unattended-upgrades

# Docker Engine + compose plugin (албан ёсны скрипт)
curl -fsSL https://get.docker.com | sh
usermod -aG docker civiz        # дахин нэвтэрсний дараа sudo-гүй docker
```

> Docker нь UFW-ийн дүрмийг тойрч порт нээж чаддаг. Тиймээс compose файлд app-ийн 4000 порт **зөвхөн `127.0.0.1`**-д
> холбогдсон (`APP_BIND`), MySQL порт огт гаргаагүй. Үүнийг өөрчлөхгүй.

## 4. Суулгах

```bash
sudo mkdir -p /opt/civiz && sudo chown civiz:civiz /opt/civiz
git clone https://github.com/Khuselbat/2026_Tusul_Vise-medvvleg.git /opt/civiz
cd /opt/civiz
cp .env.example .env && chmod 600 .env
```

### 4.1 `.env` — заавал солих утгууд

Санамсаргүй утга үүсгэх: `openssl rand -hex 32` (түлхүүр бүрд **тусад нь** ажиллуулна).

| Хувьсагч | Утга |
|---|---|
| `DB_PASSWORD`, `DB_ROOT_PASSWORD` | `openssl rand -hex 16` — хоёр өөр |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `PASSPORT_KEY` | `openssl rand -hex 32` — паспортын дугаар, 2FA нууцын шифрлэлт |
| `FILE_KEY` | `openssl rand -hex 32` — хавсралтын шифрлэлт (PASSPORT_KEY-ээс **өөр**) |
| `DOMAIN` | `viz.example.mn` |
| `APP_BASE_URL` | `https://viz.example.mn` (имэйл доторх холбоос; хуучин нэр `APP_URL` хэвээр ажиллана) |
| `FORCE_HTTPS` / `COOKIE_SECURE` | `1` / `1` |
| `MAIL_TRANSPORT` | `smtp` + `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (Gmail: 465/1 + App Password — WINDOWS_SETUP.md). Шалгах: админы самбар → “Туршилтын имэйл илгээх” |
| `CLAMAV_HOST` | `clamav` (вирус шалгалт асаах бол, §4.3) |
| `RETENTION_*`, `KEEP_DAYS` | Байгууллагын журмаар батлагдсан хугацаа |

> ⚠ **`PASSPORT_KEY`, `FILE_KEY`-ийг алдвал шифрлэсэн паспорт, бүх хавсралтыг сэргээх боломжгүй.** Нөөцөд түлхүүр
> ордоггүй (санаатайгаар). `.env`-ийн хуулбарыг нууц үгийн менежер (Bitwarden, 1Password, KeePass) эсвэл сейфэнд
> **серверээс тусад нь** хадгална. Түлхүүр эргүүлэх: README “Түлхүүр эргүүлэх”.

### 4.2 Эхлүүлэх

```bash
docker compose --profile https up -d --build
docker compose ps                       # db, app — healthy; caddy — running
docker compose logs app | head          # "N migration хэрэгжлээ" → "Цахим виз сервер"
curl -fsS https://viz.example.mn/api/health
# {"ok":true,"status":"ok","version":"1.0.0","uptimeSec":…,"checks":{"db":{"ok":true,…},"storage":{"ok":true,…}}}
```

* App эхлэх бүрд DB бэлэн болохыг хүлээж (≤60 сек), **хэрэгжээгүй migration-уудыг автоматаар** ажиллуулна. Өгөгдөл устгахгүй.
* Production image-д жишээ өгөгдөл (seed), санг устгах скрипт (`db:reset`), тест, npm **байхгүй**.
* App контейнер: root биш хэрэглэгч, зөвхөн уншигдах файлын систем, capability-гүй, лог 5 × 20 MB-аар эргэлдэнэ.

### 4.3 Анхны админ

```bash
docker compose exec app node scripts/create-admin.js --email admin@example.mn --name "Системийн админ"
# Түр нууц үгийг НЭГ удаа хэвлэнэ. ADMIN_PASSWORD орчны хувьсагчаар өөрөө өгч болно.
```

Визийн төрлийн нийтлээгүй ноорог (KVAC-ын албан эх сурвалжаас; админ шалгаж нийтэлнэ):
`docker compose exec app node scripts/import-visa-drafts.js --admin admin@example.mn`

`https://viz.example.mn/login` → нэвтрэх → 2FA (Google/Microsoft Authenticator) QR бүртгэх → **10 нөөц кодыг** хадгална →
Профайлаас нууц үгээ солино. Дараа нь админ “Хэрэглэгчид” дэлгэцээс операторуудыг үүсгэнэ, “Улс/Визийн төрөл”-өөс
лавлах мэдээллийг эх сурвалжтай нь нийтэлнэ (USER_GUIDE.md §3).

**Вирус шалгалт (санал болгох):** `.env`-д `CLAMAV_HOST=clamav` → `docker compose --profile https --profile av up -d`.
ClamAV анх эхлэхэд вирусын санг татахад ~2–5 мин; энэ хооронд шинэ файл “Вирус шалгаж байна” төлөвтэй хүлээгдэнэ.

> Дараагийн бүх `docker compose` командад ашиглаж буй profile-уудаа (`--profile https --profile av …`) заана, эсвэл
> `.env`-д `COMPOSE_PROFILES=https,av,monitoring` гэж нэг удаа бичнэ.

## 5. Нөөцлөлт ба сэргээлт (NFR-04)

Зарчим **3-2-1**: 3 хуулбар (амьд сан + локал нөөц + гадаад нөөц), 2 өөр төхөөрөмж, 1 нь өөр газар. Нөөцийн нас ≤ 24 цаг,
сэргээх хугацаа ≤ 4 цаг. Скриптүүд: `scripts/backup.sh`, `restore.sh`, `restore-drill.sh` (Windows: `.ps1`).

Нөөц бүр: `backups/<UTC огноо>/` — `db.sql.gz` (mysqldump, single-transaction), `files.tar.gz` (хувийн файл, AES-256-GCM-ээр
шифрлэгдсэн хэвээр), `MANIFEST.txt` (schema хувилбар, файлын тоо, commit), `SHA256SUMS`.

### 5.1 Гадаад сан (rclone, шифрлэлттэй)

Нөөцөд хувийн мэдээлэл (нэр, имэйл, анкет) байгаа тул гадаад сан руу **зөвхөн rclone-ийн `crypt` remote-оор** хуулна
(скрипт crypt биш remote-ыг татгалзана). Жишээ — S3-тэй нийцтэй сан (Backblaze B2, Wasabi, AWS S3, MinIO, өөр сервер):

```bash
rclone config
#  n) New remote → name: s3raw → Storage: s3 (эсвэл b2, sftp) → provider, access key, secret, region/endpoint
#  n) New remote → name: offsite → Storage: crypt → remote: s3raw:civiz-backups
#     filename_encryption: standard → password: (шинэ, урт) → password2 (salt): (шинэ, урт)
rclone lsd offsite:                         # шалгах
```

> rclone-ийн crypt нууц үгүүд (`~/.config/rclone/rclone.conf`)-ийг `.env`-ийн хамт сервергүй газар хадгална —
> сервер бүрэн устсан үед нөөцийг тайлах цорын ганц түлхүүр. Bucket-д **object lock / versioning** асаавал
> ransomware нөөцийг устгаж чадахгүй.

`.env`-д:

```
BACKUP_REMOTE=offsite:
KEEP_DAYS=14
REMOTE_KEEP_DAYS=90
BACKUP_PING_URL=https://<uptime-kuma>/api/push/<token>?status=up   # §6.3, заавал биш
```

### 5.2 Өдөр бүрийн нөөц (cron)

```bash
cd /opt/civiz && BACKUP_MODE=docker scripts/backup.sh       # гараар нэг удаа туршина
crontab -e
```
```cron
# Өдөр бүр 02:00 UTC — нөөц + гадаад сан руу хуулах
0 2 * * *  cd /opt/civiz && BACKUP_MODE=docker scripts/backup.sh >> /var/log/civiz/backup.log 2>&1
# Сар бүрийн 1-нд 03:00 — гадаад сангаас татаж сэргээлтийн туршилт
0 3 1 * *  cd /opt/civiz && BACKUP_MODE=docker DRILL_FROM_REMOTE=1 scripts/restore-drill.sh >> /var/log/civiz/drill.log 2>&1
```
(`sudo mkdir -p /var/log/civiz && sudo chown civiz /var/log/civiz`.) Скрипт амжилтгүй бол дутуу хавтсыг устгаж, 0 биш кодоор
гарна — `BACKUP_PING_URL` дуудагдахгүй тул мониторинг сэрэмжлүүлнэ.

`STORAGE_DRIVER=s3` үед хавсралтыг энэ скрипт нөөцлөхгүй (`MANIFEST`-д тэмдэглэнэ) — bucket-ийн **versioning +
өөр бүс рүү replication**-ийг асаана.

### 5.3 Сар бүрийн сэргээлтийн туршилт

`scripts/restore-drill.sh` нь нөөцийг production-оос **тусдаа** `civiz_restore_drill` сан болон түр хавтсанд сэргээж:

1. `SHA256SUMS` — нөөц гэмтээгүй;
2. dump бүрэн (`Dump completed`), хүснэгт, илгээсэн мэдүүлгийн тоо, schema хувилбар;
3. `verify-storage.js` — санд бүртгэлтэй файл бүр нөөцөд байгаа, **шифр тайлагдаж**, SHA-256 + хэмжээ таарч буй (100%),
   анкетгүй илгээсэн мэдүүлэг 0;
4. хугацааг хэмжиж `backups/restore-drill.log`-д `PASS/FAIL …` мөр нэмээд туршилтын санг устгана.

Гар аргаар (сар бүр, хариуцагч гарын үсэг зурна):

| # | Шалгах | Хэвийн |
|---|---|---|
| 1 | `tail -1 backups/restore-drill.log` | `PASS`, `age_h` ≤ 24, `duration_s` ≪ 14400 |
| 2 | `submitted_apps` ба админ самбарын илгээсэн мэдүүлгийн тоо | ойролцоо (нөөцөөс хойших илгээлтээр л зөрнө) |
| 3 | `rclone lsf offsite:` | Сүүлийн 90 хоногийн хавтсууд, өнөөдрийнх байна |
| 4 | `.env` ба `rclone.conf`-ийн сервергүй хуулбар | Нууц үгийн менежерт шинэчлэгдсэн |

### 5.4 Бодит сэргээлт (осол)

```bash
cd /opt/civiz
rclone copy offsite:20261111T020000Z backups/20261111T020000Z   # локал нөөц байхгүй бол
BACKUP_MODE=docker scripts/restore.sh backups/20261111T020000Z
#  → хяналтын нийлбэр → “yes” → app зогсооно → бүх хүснэгтийг устгаж dump сэргээнэ → файл солино → verify-storage → app эхлүүлнэ
```

Шинэ сервер дээр бүрэн сэргээх: §3 → §4 (`.env`-ийг **хуучин түлхүүрүүдтэй** нь сэргээнэ) → `docker compose up -d` →
`restore.sh`. Нөөцөөс хойш хийгдсэн илгээлтүүд алга болох тул мэдүүлэгчдэд мэдэгдэнэ.

## 6. Мониторинг

### 6.1 Health endpoint

| Endpoint | Утга | Хэрэглээ |
|---|---|---|
| `GET /api/health/live` | `{"ok":true}` — процесс амьд (хамааралгүй) | Процесс гацсан эсэх |
| `GET /api/health` | 200 `status: ok`/`degraded`, 503 `status: down`; `checks.db`, `checks.storage`, (`checks.clamav`) — `ok`, `ms` | Docker HEALTHCHECK, uptime монитор |

* `down` (503): өгөгдлийн сан эсвэл файлын сан (local хавтас бичигдэхгүй / S3 bucket хүрэхгүй) — үйлчилгээ ажиллахгүй.
* `degraded` (200): ClamAV хүрэхгүй — шинэ файл “шалгаж байна” төлөвт хүлээгдэнэ, бусад нь ажиллана.
* Шалгалт бүр ≤3 сек (`HEALTH_TIMEOUT_MS`); хариунд хост, зам, алдааны мессеж орохгүй — шалтгааныг логоос.

### 6.2 Алдааны лог

App нь pino JSON мөр бичнэ (`level` 30 info, 40 warn, 50 error, 60 fatal), хүсэлт бүр `X-Request-Id`-тай. Хэрэглэгч “Серверийн
алдаа … requestId: …” гэж мэдэгдвэл тэр id-аар хайна. Нууц үг, паспорт, анкет, токен, cookie, query string логт ордоггүй.

```bash
docker compose logs -f app                                     # шууд
docker compose logs --since 24h app | grep -E '"level":(50|60)' # сүүлийн 24 цагийн алдаа
docker compose logs --since 1h app | grep '<request-id>'
docker compose logs app | grep '"msg":"health check failed"'   # аль шалгалт унасан (check: db|storage|clamav)
```

Лог 5 × 20 MB-аар эргэлдэнэ (`x-logging`). Урт хугацаанд хадгалах/хайх бол Docker-ийн `journald`/`syslog` драйвер эсвэл
Loki, Graylog руу дамжуулна. Процесс тодорхойгүй алдаагаар (`uncaughtException`) уналаа гэвэл `fatal` мөр бичээд гарч,
`restart: unless-stopped` дахин эхлүүлнэ; `docker compose ps`-ийн `RESTARTS` өсөж байвал шалгана.

### 6.3 Uptime (Uptime Kuma)

```bash
docker compose --profile monitoring up -d uptime
ssh -L 3001:127.0.0.1:3001 civiz@viz.example.mn   # өөрийн компьютерээс → http://127.0.0.1:3001 (интернэтэд нээгдэхгүй)
```

Мониторууд:

| Төрөл | Тохиргоо | Сэрэмжлүүлэг |
|---|---|---|
| HTTP(s) – Keyword | `https://viz.example.mn/api/health`, keyword `"status":"ok"`, 60 сек, 3 удаа | down / degraded |
| HTTP(s) | `https://viz.example.mn/` | Caddy/SPA |
| Certificate expiry | дээрхийн “Certificate Expiry Notification” | TLS < 14 хоног |
| Push | `backup.sh`-ийн `BACKUP_PING_URL`, heartbeat 26 цаг | Нөөц тасарсан |
| Push | `restore-drill.sh`-ийн `DRILL_PING_URL`, heartbeat 32 хоног | Туршилт хийгдээгүй |

Мэдэгдлийн суваг (Settings → Notifications): имэйл (SMTP), Telegram, Slack г.м. Нэг VPS доторх монитор нь сервер бүхэлдээ
унахыг илрүүлэхгүй — **гадны** үнэгүй хэрэгсэл (UptimeRobot, Better Stack)-ээр `/api/health`-ийг давхар хянана.

Диск: `df -h /` 80%-иас хэтэрвэл `KEEP_DAYS`-ийг багасгах эсвэл диск томсгоно (`docker system df`).

## 7. Шинэчлэх

```bash
cd /opt/civiz
BACKUP_MODE=docker scripts/backup.sh                     # шинэчлэлийн өмнө заавал
git fetch && git log --oneline HEAD..origin/main          # юу орж ирэхийг харах; docs/DECISIONS.md
git pull
APP_VERSION=$(git rev-parse --short HEAD) docker compose --profile https up -d --build app
docker compose logs app | grep -E 'migration|Цахим виз сервер'
curl -fsS https://viz.example.mn/api/health
```

Зогсолт: app дахин эхлэх ~5–15 сек (Caddy энэ хооронд 502 өгнө). Хуучин контейнер SIGTERM аваад эхэлсэн хүсэлтүүдээ
дуусгаж (≤ 9 сек) гарна.

**Буцаах (rollback):** `git checkout <өмнөх commit>` → дахин build. Шинэ хувилбар **migration** хэрэгжүүлсэн бол хуучин код
шинэ схемтэй ажиллахгүй байж болно → §5.4-ээр шинэчлэлийн өмнөх нөөцийг сэргээнэ.

## 8. Олон инстанс (заавал биш)

Ар талын ажлууд (имэйл outbox, вирус шалгалт, хадгалах хугацааны цэвэрлэгээ) MySQL-ийн нэрлэсэн түгжээгээр (`GET_LOCK`)
нэг л инстанст ажилладаг тул `docker compose up -d --scale app=2` аюулгүй. Файлын сан нь хуваалцсан байх ёстой
(`STORAGE_DRIVER=s3`), Caddyfile-д `reverse_proxy app:4000`-ийг хэд хэдэн upstream-тэй болгоно. Нэвтрэлтийн оролдлогын
хязгаар (rate limit) инстанс тус бүрд тооцогдоно.

## 9. Windows Server дээр (Docker Desktop эсвэл гараар суулгасан MySQL)

* Нөөц: `scripts\backup.ps1`, `restore.ps1`, `restore-drill.ps1` — ижил формат (Linux-ийн `restore.sh`-ээр ч сэргээнэ).
  Docker Desktop бол `$env:BACKUP_MODE='docker'`; гараар суулгасан MySQL бол `mysqldump`-ийг PATH-аас эсвэл
  `C:\Program Files\MySQL\MySQL Server *\bin`-ээс автоматаар олно.
* Task Scheduler (администратор PowerShell):

  ```powershell
  schtasks /Create /TN "civiz-backup" /SC DAILY /ST 02:00 /RU SYSTEM /RL HIGHEST /F `
    /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\civiz\scripts\backup.ps1"
  schtasks /Create /TN "civiz-restore-drill" /SC MONTHLY /D 1 /ST 03:00 /RU SYSTEM /RL HIGHEST /F `
    /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\civiz\scripts\restore-drill.ps1"
  ```
* rclone: <https://rclone.org/downloads/> → `rclone.exe`-ийг PATH-д; тохиргоо §5.1-тэй ижил.
* HTTPS: Docker Desktop дээр `--profile https` (Caddy), эсвэл IIS/nginx reverse proxy + `TRUST_PROXY=1`.

## 10. Production хяналтын хуудас

- [ ] DNS A бичлэг → VPS; `ufw status` — зөвхөн 22, 80, 443
- [ ] `.env`: бүх нууц санамсаргүй, `FORCE_HTTPS=1`, `COOKIE_SECURE=1`, `APP_BASE_URL=https://…`, SMTP (туршилтын имэйл ирсэн)
- [ ] `.env` + `rclone.conf`-ийн хуулбар сервергүй, найдвартай газар
- [ ] `https://<домэйн>/api/health` → `"status":"ok"`; SSL Labs үнэлгээ A
- [ ] Анхны админ 2FA-тай; түр нууц үг солигдсон; операторууд үүссэн
- [ ] ClamAV асаалттай (`--profile av`, `CLAMAV_HOST=clamav`)
- [ ] `backup.sh` cron-д, гадаад сан руу (crypt) хуулагдаж байна; `restore-drill.sh` PASS
- [ ] Uptime монитор (дотоод + гадны), нөөцийн push монитор, мэдэгдлийн суваг туршсан
- [ ] Визийн шаардлагыг ЭСЯ/KVAC-ын хамгийн сүүлийн журамтай тулгаж нийтэлсэн
- [ ] Хадгалах хугацаа (`RETENTION_*`, `KEEP_DAYS`, `REMOTE_KEEP_DAYS`)-г журмаар баталсан
- [ ] Эрх бүхий байгууллагатай хамтын ажиллагааны зохицуулалт (тайлангийн таамаглал А3)

## 11. Түгээмэл асуудал

| Шинж тэмдэг | Шалтгаан / шийдэл |
|---|---|
| Caddy: `obtaining certificate … failed` | DNS хараахан тараагүй эсвэл 80/443 хаалттай. `dig`, `ufw status`; `docker compose logs caddy` |
| `/api/health` 503, `storage.ok:false` | `files` volume дүүрсэн/эрх (`df -h`), S3 бол bucket/түлхүүр; лог: `health check failed` |
| `/api/health` 503, `db.ok:false` | `docker compose ps db`, `docker compose logs db`; диск дүүрэлт |
| App дахин дахин эхэлж байна | `docker compose logs app` — `Migration амжилтгүй` (өөрчилсөн migration файл?) эсвэл `Орчны хувьсагч дутуу` |
| Имэйл ирэхгүй | `MAIL_TRANSPORT=smtp`, `SMTP_*`; `docker compose logs app \| grep 'notification email failed'`; SPF/DKIM бичлэг |
| Нэвтэрсний дараа шууд гарч байна | HTTPS-гүй хандаж байна (`COOKIE_SECURE=1`) — `https://`-ээр нээх |
| `backup.sh`: `crypt remote биш` | §5.1-ийн дагуу crypt remote үүсгэж `BACKUP_REMOTE`-д түүнийг заана |
| Сэргээлтийн туршилт `FAIL … file missing` | Тухайн нөөцийн үед файлын хавтас дутуу — дараагийн нөөцийг шалгах; `verify-storage.js`-ийг амьд санд ажиллуулах |
