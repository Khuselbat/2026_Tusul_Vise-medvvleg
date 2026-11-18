# Windows дээр ажиллуулах заавар

## 1. Татаж суулгах программууд

| # | Программ | Хаанаас | Тайлбар |
|---|---|---|---|
| 1 | **Node.js 22 LTS** | https://nodejs.org → “LTS” товч (.msi) | npm хамт суугдана. Бүх тохиргоог анхдагчаар Next → Next |
| 2 | **MySQL 8.4 LTS Community** | https://dev.mysql.com/downloads/installer/ → “mysql-installer-community” (том нь) | Өгөгдлийн сан. Workbench-ийг хамт суулгавал SQL ажиллуулахад амар |
| 3 | **Visual Studio Code** (санал болгох) | https://code.visualstudio.com | Visual Studio-гоор ч болно, гэхдээ VS Code энэ төрлийн төсөлд илүү тохиромжтой |

> Visual Studio (Community) 2022 байгаа бол түүгээр ч нээж болно: **File → Open → Folder** хийгээд **View → Terminal**-аар терминал нээнэ.

### MySQL суулгах үед
1. Setup Type: **Custom** → *MySQL Server 8.4* ба *MySQL Workbench*-ийг сонгоно (эсвэл **Full**).
2. Type and Networking: **Development Computer**, Port **3306** (өөрчлөхгүй).
3. Authentication: **Use Strong Password Encryption** (анхдагч).
4. Accounts: **root**-ийн нууц үг тавина — **мартахгүй байхаар бичиж аваарай**.
5. Windows Service: “Start the MySQL Server at System Startup” чагттай үлдээнэ.

### Суусныг шалгах
`Win + R` → `cmd` → Enter, дараа нь:
```
node -v      → v22.x.x гэж гарвал болсон
npm -v       → 10.x.x
```

## 2. Төслийг байрлуулах

`visa-system.zip`-ийг задлаад жишээ нь `C:\projects\visa-system` хавтсанд хийнэ (замд монгол үсэг, зай байхгүй байвал дээр).

## 3. Өгөгдлийн сан үүсгэх (нэг удаа)

**MySQL Workbench** нээх → *Local instance* дээр дарж root нууц үгээр нэвтрэх → доорхыг хуулж буулгаад ⚡ (Execute) дарна:

```sql
CREATE DATABASE civiz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE civiz_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'civiz'@'localhost' IDENTIFIED BY 'civiz_pass';
GRANT ALL ON civiz.* TO 'civiz'@'localhost';
GRANT ALL ON civiz_test.* TO 'civiz'@'localhost';
```

(Workbench байхгүй бол Start цэснээс **MySQL 8.4 Command Line Client** нээж root нууц үгээ оруулаад мөн адил ажиллуулна.)

## 4. Ажиллуулах

VS Code: **File → Open Folder → `C:\projects\visa-system`**, дараа нь **Terminal → New Terminal**.

### Терминал 1 — сервер
```
cd server
npm install
npm run db:reset
npm run dev
```
`Цахим виз сервер: http://localhost:4000` гэж гарвал болсон. Энэ терминалыг хаахгүй.

### Терминал 2 — вэб интерфэйс (терминалын баруун дээд “+” дарж шинээр нээнэ)
```
cd client
npm install
npm run dev
```
Хөтөч дээр **http://localhost:5173** нээнэ.

