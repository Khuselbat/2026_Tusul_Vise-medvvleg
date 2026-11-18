<#
  Үе 5 — Windows хувилбар: сар бүрийн СЭРГЭЭЛТИЙН ТУРШИЛТ. Нөөцийг production-оос ТУСДАА сан (civiz_restore_drill)
  болон түр хавтсанд сэргээж, бичлэг ↔ файлын SHA-256-г 100% тулгаад, туршилтын санг устгана. Production-д хүрэхгүй.

    .\scripts\restore-drill.ps1                                  # хамгийн сүүлийн локал нөөц
    .\scripts\restore-drill.ps1 backups\20261111T020000Z
    $env:DRILL_FROM_REMOTE='1'; .\scripts\restore-drill.ps1      # BACKUP_REMOTE-оос хамгийн сүүлийнхийг татна

  Сар бүрийн 1-нд (Task Scheduler):
    schtasks /Create /TN "civiz-restore-drill" /SC MONTHLY /D 1 /ST 03:00 /RU SYSTEM /RL HIGHEST /F `
      /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\projects\visa-system\scripts\restore-drill.ps1"

  Эрх: host — DB_ADMIN_USER/DB_ADMIN_PASSWORD (анхдагч root / DB_ROOT_PASSWORD); docker — db контейнерын root.
  Үр дүн backups\restore-drill.log-д нэг мөрөөр нэмэгдэнэ.
#>
param([string]$Source)
. (Join-Path $PSScriptRoot 'lib\common.ps1')

$drillDb = Get-Setting 'DRILL_DB' 'civiz_restore_drill'
if ($drillDb -eq $Db.Name) { Stop-WithError "DRILL_DB нь production сан ($($Db.Name))-тай ижил байж болохгүй" }
if ($drillDb -notmatch '^[A-Za-z0-9_]+$') { Stop-WithError 'DRILL_DB нэр буруу' }
$work = Join-Path ([IO.Path]::GetTempPath()) ("civiz-drill-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $work | Out-Null
$sw = [Diagnostics.Stopwatch]::StartNew()
$rc = 1
try {
  # 1. Нөөц сонгох
  if ((Get-Setting 'DRILL_FROM_REMOTE' '0') -eq '1') {
    $remote = Get-Setting 'BACKUP_REMOTE' ''
    if (-not $remote) { Stop-WithError 'DRILL_FROM_REMOTE=1 үед BACKUP_REMOTE заавал' }
    $rclone = Find-Tool @('rclone')
    $latest = (Invoke-Tool -Exe $rclone -ArgList @('lsf', '--dirs-only', $remote) -Capture) -split "`r?`n" |
      ForEach-Object { $_.TrimEnd('/') } | Where-Object { $_ -match '^20\d{6}T\d{6}Z$' } | Sort-Object | Select-Object -Last 1
    if (-not $latest) { Stop-WithError "$remote дээр нөөц олдсонгүй" }
    $Source = Join-Path $work $latest
    Write-Log "Гадаад сангаас татаж байна: $remote/$latest"
    Invoke-Tool -Exe $rclone -ArgList @('copy', "$remote/$latest", $Source)
  } elseif (-not $Source) {
    $Source = (Get-ChildItem $BackupDir -Directory -Filter '20*Z' -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1).FullName
    if (-not $Source) { Stop-WithError "Нөөц олдсонгүй ($BackupDir). Эхлээд scripts\backup.ps1" }
  }
  $Source = (Resolve-Path $Source).Path
  $name = Split-Path $Source -Leaf
  Write-Log "Туршилт: $name → сан '$drillDb'"

  # 2. Бүрэн бүтэн байдал ба нас
  Test-Sums $Source
  $ageH = '?'
  if ($name -match '^(\d{8}T\d{6})Z$') {
    $created = [datetime]::ParseExact($Matches[1], 'yyyyMMddTHHmmss', $null)
    $ageH = [int][math]::Floor(((Get-Date).ToUniversalTime() - $created).TotalHours)
  }

  # 3. Тусдаа санд сэргээх
  Invoke-Sql -Admin -Sql "DROP DATABASE IF EXISTS ``$drillDb``; CREATE DATABASE ``$drillDb`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  $dump = Open-GzipRead (Join-Path $Source 'db.sql.gz')
  try { Invoke-Sql -Admin -Database $drillDb -InStreams @($dump) } finally { $dump.Close() }
  $tables = Invoke-Sql -Admin -Database $drillDb -Capture -Sql 'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  $apps = Invoke-Sql -Admin -Database $drillDb -Capture -Sql "SELECT COUNT(*) FROM applications WHERE status <> 'DRAFT'"
  $schema = Invoke-Sql -Admin -Database $drillDb -Capture -Sql 'SELECT MAX(version) FROM schema_migrations'

  # 4. Файл сэргээж бичлэгтэй тулгах
  $files = Join-Path $work 'files'
  New-Item -ItemType Directory -Force $files | Out-Null
  $tgz = Join-Path $Source 'files.tar.gz'
  $storage = Join-Path $files 'storage'
  if (Test-Path $tgz) {
    Invoke-Tool -Exe (Get-Tar) -ArgList @('-C', $files, '-xzf', $tgz)
    $storage = Join-Path $files (Get-ArchiveTop $tgz)
  }
  New-Item -ItemType Directory -Force $storage | Out-Null
  $verify = ''
  try {
    if ($Mode -eq 'docker') {
      $rootPw = Get-Setting 'DB_ROOT_PASSWORD' ''
      if (-not $rootPw) { Stop-WithError 'DB_ROOT_PASSWORD (.env) хэрэгтэй' }
      $verify = Invoke-Compose -Capture @('run', '--rm', '--no-deps', '-T', '-v', "${storage}:/drill/storage:ro",
        '-e', 'STORAGE_DIR=/drill/storage', '-e', 'STORAGE_DRIVER=local', '-e', "DB_NAME=$drillDb", '-e', 'DB_USER=root',
        '-e', "DB_PASSWORD=$rootPw", 'app', 'node', 'scripts/verify-storage.js')
    } else {
      $verify = Invoke-Tool -Exe (Get-Command node).Source -ArgList @((Join-Path $Root 'server\scripts\verify-storage.js')) -Capture -EnvVars @{
        STORAGE_DIR = $storage; STORAGE_DRIVER = 'local'; DB_NAME = $drillDb
        DB_USER = (Get-Setting 'DB_ADMIN_USER' 'root'); DB_PASSWORD = (Get-Setting 'DB_ADMIN_PASSWORD' (Get-Setting 'DB_ROOT_PASSWORD' ''))
      }
    }
    $rc = 0
  } catch { $verify = "$_" }
  $verify -split "`r?`n" | ForEach-Object { "  $_" }

  $result = if ($rc -eq 0) { 'PASS' } else { 'FAIL' }
  $line = "{0} {1} backup={2} age_h={3} schema={4} tables={5} submitted_apps={6} duration_s={7:N0} mode={8} os=windows" -f `
  (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'), $result, $name, $ageH, $schema, $tables, $apps, $sw.Elapsed.TotalSeconds, $Mode
  New-Item -ItemType Directory -Force $BackupDir | Out-Null
  [IO.File]::AppendAllText((Join-Path $BackupDir 'restore-drill.log'), "$line`n", (New-Object Text.UTF8Encoding $false))
  Write-Output $line
  if ($rc -ne 0) { Stop-WithError 'Сэргээлтийн туршилт АМЖИЛТГҮЙ — нөөцийн процессыг шалгана уу' }
  $ping = Get-Setting 'DRILL_PING_URL' ''
  if ($ping) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 $ping | Out-Null } catch { Write-Warning "DRILL_PING_URL: $_" } }
  Write-Log ("Сэргээлтийн туршилт амжилттай ({0:N0} сек; зорилт ≤ 4 цаг)." -f $sw.Elapsed.TotalSeconds)
} finally {
  if ((Get-Setting 'KEEP_DRILL' '0') -ne '1') { try { Invoke-Sql -Admin -Sql "DROP DATABASE IF EXISTS ``$drillDb``;" } catch {} }
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
