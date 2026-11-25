# database/ — өгөгдлийн сан

| Файл / хавтас | Зориулалт |
| --- | --- |
| `migrations/NNN_*.sql` | **Схемийн цорын ганц эх сурвалж.** `cd server && npm run db:migrate` ажиллуулна. Хэрэгжсэн файлыг засахгүй. |
| `civiz_full_schema.sql` | Migration 001–013-ийн **эцсийн төлөв**: 26 хүснэгт, 6 бүлэг, монгол `COMMENT`-тэй, `roles`/`document_types` лавлах өгөгдөлтэй. ER диаграмд зориулав. |
| `civiz_seed_data.sql` | `npm run db:seed`-ийн зохиомол демо өгөгдөл (INSERT). Схемийн файлын дараа ачаална. |
| `civiz_schema.dbml` | dbdiagram.io-ийн DBML хэлбэр (`TableGroup`-оор 6 бүлэг, CHECK нөхцөл хүснэгтийн Note-д). |
| `reference/` | Визийн лавлах мэдээллийн ноорог (эх сурвалжтай, нийтлээгүй). |

> ⚠ `civiz_full_schema.sql` нь **диаграм, баримт бичигт** зориулагдсан. Ажиллаж буй санг migration-оор шинэчилнэ:
> энэ файлд `schema_migrations` байхгүй тул түүгээр үүсгэсэн санд `db:migrate` бүх migration-ыг дахин ажиллуулах гэж оролдоно.
> Файл нь `civiz` санг үүсгэж (`CREATE DATABASE IF NOT EXISTS civiz; USE civiz;`) хүснэгтүүдийг `CREATE TABLE`-ээр үүсгэдэг —
> хүснэгттэй санд ажиллуулбал “already exists” алдаа өгнө. Өөр нэртэй санд ачаалах бол эхний `CREATE DATABASE … / USE civiz;`
> мөрүүдийг солино.

## Бүлгүүд (26 хүснэгт)

| # | Бүлэг | Хүснэгтүүд |
| --- | --- | --- |
| 1 | Хэрэглэгч ба нэвтрэлт | roles, users, user_sessions, user_tokens |
| 2 | Визийн лавлах | countries, visa_types, visa_info_versions, visa_requirements, document_types, requirement_document_types |
| 3 | Мэдүүлэг | applications, application_forms, imported_applications |
| 4 | Хяналт ба үр дүн | reviews, application_supplements, application_documents, evidence_files, application_handovers, official_results, official_result_verifications |
| 5 | Профайл ба бичиг баримтын сан | applicant_profiles, profile_documents |
| 6 | Аюулгүй байдал, аудит, мэдэгдэл | mfa_recovery_codes, audit_events, account_deletion_requests, notifications |

Хүснэгтүүд FK-ийн дарааллаар байрлана (`application_documents` нь `application_supplements`-ээс хамаардаг тул 4-р бүлэгт).
Нийт: 44 FOREIGN KEY, 25 UNIQUE, 38 CHECK, 38 INDEX. `application_documents.source_profile_document_id` нь санаатайгаар FK-гүй
(профайлын баримт устсан ч илгээсэн мэдүүлгийн хуулбар хэвээр — migration 013).

## ER диаграм гаргах

### MySQL Workbench 8.0
1. **File → New Model**.
2. **File → Import → Reverse Engineer MySQL Create Script…**
3. `database/civiz_full_schema.sql`-ийг сонгоно.
4. **Place imported objects on a diagram** чагтлах → **Execute** → **Next** → **Finish**.
5. Диаграм `EER Diagram` табд гарна. Хүснэгт, баганын `COMMENT` нь объект дээр давхар товшиход харагдана.

### dbdiagram.io
- **DBML (санал болгох):** <https://dbdiagram.io/d> → шинэ диаграм → зүүн талын засварлагчид `civiz_schema.dbml`-ийн агуулгыг
  бүхэлд нь буулгана. Бүлгүүд `TableGroup`-оор өнгөөр ялгарна.
- **SQL-ээс:** **Import → From MySQL** → `civiz_full_schema.sql`-ийн агуулгыг буулгана (CHECK нөхцөл DBML-д орохгүй).

### DBeaver
1. MySQL холболт (`127.0.0.1:3306`) нээгээд **SQL Editor → Open SQL script** → `civiz_full_schema.sql` → **Execute SQL Script** (`Alt+X`).
   Хэрэв `civiz` сан аль хэдийн байвал (жишээ нь `npm run db:migrate`-ээр үүсгэсэн) шууд 3-р алхам руу орно.
2. (Сонголттой) `civiz_seed_data.sql`-ийг мөн адил ажиллуулна.
3. Navigator → `civiz` → **Tables** дээр баруун товч → **View Diagram**.

### drawSQL
**Import → MySQL** → `civiz_full_schema.sql`-ийн агуулгыг буулгана.

## Демо өгөгдөл (`civiz_seed_data.sql`)
- Зохиомол өгөгдөл (`*@civiz.mn`); нууц үг bcrypt хэшээр, паспортын дугаар AES-256-GCM шифрлэгдсэнээр (hex) хадгалагдсан.
  Паспортыг тайлахад экспорт хийсэн орчны `PASSPORT_KEY` хэрэгтэй — өөр түлхүүртэй серверт тайлагдахгүй.
- Оруулаагүй: `roles`, `document_types` (схемийн файлд), `user_sessions`, `user_tokens`, `mfa_recovery_codes`, `schema_migrations`.
- Хавсралтын файлууд (`storage_key`) ороогүй — зөвхөн мета өгөгдөл. Аппыг ажиллуулах бол `npm run db:reset` ашиглана.

## Шинэчлэх (шинэ migration нэмсний дараа)
1. Түр сан `civiz_schema_export` үүсгээд бүх migration-ыг ажиллуулна:
   `DB_USER=root DB_PASSWORD=… DB_NAME=civiz_schema_export node server/scripts/migrate.js` (PowerShell: `$env:DB_NAME='…'`).
2. `mysqldump --no-data --skip-comments --skip-add-locks --skip-triggers --compact civiz_schema_export` → эцсийн `CREATE TABLE`-ууд.
3. `AUTO_INCREMENT=N`, `schema_migrations`-ийг хасаж, шинэ хүснэгтийг бүлэгт нь, `COMMENT`-тэй нэмнэ; DBML-ийг мөн шинэчилнэ.
4. Шалгах: хоосон санд ачаалаад `information_schema` (columns, table_constraints, check_constraints, referential_constraints,
   statistics)-ийг migration-аар үүсгэсэн сантай харьцуулна. Түр сангуудыг устгана.