### Нэвтрэх эрхүүд
> **Админ, оператор** анх нэвтрэхэд хоёр шатлалт баталгаажуулалт (2FA) тохируулна: утсандаа **Google Authenticator**
> эсвэл **Microsoft Authenticator** суулгаад дэлгэцэн дээрх QR кодыг уншуулна. Гарсан 10 нөөц кодыг хадгална.
> Зөвхөн өөрийн компьютер дээр туршихад түр унтраах бол `server\.env` файлд `MFA_REQUIRED=0` гэж бичээд серверээ дахин асаана.
>
> Хөгжүүлэлтийн үед имэйл жинхэнээр явахгүй — `server\mail-outbox\` хавтсанд `.json` файл болж хадгалагдана
> (бүртгэлийн баталгаажуулах, нууц үг сэргээх холбоосыг тэндээс хуулж нээнэ).

| Эрх | Имэйл | Нууц үг |
|---|---|---|
| Админ | admin@civiz.mn | Admin1234 |
| Оператор | operator@civiz.mn | Operator1234 |
| Мэдүүлэгч | applicant@civiz.mn | Applicant1234 |

### Дараагийн удаа
Зөвхөн 2 терминал дээр `npm run dev` (server, client) — `npm install`, `db:reset` дахин хийх шаардлагагүй.
⚠ `npm run db:reset` нь бүх өгөгдлийг устгаад жишээ өгөгдлөөр дахин үүсгэнэ.

### Нэг порт дээр ажиллуулах (хамгаалалт/үзүүлэнд)
```
cd client
npm run build
cd ../server
npm start
```
→ http://localhost:4000

### Тест ажиллуулах
```
cd server
npm test
```
→ `ℹ pass 147  ℹ fail 0`

### E2E ба lint (сонголттой)
Репоны үндсэн хавтсанд:
```
npm install
npx playwright install chromium
cd client && npm run build && cd ..
npm run test:e2e
npm run lint
```

### Өгөгдлийн санг шинэчлэх
Код шинэчлэгдсэний дараа `cd server && npm run db:migrate` — өгөгдөл устгахгүй, зөвхөн шинэ migration-уудыг ажиллуулна.

## 5. Түгээмэл алдаа

| Алдаа | Шалтгаан / шийдэл |
|---|---|
| `npm.ps1 cannot be loaded because running scripts is disabled` | PowerShell-ийн хориг. Терминалд нэг удаа: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` → `Y`. Эсвэл VS Code терминалын “+” хажуугийн сумаар **Command Prompt** сонгоно |
| `'node' / 'npm' is not recognized` | Node.js суулгасны дараа VS Code/терминалыг хааж дахин нээнэ |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL асаагүй. `Win + R` → `services.msc` → **MySQL84** (эсвэл **MySQL80**) → Start |
| `ER_ACCESS_DENIED_ERROR` | 3-р алхмын SQL ажиллаагүй эсвэл нууц үг өөр. Өөр нууц үг ашиглах бол `server` хавтсанд `.env` файл үүсгээд `DB_PASSWORD=таны_нууц_үг` гэж бичнэ |
| `ER_BAD_DB_ERROR: Unknown database 'civiz'` | 3-р алхмын `CREATE DATABASE` ажиллаагүй |
| `EADDRINUSE :::4000` | 4000 порт завгүй. `server\.env`-д `PORT=4001` гэж бичээд `client\vite.config.js` дахь `4000`-г `4001` болгоно |
| Нэвтэрсний дараа шууд гарч байна | Хөтчийн cookie хаагдсан эсэхийг шалгах; `http://localhost:5173`-аар (127.0.0.1 биш) нээх |

## 6. Сонголт: Docker-оор

**Docker Desktop** (https://www.docker.com/products/docker-desktop) суулгасан бол MySQL, Node.js тусад нь суулгах шаардлагагүй:
```
copy .env.example .env      (дотор нь нууц үгүүдийг солино)
docker compose up -d --build
docker compose exec app node scripts/create-admin.js --email admin@example.mn --name "Админ"
```
(Docker production горимд ажилладаг тул жишээ өгөгдөл оруулахгүй; түр нууц үг терминалд нэг удаа хэвлэгдэнэ.)
→ http://localhost:4000

## 7. Нөөцлөлт (Windows)

PowerShell скрипт — Git Bash шаардлагагүй. `mysqldump`-ийг `C:\Program Files\MySQL\MySQL Server *\bin`-ээс автоматаар олно.
```powershell
.\scripts\backup.ps1                                   # backups\<огноо>\ — db.sql.gz, files.tar.gz, MANIFEST.txt, SHA256SUMS
$env:DB_ADMIN_PASSWORD='<root нууц үг>'; .\scripts\restore-drill.ps1   # тусдаа санд сэргээж 100% тулгана (өгөгдөлд хүрэхгүй)
.\scripts\restore.ps1 backups\20261111T020000Z         # бодит сэргээлт — одоогийн өгөгдлийг ДАРЖ БИЧНЭ
```
Docker Desktop бол урд нь `$env:BACKUP_MODE='docker'`. Өдөр бүр автоматаар (Task Scheduler), гадаад сан руу хуулах (rclone):
[docs/DEPLOYMENT.md §5, §9](docs/DEPLOYMENT.md). bash хувилбар (`scripts/*.sh`) Linux сервер эсвэл Git Bash-д.
