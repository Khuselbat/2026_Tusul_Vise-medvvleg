<#
  NFR-04 / Үе 5 — Windows хувилбар: өгөгдлийн сан + хувийн файлын нөөц → (сонголтоор) гадаад сан руу.
  backup.sh-тэй ижил бүтэцтэй нөөц үүсгэнэ (Linux дээр restore.sh-ээр сэргээж болно).

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup.ps1
    $env:BACKUP_MODE='docker'; .\scripts\backup.ps1        # Docker Desktop

  Өдөр бүр 02:00-д (Task Scheduler, администратор эрхтэй PowerShell-ээс нэг удаа):
    schtasks /Create /TN "civiz-backup" /SC DAILY /ST 02:00 /RU SYSTEM /RL HIGHEST /F `
      /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\projects\visa-system\scripts\backup.ps1"

  Тохиргоо (.env эсвэл орчин): BACKUP_DIR, KEEP_DAYS (14), BACKUP_REMOTE (rclone crypt remote), REMOTE_KEEP_DAYS (90),
  BACKUP_PING_URL. Дэлгэрэнгүй: docs/DEPLOYMENT.md §6.
#>
. (Join-Path $PSScriptRoot 'lib\common.ps1')

$keepDays = [int](Get-Setting 'KEEP_DAYS' '14')
$remoteKeep = Get-Setting 'REMOTE_KEEP_DAYS' '90'
$ts = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$out = Join-Path $BackupDir $ts
New-Item -ItemType Directory -Force $out | Out-Null
$ok = $false
try {
  Write-Log "Нөөц эхэллээ ($Mode): $out"

  # 1. Өгөгдлийн сан → db.sql → db.sql.gz
  $sql = Join-Path $out 'db.sql'
  if ($Mode -eq 'docker') {
    $a = @('exec', '-T', 'db', 'sh', '-c', 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump -u"$MYSQL_USER" "$@" "$MYSQL_DATABASE"', 'sh')
    Invoke-Compose ($a + $DumpOpts) -OutFile $sql
  } else {
    $cnf = New-MyCnf $Db.User $Db.Password
    try {
      Invoke-Tool -Exe (Find-Tool @('mysqldump', 'mariadb-dump')) -ArgList (@("--defaults-extra-file=$cnf") + $DumpOpts + @("--result-file=$sql", $Db.Name))
    } finally { Remove-Item $cnf -Force -ErrorAction SilentlyContinue }
  }
  $tail = Get-Content $sql -Tail 1 -Encoding UTF8
  if ($tail -notmatch 'Dump completed') { Stop-WithError 'DB dump дутуу байна' }
  $src = [IO.File]::OpenRead($sql)
  $gz = New-Object IO.Compression.GZipStream ([IO.File]::Create("$sql.gz")), ([IO.Compression.CompressionLevel]::Optimal)
  try { $src.CopyTo($gz) } finally { $gz.Close(); $src.Close() }
  Remove-Item $sql -Force

  # 2. Хувийн файлууд → files.tar.gz (архив доторх үндэс нь storage/)
  $names = @('db.sql.gz')
  $nfiles = '(s3 — энд нөөцлөөгүй)'
  if ($StorageDriver -eq 'local') {
    $tgz = Join-Path $out 'files.tar.gz'
    if ($Mode -eq 'docker') {
      Invoke-Compose @('exec', '-T', 'app', 'tar', '-C', '/app/server', '-czf', '-', 'storage') -OutFile $tgz
    } else {
      New-Item -ItemType Directory -Force $StoragePath | Out-Null
      Invoke-Tool -Exe (Get-Tar) -ArgList @('-C', (Split-Path $StoragePath -Parent), '-czf', $tgz, (Split-Path $StoragePath -Leaf))
    }
    $nfiles = @((Invoke-Tool -Exe (Get-Tar) -ArgList @('-tzf', $tgz) -Capture) -split "`r?`n" | Where-Object { $_ -and $_ -notmatch '/$' }).Count
    $names += 'files.tar.gz'
  }

  # 3. MANIFEST + SHA256SUMS
  $schema = try { Invoke-Sql -Sql 'SELECT MAX(version) FROM schema_migrations' -Capture } catch { '?' }
  $commit = try { (& git -C $Root rev-parse --short HEAD 2>$null) } catch { 'unknown' }
  $manifest = @("created_utc=$ts", "mode=$Mode", "database=$($Db.Name)", "schema_version=$schema", "storage_driver=$StorageDriver",
    "files=$nfiles", "app_commit=$commit") -join "`n"
  [IO.File]::WriteAllText((Join-Path $out 'MANIFEST.txt'), "$manifest`n", (New-Object Text.UTF8Encoding $false))
  Write-Sums $out ($names + 'MANIFEST.txt')
  $size = '{0:N0} KB' -f ((Get-ChildItem $out | Measure-Object Length -Sum).Sum / 1KB)
  Write-Log "Нөөц үүслээ: $out ($size, schema $schema, файл $nfiles)"
  $ok = $true
} finally {
  if (-not $ok) { Write-Log "Нөөц бүтэлгүй — дутуу хавтсыг устгав: $out"; Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue }
}

# 4. Гадаад сан (rclone crypt remote)
$remote = Get-Setting 'BACKUP_REMOTE' ''
if ($remote) {
  $rclone = Find-Tool @('rclone')
  $remoteName = $remote.Split(':')[0]
  $remotes = Invoke-Tool -Exe $rclone -ArgList @('listremotes', '--long') -Capture
  if ($remotes -notmatch "(?m)^${remoteName}:\s+crypt" -and (Get-Setting 'BACKUP_ALLOW_UNENCRYPTED_REMOTE' '0') -ne '1') {
    Stop-WithError "'${remoteName}:' нь crypt remote биш. Нөөцөд хувийн мэдээлэл байгаа тул шифрлэсэн remote ашиглана (docs/DEPLOYMENT.md §6)."
  }
  Invoke-Tool -Exe $rclone -ArgList @('copy', $out, "$remote/$ts", '--immutable')
  Invoke-Tool -Exe $rclone -ArgList @('check', $out, "$remote/$ts", '--one-way', '--download')
  Write-Log "Гадаад сан руу хуулав: $remote/$ts"
  try {
    Invoke-Tool -Exe $rclone -ArgList @('delete', $remote, '--min-age', "${remoteKeep}d")
    Invoke-Tool -Exe $rclone -ArgList @('rmdirs', $remote, '--leave-root')
  } catch { Write-Warning $_ }
}

# 5. Локал хуучин нөөц
Get-ChildItem $BackupDir -Directory -Filter '20*Z' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$keepDays) } |
  Remove-Item -Recurse -Force

$ping = Get-Setting 'BACKUP_PING_URL' ''
if ($ping) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 $ping | Out-Null } catch { Write-Warning "BACKUP_PING_URL: $_" } }
Write-Log 'Дууслаа.'
