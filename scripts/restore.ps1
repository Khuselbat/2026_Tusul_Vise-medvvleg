<#
  NFR-04 — Windows хувилбар: нөөцөөс PRODUCTION санг сэргээнэ (одоогийн өгөгдлийг ДАРЖ БИЧНЭ).
  Эхлээд restore-drill.ps1-ээр тусдаа санд туршина уу.

    .\scripts\restore.ps1 backups\20261111T020000Z
    .\scripts\restore.ps1 backups\20261111T020000Z -Yes        # асуухгүй (автомат)
    $env:BACKUP_MODE='docker'; .\scripts\restore.ps1 backups\20261111T020000Z

  Host горимд серверээ (npm start / үйлчилгээ) эхлээд зогсооно.
#>
param([Parameter(Mandatory = $true)][string]$Source, [switch]$Yes)
. (Join-Path $PSScriptRoot 'lib\common.ps1')

$Source = (Resolve-Path $Source).Path
Test-Sums $Source
$manifest = Join-Path $Source 'MANIFEST.txt'
if (Test-Path $manifest) { Get-Content $manifest -Encoding UTF8 | ForEach-Object { "  $_" } }
if (-not $Yes) {
  $ans = Read-Host "'$($Db.Name)' сан болон хувийн файлуудыг ($Mode) дарж бичих үү? (yes/no)"
  if ($ans -ne 'yes') { Write-Output 'Цуцаллаа.'; exit 1 }
}
$sw = [Diagnostics.Stopwatch]::StartNew()

if ($Mode -eq 'docker') { Write-Log 'app-ийг зогсооно'; Invoke-Compose @('stop', 'app') }

Write-Log 'Өгөгдлийн сан сэргээж байна'
# Нөөцийн дараа нэмэгдсэн хүснэгт үлдэхгүйн тулд эхлээд бүх хүснэгтийг устгана
$drops = Invoke-Sql -Capture -Sql "SELECT CONCAT('DROP TABLE IF EXISTS ``', TABLE_NAME, '``;') FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'"
$dump = Open-GzipRead (Join-Path $Source 'db.sql.gz')
try {
  Invoke-Sql -InStreams @((New-StringStream "SET FOREIGN_KEY_CHECKS = 0;`n$drops`nSET FOREIGN_KEY_CHECKS = 1;`n"), $dump)
} finally { $dump.Close() }

$tgz = Join-Path $Source 'files.tar.gz'
if (Test-Path $tgz) {
  Write-Log 'Хувийн файлуудыг сэргээж байна'
  if ($Mode -eq 'docker') {
    $in = [IO.File]::OpenRead($tgz)
    try {
      Invoke-Compose @('run', '--rm', '--no-deps', '-T', '--entrypoint', 'sh', 'app', '-c',
        'cd /app/server/storage && find . -mindepth 1 -delete && tar -xzf - && d=$(ls -A) && find "$d" -mindepth 1 -maxdepth 1 -exec mv {} . ; && rmdir "$d"') -InStreams @($in)
    } finally { $in.Close() }
  } else {
    # Архивын дээд хавтас өөр нэртэй байж болох тул түр хавтсанд задлаад STORAGE_PATH болгож байрлуулна
    $parent = Split-Path $StoragePath -Parent
    $tmp = Join-Path $parent ".restore.$PID"
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    New-Item -ItemType Directory -Force $tmp | Out-Null
    Invoke-Tool -Exe (Get-Tar) -ArgList @('-C', $tmp, '-xzf', $tgz)
    if (Test-Path $StoragePath) { Remove-Item $StoragePath -Recurse -Force }
    Move-Item (Join-Path $tmp (Get-ArchiveTop $tgz)) $StoragePath
    Remove-Item $tmp -Recurse -Force
  }
}

Write-Log 'Бичлэг ↔ файлын хяналтын нийлбэрийг тулгаж байна'
if ($Mode -eq 'docker') {
  Invoke-Compose @('run', '--rm', '--no-deps', '-T', 'app', 'node', 'scripts/verify-storage.js') -Capture | Write-Output
  Invoke-Compose @('start', 'app')
} else {
  Push-Location (Join-Path $Root 'server')
  try { & node scripts/verify-storage.js; if ($LASTEXITCODE -ne 0) { Stop-WithError 'verify-storage амжилтгүй' } } finally { Pop-Location }
}
Write-Log ("Сэргээлт дууслаа ({0:N0} сек). App эхлэхдээ хэрэгжээгүй migration-уудыг ажиллуулна." -f $sw.Elapsed.TotalSeconds)
