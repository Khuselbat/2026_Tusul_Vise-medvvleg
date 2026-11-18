# Цахим виз мэдүүлгийн нэгдсэн веб программ

Төслийн тайлан (“Tsahim viz negdsen tailan — Khuselbat”)-д тодорхойлсон шаардлага, юзкейс, өгөгдлийн схем (Зураг 36), 25 дэлгэцийн прототип (Зураг 37–61)-ийн дагуу хэрэгжүүлсэн бүрэн ажиллагаатай систем.

| Давхарга | Технологи |
|---|---|
| Frontend | React 18 + Vite 8, React Router 7 (SPA, responsive), монгол/англи (i18next), WCAG 2.1 AA (axe) |
| Backend | Node.js 22+ / Express 4 (REST API) |
| Өгөгдлийн сан | MySQL 8 / MariaDB 10.6+ — 11 үндсэн (Зураг 36) + 6 Үе 1-ийн хүснэгт, хувилбартай migration (`database/migrations/`) |
| Файлын сан | Сервер дээрх хувийн хавтас эсвэл S3-тэй нийцтэй сан (MinIO), сонголтоор AES-256-GCM (вэбээс шууд хандахгүй) |
| Тест | Node test runner + Supertest — 147 интеграцын тест бодит MySQL/MariaDB дээр (+ S3 драйверийн тест CI-д); Playwright E2E 10 тест × (desktop + mobile), axe хүртээмж |
| Хувийн мэдээлэл | Файлын сан local/S3 + AES-256-GCM, ClamAV, хадгалах хугацааны цэвэрлэгээ, ZIP татах, бүртгэл устгах хүсэлт, түлхүүр эргүүлэх; `npm audit` 0 |
| Нэвтрэлт | Серверт хадгалагдах сесс, имэйл баталгаажуулалт, нууц үг сэргээх, ажилтны 2FA (TOTP) заавал, мэдэгдэл (хонх + имэйл) |
| Чанар | ESLint + Prettier, GitHub Actions CI (lint · test · build · E2E · нөөц/сэргээлт · Docker), pino бүтэцтэй лог |
| Байршуулалт | Docker Compose (MySQL + App + Caddy HTTPS + ClamAV + Uptime Kuma), `/api/health`, нөөц → шифрлэсэн гадаад сан, сар бүрийн сэргээлтийн туршилт — [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Гарын авлага | [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — мэдүүлэгч, оператор, админ (дэлгэцийн зурагтай) |

---

## 1. Хурдан эхлүүлэх

> **Windows хэрэглэгч:** алхам алхмаар заавар — [WINDOWS_SETUP.md](WINDOWS_SETUP.md)

### А. Docker-оор (санал болгох)

```bash
cp .env.example .env
# .env дотор DB_PASSWORD, DB_ROOT_PASSWORD, JWT_SECRET, PASSPORT_KEY, FILE_KEY, APP_URL-ийг солино:
#   openssl rand -hex 32      ← JWT_SECRET, PASSPORT_KEY, FILE_KEY тус бүрд
docker compose up -d --build                 # app эхлэхдээ migration-уудыг автоматаар ажиллуулна
docker compose exec app node scripts/create-admin.js --email admin@example.mn --name "Админ"
```
Production-д жишээ өгөгдөл (seed) хориглогдсон — анхны админыг дээрх командаар үүсгэнэ (түр нууц үгийг нэг удаа хэвлэнэ).
Нээх: <http://localhost:4000> (app порт анхдагчаар зөвхөн localhost-д нээгдэнэ). VPS дээр алхам алхмаар: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

HTTPS-тэй (домэйн DNS тохируулсан үед): `.env` дотор `DOMAIN=viz.example.mn`, `FORCE_HTTPS=1` болгоод
`docker compose --profile https up -d` — Caddy автоматаар Let's Encrypt гэрчилгээ авна.

### Б. Гараар (хөгжүүлэлт)

Шаардлага: Node.js 22+, MySQL 8 эсвэл MariaDB 10.6+.

```sql
-- MySQL дээр нэг удаа:
CREATE DATABASE civiz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE civiz_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'civiz'@'localhost' IDENTIFIED BY 'civiz_pass';
GRANT ALL ON civiz.* TO 'civiz'@'localhost';
GRANT ALL ON civiz_test.* TO 'civiz'@'localhost';
```

```bash
cd server && npm install
npm run db:reset          # бүх хүснэгтийг устгаад migration + жишээ өгөгдөл (зөвхөн dev/test; production-д татгалзана)
npm run dev               # API → http://localhost:4000

cd ../client && npm install
npm run dev               # UI → http://localhost:5173  (/api-г 4000 руу proxy хийнэ)
```

Production build: `cd client && npm run build` → сервер `client/dist`-ийг өөрөө үйлчилнэ (нэг порт).

### Жишээ нэвтрэх эрх (`db:seed`)

| Эрх | Имэйл | Нууц үг |
|---|---|---|
| Админ | admin@civiz.mn | Admin1234 |
| Оператор | operator@civiz.mn | Operator1234 |
| Оператор 2 | operator2@civiz.mn | Operator1234 |
| Мэдүүлэгч | applicant@civiz.mn | Applicant1234 |

Жишээ өгөгдөлд: БНСУ (идэвхтэй), C-3-9 ангиллын нийтэлсэн хувилбар (KVAC-ын эх сурвалж, 2026-10-30 шалгасан, 5 материал), D-2 ноорог, мэдүүлэгчийн 3 мэдүүлэг (бүрэн / хянаж буй / хуваарилаагүй). Бүх хувийн мэдээлэл зохиомол (таамаглал А3).

### Өгөгдлийн сангийн migration

```bash
cd server
npm run db:migrate        # зөвхөн хэрэгжээгүй migration-уудыг ажиллуулна — өгөгдөл УСТГАХГҮЙ (production-д аюулгүй)
npm run db:reset          # dev/test: бүх хүснэгтийг устгаад migration + seed
npm run user:create-admin -- --email a@b.mn --name "Нэр"   # ADMIN_PASSWORD орчны хувьсагч эсвэл санамсаргүй
```
Шинэ өөрчлөлт: `database/migrations/NNN_name.sql` (жишээ `002_add_supplements.sql`) нэмнэ. Хэрэгжсэн файлыг **засахгүй** —
`schema_migrations`-д checksum хадгалагдах тул өөрчилбөл `db:migrate` зогсоно. Migration системээс өмнө үүссэн санг автоматаар
baseline хийнэ (001-ийг хэрэгжсэн гэж тэмдэглэнэ).

### Тест ба чанар

```bash
cd server && npm test     # civiz_test сан дээр 147 интеграцын тест (API, migration, лог, Үе 1–5, аюулгүй байдал, UC A/E урсгал)
cd client && npm run build
npm install               # (репоны үндсэнд, нэг удаа) ESLint, Prettier, Playwright
npx playwright install chromium   # нэг удаа
npm run lint              # ESLint (server + client)
npm run format:check      # Prettier (засах: npm run format)
npm run test:e2e          # Playwright: зочин → бүртгэл → анкет → файл → илгээх → хуваарилах → үнэлэх → харах
```
E2E нь `client/dist`-ийг 4100 порт дээр үйлчилж, `civiz_test` санг цэвэрлэж ажиллана. CI (`.github/workflows/ci.yml`) push бүрд
lint, тест (Node 22/24), build, E2E-г MySQL 8 контейнер дээр ажиллуулна.

### Нэвтрэлт, 2FA, имэйл (Үе 2)

* **Ажилтан (оператор, админ)** анх нэвтрэхэд QR код гарна → Google/Microsoft Authenticator апп-аар уншуулж 6 оронтой кодоо
  оруулна → **10 нөөц код** нэг удаа харагдана (хадгална). Дараа нь нэвтрэх бүрд апп-ийн код асууна.
  Утсаа гээвэл нөөц кодоор нэвтэрнэ, эсвэл өөр админ “Хэрэглэгчид” дэлгэцээс **2FA дахин тохируулах**.
  Зөвхөн хөгжүүлэлтэд түр унтраах: `server/.env` → `MFA_REQUIRED=0` (production-д үл тооно).
* **Мэдүүлэгч** бүртгүүлэхэд баталгаажуулах холбоос имэйлээр очно; баталгаажуулаагүй бол мэдүүлэг илгээхгүй (самбарт сануулга, “Дахин илгээх”).
* **Нууц үг сэргээх:** `/forgot-password` → 30 минутын нэг удаагийн холбоос → бүх төхөөрөмжөөс гарна.
* **Сесс:** Профайл → “Нэвтэрсэн төхөөрөмжүүд” — нэг бүрчлэн хаах, бүх төхөөрөмжөөс гарах; нууц үг солиход бусад сесс хүчингүй.
* **Имэйл хөгжүүлэлтэд:** SMTP хэрэггүй — захидлууд `server/mail-outbox/` хавтсанд `.eml` (+ уншихад хялбар `.json`) болж хадгалагдана.
  Production: `MAIL_TRANSPORT=smtp`, `SMTP_*`, `APP_URL` тохируулна.
* **Мэдэгдэл:** илгээсэн, хуваарилагдсан, “Дутуу”, “Бүрэн”, нэмэлт материал ирсэн, хүргүүлсэн — дээд мөрний 🔔 болон имэйл.
  Имэйлд зөвхөн лавлах дугаар ба холбоос (тайлбар, хувийн мэдээлэлгүй); outbox амжилтгүй бол 5 хүртэл дахин оролдоно.

### Хувийн мэдээлэл ба аюулгүй байдал (Үе 3)

* **Файлын сан:** `STORAGE_DRIVER=local|s3` (MinIO/AWS: `S3_*`). `STORAGE_ENCRYPT=1` + `FILE_KEY` (паспортын түлхүүрээс тусдаа) →
  файл бүр AES-256-GCM; шифрлээгүй хуучин файл хэвээр уншигдана. Docker compose-д шифрлэлт анхдагчаар асаалттай.
* **Вирус шалгалт:** `CLAMAV_HOST` (Docker: `--profile av`, `CLAMAV_HOST=clamav`) → шинэ файл “Вирус шалгаж байна” төлөвтэй,
  шалгагдаж дуусах хүртэл хэн ч нээхгүй, илгээхгүй; халдвартай бол хадгалалтаас устгаж “Вирус илэрсэн” гэж харуулна.
  ClamAV-гүй орчинд (dev) зөвхөн агуулгын төрлийн (magic byte) шалгалт.
* **Хадгалах хугацаа:** сервер өдөр бүр (мөн `npm run maintenance:retention [-- --dry-run]`) — `RETENTION_DRAFT_DAYS` (30) хэтэрсэн ноорог,
  өнчин файл, хуучин токен/сесс, уншсан хуучин мэдэгдлийг устгана. **Илгээсэн мэдүүлгийн архивыг автоматаар устгахгүй.**
* **Мэдээллээ татах:** Профайл → “Бүх мэдээллээ татах (ZIP)” (нууц үгээр) — анкет (паспорт бүтнээр), хавсралт, архив, импорт, мэдэгдэл.
* **Бүртгэл устгах:** Профайл → хүсэлт (нууц үгээр) → админ “Устгах хүсэлт” дэлгэцээс баталгаажуулна → анкет, бүх файл, импорт,
  мэдэгдэл бүрмөсөн устаж, илгээсэн мэдүүлэг нэргүй статистик болж үлдэнэ (хянагдаж буй мэдүүлэгтэй бол хүлээнэ).
* **Түлхүүр эргүүлэх:** шинэ түлхүүрийг `PASSPORT_KEY/_ID` (`FILE_KEY/_ID`), хуучныг `PASSPORT_KEYS_OLD=k1:hex` (`FILE_KEYS_OLD`)-д тавиад
  `npm run keys:rotate -- --dry-run` → `npm run keys:rotate -- --files` → `node scripts/verify-storage.js` → хуучин түлхүүрийг хасна.

### Хэрэглэгчийн туршлага (Үе 4)

* **PDF хураангуй:** мэдүүлгийн дэлгэрэнгүй → “PDF хураангуй” — анкет, хавсралтын жагсаалт, лавлах дугаар; хуудас бүрт
  “АЛБАН БАРИМТ БИШ” усан тэмдэг, паспорт нууцлагдсан.
* **Автомат хадгалалт:** анкет бичихээ зогсоосноос 1.5 сек дараа серверт **шифрлэгдэж** хадгалагдана; хуудсаа дахин ачаалахад сэргэнэ.
  Сүлжээ тасарвал анхааруулга гарч, сэргэхэд автоматаар хадгална.
* **Хэл:** дээд мөрний сонголтоор монгол (үндсэн) / англи. Монгол текст өөрөө түлхүүр (`client/src/locales/en.json`); орчуулгагүй
  бол монголоор харагдана. Серверийн алдааны мессеж мөн орчуулагдана; имэйл, PDF монголоор.
* **Хүртээмж (WCAG 2.1 AA):** axe-core E2E нь 25 дэлгэцийг шалгана (зөрчил 0); цонхны фокус хавх, Escape, фокус буцаах; skip link;
  контраст ≥4.5:1; график бүр хүснэгт хувилбартай, гараар сонгогдоно.
* **Статистик** (`/admin/stats`): долоо хоног/сараар илгээлт, эхний үнэлгээ хүртэлх хугацаа (медиан, 90%), операторын ачаалал —
  зөвхөн нэгтгэсэн тоо.
* **Оператор:** хайлт (лавлах дугаар, мэдүүлэгч), төлөв, эрэмбэ, хуудаслалт. **Админ:** олноор сонгож хуваарилах (≤100, бүгд эсвэл юу ч биш).
* **Олон улс:** шинэ улсыг админы “Улс” → “Визийн төрөл” → хувилбар нийтлэх + `SUBMITTABLE_COUNTRIES=KR,JP` л хангалттай —
  код өөрчлөхгүй (`test/stage4.test.js` баталгаажуулна).

### Production (Үе 5)

Алхам алхмаар VPS байршуулалт, HTTPS, нөөц, мониторинг, шинэчлэлт — **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.
Хэрэглэгчийн гарын авлага — **[docs/USER_GUIDE.md](docs/USER_GUIDE.md)**.

* **Docker image:** олон шатлалт build, зөвхөн production хамаарал; seed, `db:reset`, тест, npm image-д **байхгүй**
  (`.dockerignore`). Non-root, зөвхөн уншигдах root FS, capability-гүй, `init` + SIGTERM-д эхэлсэн хүсэлтүүдийг дуусгаж зогсоно.
  Эхлэхдээ DB-г хүлээж (≤60 сек) migration-уудыг автоматаар ажиллуулна. Лог 5 × 20 MB-аар эргэлдэнэ.
* **Мониторинг:** `GET /api/health` — DB + файлын сан (+ ClamAV) шалгаж 200 `ok`/`degraded` эсвэл 503 `down`
  (шалгалт тус бүр ≤3 сек, дотоод мэдээлэл задлахгүй); `GET /api/health/live` — процесс амьд. Uptime Kuma:
  `docker compose --profile monitoring up -d`.
* **Нөөц:** `scripts/backup.sh` / `backup.ps1` (host эсвэл `BACKUP_MODE=docker`) → `db.sql.gz` + `files.tar.gz` + `MANIFEST.txt`
  + `SHA256SUMS` → rclone **crypt** remote руу (шифрлэлтгүй remote-ыг татгалзана). `restore.sh` / `restore.ps1` — бүх хүснэгтийг
  устгаж сэргээгээд `verify-storage`. **`restore-drill.sh` / `.ps1`** — сар бүр нөөцийг тусдаа `civiz_restore_drill` санд сэргээж
  файл бүрийн SHA-256-г тулгаад `backups/restore-drill.log`-д PASS/FAIL бичнэ (production-д хүрэхгүй).
* **Олон инстанс:** имэйл outbox, вирус шалгалт, хадгалах хугацааны ажил MySQL-ийн `GET_LOCK`-оор нэг л инстанст ажиллана.

#### Ачааллын туршилт (100 зэрэг хэрэглэгч)

```bash
cd server && DB_NAME=civiz_load npm run db:reset && DB_NAME=civiz_load node scripts/loadtest-prepare.js --users 100 && cd ..
# сервер: NODE_ENV=production DB_NAME=civiz_load STORAGE_ENCRYPT=1 … npm start  (дэлгэрэнгүй: loadtest/run.js толгой)
npm run loadtest -- --url http://127.0.0.1:4000 --users 100 --duration 20
```

100 өөр мэдүүлэгч (тус бүр өөрийн сесстэй), 100 зэрэг холболт × 20 сек, сервер **production горимд** (файл шифрлэлттэй,
bcrypt cost 12), нэг Node процесс + MariaDB 11.4, нэг машин дээр (Intel Core Ultra 7 265, 20 thread, 15 GB RAM, Windows 11, Node 22.21):

| Хувилбар | Хүсэлт/сек | p50 мс | p90 мс | p99 мс | max мс | Алдаа / 2xx биш |
|---|---:|---:|---:|---:|---:|---:|
| 100 хэрэглэгч **зэрэг нэвтрэх** (bcrypt 12) | — | 2285 | — | 4220 (p95) | 4398 | 0 |
| Нийтийн: визийн жагсаалт + дэлгэрэнгүй + SPA | 3158 | 30 | 48 | 59 | 82 | 0 |
| Мэдүүлэгч: самбар + архив + мэдэгдэл | 1976 | 50 | 59 | 64 | 75 | 0 |
| Мэдүүлэгч: анкет автомат хадгалах (шифрлэж DB-д бичих) | 2247 | 44 | 47 | 54 | 99 | 0 |
| **50 мэдүүлэг зэрэг бүтэн илгээх** (анкет + 3 файл + илгээх, нэг мэдүүлэгт) | — | 280 | — | 318 (p95) | 321 | 0 |

NFR-04/05: дээрх өгөгдлөөр (53 илгээсэн мэдүүлэг, 159 шифрлэгдсэн файл) `backup.sh` → `restore-drill.sh` болон `.ps1` хувилбар —
**159/159 файл SHA-256 таарсан (100%)**, анкетгүй мэдүүлэг 0, сэргээх хугацаа ~2 сек.

Дүгнэлт: 100 зэрэг хэрэглэгчийн ердийн үйлдлүүд p99 < 70 мс, алдаагүй. **Анхны хэмжилтээр 100 зэрэг нэвтрэлт бүгд ~18 сек**
хүлээж, тэр хугацаанд бусад бүх хүсэлт зогсож байсан (bcryptjs үндсэн event loop дээр) → bcrypt-ийг `worker_threads`-ийн
санд шилжүүлснээр p50 2.3 сек / p95 4.2 сек болж, бусад хүсэлт саатахгүй болсон (`server/src/lib/password.js`, D-53).
Нэвтрэлт нь зориуд удаан (brute force-оос хамгаална); бодит хэрэглээнд 100 хүн яг нэг секундэд нэвтрэх нь ховор.
VPS (2–4 vCPU) дээр тоо бага байна — байршуулсны дараа ижил командаар хэмжинэ.

### Лог

`pino` — хүсэлт бүр `X-Request-Id`-тай (audit_events.request_id-тай ижил). Dev-д нэг мөр, production-д JSON.
Хүсэлтийн бие, cookie, query string, SQL алдааны утгыг логлохгүй. `LOG_LEVEL=debug|info|warn`, `LOG_PRETTY=0`.

---

## 2. Бүтэц

```
visa-system/
├── database/migrations/         001_init.sql (11 хүснэгт, PK/FK, UNIQUE, CHECK, индекс), дараагийн migration-ууд
├── server/
│   ├── src/
│   │   ├── app.js               Express: helmet/CSP, CSRF хамгаалалт, HTTPS албадах, алдааны боловсруулалт
│   │   ├── config.js            Орчны тохиргоо
│   │   ├── db.js                MySQL pool, транзакц
│   │   ├── middleware/auth.js   JWT httpOnly cookie, эрх шалгах (хүсэлт бүрд is_active шалгана)
│   │   ├── lib/                 audit, crypto (AES-256-GCM), storage (magic-byte шалгалт), visa дүрэм, logger (pino), migrations
│   │   └── routes/              auth · public · applicant · files · operator · admin
│   ├── scripts/                 migrate · reset · seed · create-admin · verify-storage
│   └── test/                    api · migrate · logger
├── client/src/
│   ├── pages/public|app|operator|admin   25+ дэлгэц
│   └── components/              Layout, UI бүрэлдэхүүн, файл үзэгч
├── e2e/                         Playwright (full-flow.spec.js, server.js)
├── scripts/                     backup · restore · restore-drill (.sh + .ps1), lib/common.*  — NFR-04
├── loadtest/run.js              ачааллын туршилт (autocannon)
├── docs/                        DEPLOYMENT.md · USER_GUIDE.md (+ screenshots/guide) · DECISIONS.md · GAP_ANALYSIS.md
├── .github/workflows/ci.yml     CI
├── eslint.config.js, .prettierrc.json, playwright.config.js
├── Dockerfile, docker-compose.yml, Caddyfile
└── .env.example
```

---

## 3. Шаардлагын хэрэгжилт (traceability)

### Функцийн шаардлага

| FR | UC | Хэрэгжүүлэлт | Тест |
|---|---|---|---|
| FR-01 Бүртгүүлэх | UC-01 | `POST /api/auth/register` — үргэлж APPLICANT, давхардсан имэйл 409 (BR-01), хагас бүртгэл үлдээхгүй (транзакц) | ✔ |
| FR-02 Нэвтрэх | UC-02 | `POST /api/auth/login` — ерөнхий алдааны мэдэгдэл, оролдлогын хязгаар (15 мин/10), эрхээр /app, /operator, /admin | ✔ |
| FR-03 Визийн мэдээлэл | UC-03 | `GET /api/visas`, `/api/visas/:versionId` — зөвхөн нийтэлсэн хувилбар, эх сурвалж, шалгасан огноо; бусад улс “Тун удахгүй” | ✔ |
| FR-04 Анкет | UC-04 | `PUT /api/app/drafts/:id/form` — латин нэр, огнооны шалгалт (төрсөн ≤ өнөөдөр, гарах ≥ орох, паспорт хүчинтэй), паспорт AES-256-GCM | ✔ |
| FR-05 Хавсралт | UC-04 | `POST /api/app/drafts/:id/documents` — PDF/JPG/PNG агуулгын байтаар шалгана, ≤10 MB, нийт ≤100 MB, SHA-256 | ✔ |
| FR-06 Илгээх | UC-04 | `POST /api/app/drafts/:id/submit` — заавал талбар/хавсралт шалгана (422 + дутуу хэсэг), БНСУ-аас бусдыг хориглоно | ✔ |
| FR-07 Архивлах | UC-04 | Нэг транзакцаар SUBMITTED + archived_at; idempotency (20 зэрэг хүсэлт → 1 мэдүүлэг); илгээснийг засахгүй | ✔ |
| FR-08 Архив үзэх | UC-05 | `GET /api/app/applications` (шүүлт, хуудаслалт), `/:id`, файл үзэгч | ✔ |
| FR-09 Албан хариу | UC-06 | `/app/official-result` — баталгаажсан HTTPS холбоос, гадаад сайтын сануулга, URL-д хувийн мэдээлэл дамжуулахгүй | — (гараар) |
| FR-10 Бүрдэл хянах | UC-07 | `/api/operator/...` — зөвхөн хуваарилсан (бусад 403), Дутуу бол тайлбар заавал, үнэлгээ зөвхөн нэмэгдэнэ, зэрэгцээ 409 | ✔ |
| FR-11 Лавлах шинэчлэх | UC-08 | `/api/admin/...` — хувилбарлалт, эх сурвалж/огноо/шаардлагагүй бол нийтлэхгүй, нийтэлснийг засахгүй (хуулж шинэ) | ✔ |

### Хамрах хүрээний боломжууд (тайлан бүлэг 4, Үе 1)

| F / хэсэг | Хэрэгжүүлэлт | Тест |
|---|---|---|
| F07 нэмэлт материал хүсэх | “Дутуу”-гийн дараа мэдүүлэгч **нэмэлт багц** (`application_supplements`, round) илгээнэ; анхны илгээлт өөрчлөгдөхгүй (BR-07); оператор зөвхөн илгээсэн багцыг харна; ноорог байх хооронд шинэ “Дутуу” гарвал ноорог сүүлийн хүсэлтэд шилжинэ | ✔ e2e |
| 4.2 / 5.3 “Хүргүүлсэн” | Хуваарилагдсан оператор, зөвхөн `COMPLETE`-ээс, албан дугаар + огноо + нотолгоо файлтай → `DELIVERED`; нэг удаа, засахгүй; дараа нь үнэлгээ нэмэхгүй | ✔ e2e |
| F11 баталгаатай үр дүн | Мэдүүлэгч порталаас харсан үр дүнгээ (хүлээж буй/зөвшөөрсөн/татгалзсан, огноо, эх сурвалж, нотолгоо) бүртгэнэ — **системийн шийдвэр биш**, зөвхөн нэмэгдэнэ; бичлэггүй = “Шалгаагүй”; хуваарилагдсан оператор нотолгоотой бичлэгийг **тусдаа** тэмдэглэлээр тулгана (бичлэгийг өөрчлөхгүй) | ✔ e2e |
| 4.5 өмнөх мэдүүлэг нэмэх | `imported_applications` — “импортолсон, баталгаажаагүй”, зөвхөн эзэмшигчид; оператор/админд харагдахгүй; засахгүй, устгаж болно | ✔ e2e |
| F09 шийдвэрийн баримт | Хүргүүлсэн баримт, албан үр дүнгийн нотолгоо, импортын файл — `evidence_files`, `/api/files/evidence/:id` (админ үзэхгүй) | ✔ |

### Функцийн бус шаардлага

| NFR | Хэрэгжүүлэлт |
|---|---|
| NFR-01 Хандалт | Мэдүүлэгч зөвхөн өөрийнх (бусдынх 404), оператор зөвхөн хуваарилсан (403), **админ файл/анкет үзэх эрхгүй**. Файл бүрийг эрх шалгасан API-аар (`/api/files/:id`) өгнө. Тест: 20+ сөрөг оролдлого → задрал 0 |
| NFR-02 Нууц үг | bcrypt (cost 12, давтагдашгүй salt); лог, audit-д нууц үг бичихгүй — тестээр шалгасан |
| NFR-03 HTTPS | `FORCE_HTTPS=1` (HTTP → 308, хувийн POST хаагдана), HSTS, Secure + HttpOnly + SameSite=Strict cookie, Caddy автоматаар TLS |
| NFR-04 Нөөц | `scripts/backup.sh`/`.ps1` (mysqldump + файлын архив + MANIFEST + SHA256SUMS → rclone crypt гадаад сан), `restore.sh`/`.ps1` → `verify-storage.js` 100% тулгана; сар бүр `restore-drill.sh`/`.ps1` тусдаа санд (CI-д ч) |
| Үе 5 Мониторинг | `/api/health` (DB + файлын сан + ClamAV, 503/`degraded`), `/api/health/live`, Docker HEALTHCHECK, Uptime Kuma, лог эргүүлэлт, зөв зогсолт (SIGTERM) |
| NFR-05 Бүрэн байдал | Илгээлт нэг транзакц, `(applicant_id, idempotency_key)` UNIQUE, хавсралт SHA-256 |

### Бизнес дүрэм

| BR | Хаана |
|---|---|
| BR-01 нэг имэйл — нэг бүртгэл | `users.email` UNIQUE |
| BR-02 өөрийн/хуваарилсан мэдүүлэг | `applicant.js` ownDraft, `operator.js` assignedApp, `files.js` |
| BR-03 зөвхөн БНСУ | `countries.service_status` + `SUBMITTABLE_COUNTRIES=KR` |
| BR-04 эх сурвалжгүй бол нийтлэхгүй | `admin.js` publish + `ck_versions_publish` CHECK |
| BR-05 файл | `storage.js` detectType, multer limit, `ck_documents_*` CHECK |
| BR-06 бүрдэл бүрэн үед л хүлээж авна | submit → 422 `missing[]` |
| BR-07 нэг илгээлт — нэг дугаар | idempotency + `public_id` UNIQUE |
| BR-08 дотоод дугаар ≠ албан дугаар | UI бүх газарт тэмдэглэнэ; албан хариуг порталаас |
| BR-09 “Бүрэн/Дутуу” ≠ визийн шийдвэр | Виз зөвшөөрөх/татгалзах товч байхгүй; `ck_reviews_comment` |

### Дэлгэцүүд (Зураг 37–61)

| # | Зам | # | Зам |
|---|---|---|---|
| 37 | `/` | 50 | `/app/official-result` |
| 38 | `/login` | 51 | `/operator` |
| 39 | `/register` | 52 | `/operator/applications/:id` |
| 40 | `/visas` | 53 | `/operator/applications/:id/history` |
| 41 | `/visas/:versionId` | 54 | `/admin` |
| 42 | `/app` | 55 | `/admin/countries` |
| 43 | `/app/new` | 56 | `/admin/visa-types` (+ `/:id/versions`) |
| 44 | `/app/new/documents` | 57 | `/admin/visa-types/:id/versions/new`, `/admin/versions/:id` |
| 45 | `/app/new/confirm` | 58 | `/admin/versions/:id/requirements` |
| 46 | `/app/submitted/:id` | 59 | `/admin/users` |
| 47 | `/app/applications` | 60 | `/admin/assignments` |
| 48 | `/app/applications/:id` | 61 | `/admin/audit` |
| 49 | `/app/profile` (+ operator, admin) | + | `/operator/history`, `/help` |
| Үе 4 | `/admin/stats`; хэл сонгох; PDF хураангуй | Үе 4 | Ажлын жагсаалтын хайлт, олноор хуваарилах |
| Үе 3 | `/admin/deletion-requests`; профайлд “Миний мэдээлэл” | Үе 3 | Файлын “Вирус шалгаж байна” төлөв |
| Үе 2 | `/login/mfa`, `/forgot-password`, `/reset-password`, `/verify-email` | Үе 2 | Мэдэгдлийн хонх (дээд мөр), профайлд сесс |
| Үе 1 | `/app/imports`, `/app/imports/new`, `/app/imports/:id` | Үе 1 | Нэмэлт багц, хүргүүлсэн, албан үр дүн — `/app/applications/:id`, `/operator/applications/:id` дотор |

---

## 4. Мэдүүлгийн төлөв

```
DRAFT ──submit──▶ SUBMITTED ──(админ хуваарилна)──▶ IN_REVIEW ──(оператор)──▶ INCOMPLETE ⇄ COMPLETE ──(оператор, нотолгоотой)──▶ DELIVERED
                                                         ▲                         │
                                                         └──(мэдүүлэгч нэмэлт багц)─┘
```
* Систем визийн шийдвэр гаргахгүй, таахгүй. Мэдүүлэгч Korea Visa Portal-аас харсан үр дүнгээ **өөрөө** бүртгэж болно
  (`official_results`, “мэдүүлэгчийн мэдээлснээр”, нотолгоогүй бол “Баталгаажаагүй”) — энэ нь мэдүүлгийн төлөвт нөлөөлөхгүй.
* Үнэлгээ бүр `reviews`-д шинэ мөр (review_no өсөх); өмнөхийг засах/устгах API байхгүй.
* Визийн мэдээлэл хувилбартай: мэдүүлэг илгээх үеийн `version_id`-тайгаа үлдэнэ.

## 5. API товч

```
Нийтийн   GET  /api/countries · /api/visas · /api/visas/:versionId · /api/health · /api/health/live
Нэвтрэлт  POST /api/auth/register · login · logout   GET /api/auth/me   PUT /api/auth/me/profile · me/password
          POST /api/auth/verify-email {token} · verify-email/resend · password/forgot {email} · password/reset {token,…}
          POST /api/auth/mfa/setup · mfa/enable {code} · mfa/verify {code | recoveryCode}   (login → {mfa: ENROLL|VERIFY})
          GET  /api/auth/sessions   DELETE /api/auth/sessions/:sid   POST /api/auth/sessions/revoke-all
Мэдэгдэл  GET  /api/notifications[?unread=1]   POST /api/notifications/:id/read · read-all
Хувийн    POST /api/app/privacy/export {password} → ZIP   GET/POST/DELETE /api/app/privacy/deletion {password, reason?}
Мэдүүлэгч GET  /api/app/dashboard
          POST /api/app/drafts   GET/DELETE /api/app/drafts/:id   PUT /api/app/drafts/:id/form
          POST /api/app/drafts/:id/documents   DELETE /api/app/drafts/:id/documents/:docId
          POST /api/app/drafts/:id/submit
          GET  /api/app/applications · /api/app/applications/:id · /:id/form-copy · /:id/summary.pdf
          PUT  /api/app/drafts/:id/autosave   (бүрэн бус анкет, шифрлэгдэнэ)
          POST /api/app/applications/:id/supplements                     (нэмэлт багц эхлүүлэх)
          PUT  /api/app/applications/:id/supplements/:round              {note}
          POST/DELETE /api/app/applications/:id/supplements/:round/documents[/:docId]
          POST /api/app/applications/:id/supplements/:round/submit   DELETE …/supplements/:round (ноорог цуцлах)
          POST /api/app/applications/:id/official-results            multipart {outcome, checkedOn, source, sourceUrl?, idempotencyKey, file?}
          GET/POST /api/app/imports   GET/DELETE /api/app/imports/:id   (POST multipart, files[] ≤10)
Файл      GET  /api/files/:documentId[?download=1] · /api/files/evidence/:fileId[?download=1]
Оператор  GET  /api/operator/applications?q&status&sort&page&pageSize · /stats · /reviews · /applications/:id · /applications/:id/reviews
          POST /api/operator/applications/:id/reviews   {completeness, comment, expectedReviewNo}
          POST /api/operator/applications/:id/handover   multipart {authority, officialRef, deliveredOn, note?, file}
          POST /api/operator/applications/:id/official-results/:entryNo/verification   {verdict: MATCHES|MISMATCH, note}
Админ     GET  /api/admin/dashboard · /audit
          CRUD /api/admin/countries · /visa-types · /visa-types/:id/versions · /versions/:id · /versions/:id/requirements · /requirements/:id
          POST /api/admin/versions/:id/publish
          GET/POST /api/admin/users   PUT /api/admin/users/:id/status   POST /api/admin/users/:id/mfa-reset
          GET  /api/admin/deletion-requests?status=   POST /api/admin/deletion-requests/:id/approve · reject {note}
          GET  /api/admin/assignments?filter&q   PUT /api/admin/assignments/:publicId {operatorId, expectedOperatorId}
          PUT  /api/admin/assignments {operatorId, items:[{publicId, expectedOperatorId}]}   (олноор)
          GET  /api/admin/stats?period=week|month&count=
```
Өөрчлөх хүсэлт бүр `X-Requested-With: civiz` толгойтой байна (CSRF хамгаалалт).

## 6. Тайлангаас ялгарах / нэмэлт шийдвэрүүд

* **Ноорог серверт хадгалагдана.** Прототип (Зураг 43)-д анкет “зөвхөн урсгалын санах ойд” гэсэн боловч F04 “хадгалаад үргэлжлүүлнэ” гэсэн тул файл хавсаргах үед ноорог (`status='DRAFT'`) үүсгэж, анкетыг шифрлэн хадгална. “Цуцлах” нь ноорог болон түр файлыг бүрэн устгана (UC-04 A3).
* **Оператор паспортын дугаарыг нууцлагдсан** байдлаар харна (Зураг 52), хавсаргасан хуулбартай тулгана.
* **Лавлах дугаар** `KR-YYYYMMDD-XXXXXX` хэлбэртэй (`applications.public_id`).
* **Нүүр хуудас:** өгөгдлийн санд зөвхөн БНСУ seed хийнэ; нэр нь баталгаажаагүй 3 улсыг “Улс 2/3/4 · Тун удахгүй” хоосон картаар харуулна (placeholder нэрийг DB-д оруулахгүй).
* **Эхний хувилбарт орохгүй** (тайлангийн 4.1): бусад улсын мэдүүлэг, ЭСЯ-тай API, автомат хариу татах, төлбөр, OCR/AI.
* Үе 1-ийн шийдвэрүүд (албан үр дүнг хэн бүртгэх, “Хүргүүлсэн”-ийг хэн бүртгэх г.м.) — `docs/DECISIONS.md`.
* **Хадгалах хугацаа/устгах хүсэлт:** бодит нэвтрүүлэлтийн өмнө журмаар батлах (4.5). `backup.sh` дахь `KEEP_DAYS` тохируулгатай.

## 7. Production хяналтын хуудас

Бүрэн жагсаалт: [docs/DEPLOYMENT.md §10](docs/DEPLOYMENT.md#10-production-хяналтын-хуудас).
