# backup.ps1 / restore.ps1 / restore-drill.ps1-ийн нийтлэг функцүүд (Үе 5, Windows PowerShell 5.1+).
#
# BACKUP_MODE=host   — MySQL (MySQL Installer / MariaDB) болон файлын хавтас энэ компьютер дээр
# BACKUP_MODE=docker — Docker Desktop: `docker compose` (db, app контейнер)
#
# Тохиргоо: репоны үндсэн `.env` (байвал) уншигдана; орчны хувьсагч давуу.
# PowerShell 5.1-ийн pipe нь binary өгөгдлийг эвддэг тул процессын stdin/stdout-ыг шууд урсгалаар холбоно.

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root

function Write-Log([string]$msg) { Write-Output ("{0} {1}" -f (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'), $msg) }
function Stop-WithError([string]$msg) { throw "АЛДАА: $msg" }

# .env (орчинд байгааг дарж бичихгүй)
$envFile = if ($env:ENV_FILE) { $env:ENV_FILE } else { Join-Path $Root '.env' }
if (Test-Path $envFile) {
  foreach ($line in [IO.File]::ReadAllLines($envFile, [Text.Encoding]::UTF8)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $k = $Matches[1]; $v = $Matches[2]
      if ($null -ne [Environment]::GetEnvironmentVariable($k, 'Process')) { continue }
      if ($v -match '^"(.*)"$' -or $v -match "^'(.*)'$") { $v = $Matches[1] }
      [Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
  }
}
function Get-Setting([string]$name, [string]$default) {
  $v = [Environment]::GetEnvironmentVariable($name, 'Process')
  if ([string]::IsNullOrEmpty($v)) { return $default } else { return $v }
}

$Mode = Get-Setting 'BACKUP_MODE' 'host'
$Db = @{
  Host = Get-Setting 'DB_HOST' '127.0.0.1'; Port = Get-Setting 'DB_PORT' '3306'
  User = Get-Setting 'DB_USER' 'civiz'; Password = Get-Setting 'DB_PASSWORD' 'civiz_pass'; Name = Get-Setting 'DB_NAME' 'civiz'
}
$StorageDriver = Get-Setting 'STORAGE_DRIVER' 'local'
$storageSetting = Get-Setting 'STORAGE_DIR' 'storage'
$StoragePath = if ([IO.Path]::IsPathRooted($storageSetting)) { $storageSetting } else { Join-Path (Join-Path $Root 'server') $storageSetting }
$BackupDir = Get-Setting 'BACKUP_DIR' (Join-Path $Root 'backups')
if (-not [IO.Path]::IsPathRooted($BackupDir)) { $BackupDir = Join-Path $Root $BackupDir }
$DumpOpts = @('--single-transaction', '--quick', '--routines', '--triggers', '--hex-blob', '--no-tablespaces', '--default-character-set=utf8mb4')

function Find-Tool([string[]]$names) {
  foreach ($n in $names) {
    $c = Get-Command $n -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
  }
  $dirs = @(Get-ChildItem 'C:\Program Files\MySQL\MySQL Server*\bin', 'C:\Program Files\MariaDB*\bin' -Directory -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending)
  foreach ($d in $dirs) { foreach ($n in $names) { $p = Join-Path $d.FullName "$n.exe"; if (Test-Path $p) { return $p } } }
  Stop-WithError "$($names -join ' / ') олдсонгүй. MySQL-ийн bin хавтсыг PATH-д нэмнэ үү."
}

# Windows-ийн командын мөрийн дүрмээр аргумент хашилна (CommandLineToArgvW)
function ConvertTo-ArgString([string[]]$argv) {
  ($argv | ForEach-Object {
      if ($_ -ne '' -and $_ -notmatch '[\s"]') { $_ }
      else { '"' + (($_ -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"' }
    }) -join ' '
}

<#
  Процесс ажиллуулна. -InFile/-InStreams: stdin руу (Stream-үүдийг дараалан), -OutFile: stdout-ыг файл руу (binary).
  -Capture: stdout-ыг UTF-8 текстээр буцаана. Гарах код ≠ 0 бол алдаа.
#>
function Invoke-Tool {
  param([string]$Exe, [string[]]$ArgList, [string]$OutFile, [IO.Stream[]]$InStreams, [switch]$Capture, [hashtable]$EnvVars)
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $Exe
  $psi.Arguments = ConvertTo-ArgString $ArgList
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = [bool]$InStreams
  $psi.RedirectStandardOutput = [bool]($OutFile -or $Capture)
  $psi.RedirectStandardError = $true
  if ($EnvVars) { foreach ($k in $EnvVars.Keys) { $psi.EnvironmentVariables[$k] = [string]$EnvVars[$k] } }
  $p = [Diagnostics.Process]::Start($psi)
  $errTask = $p.StandardError.ReadToEndAsync()
  $outTask = $null
  if ($OutFile) {
    $fs = [IO.File]::Create($OutFile)
    $outTask = $p.StandardOutput.BaseStream.CopyToAsync($fs)
  } elseif ($Capture) {
    $ms = New-Object IO.MemoryStream
    $outTask = $p.StandardOutput.BaseStream.CopyToAsync($ms)
  }
  if ($InStreams) {
    try { foreach ($s in $InStreams) { $s.CopyTo($p.StandardInput.BaseStream) } }
    finally { $p.StandardInput.Close() }
  }
  if ($outTask) { $outTask.Wait() }
  $p.WaitForExit()
  if ($OutFile) { $fs.Close() }
  $stderr = ($errTask.Result -split "`r?`n" | Where-Object { $_ -and $_ -notmatch 'insecure passwordless|Using a password on the command line' }) -join "`n"
  $stdout = if ($Capture) { [Text.Encoding]::UTF8.GetString($ms.ToArray()).Trim() } else { "" }
  if ($p.ExitCode -ne 0) { Stop-WithError ("{0} ({1}): {2}" -f (Split-Path $Exe -Leaf), $p.ExitCode, ((@($stdout, $stderr) | Where-Object { $_ }) -join "`n")) }
  if ($stderr) { Write-Warning $stderr }
  if ($Capture) { return $stdout }
}

function New-StringStream([string]$s) { New-Object IO.MemoryStream (, [Text.Encoding]::UTF8.GetBytes($s)) }

# Нууц үгийг командын мөрөнд биш, хэрэглэгчийн TEMP-д түр файлаар дамжуулна (MYSQL_PWD нь MySQL 8.0-оос deprecated)
function New-MyCnf([string]$user, [string]$password) {
  $f = Join-Path $env:TEMP ("civiz-{0}.cnf" -f [guid]::NewGuid())
  $pw = $password -replace '\\', '\\' -replace '"', '\"'
  [IO.File]::WriteAllText($f, "[client]`nuser=$user`npassword=`"$pw`"`nhost=$($Db.Host)`nport=$($Db.Port)`n", (New-Object Text.UTF8Encoding $false))
  return $f
}

function Invoke-Compose([string[]]$composeArgs, [string]$OutFile, [IO.Stream[]]$InStreams, [switch]$Capture) {
  $docker = (Get-Command docker -ErrorAction Stop).Source
  Invoke-Tool -Exe $docker -ArgList (@('compose') + $composeArgs) -OutFile $OutFile -InStreams $InStreams -Capture:$Capture
}

# SQL ажиллуулах: $Admin — root эрхээр (туршилтын сан үүсгэх); $Database — "" бол сан сонгохгүй
function Invoke-Sql {
  param([string]$Database, [IO.Stream[]]$InStreams, [string]$Sql, [switch]$Admin, [switch]$Capture)
  if ($Sql) { $InStreams = @(New-StringStream $Sql) }
  if ($Mode -eq 'docker') {
    $script = if ($Admin) { 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 -uroot -N "$@"' }
    else { 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -N "$@" "$MYSQL_DATABASE"' }
    $a = @('exec', '-T', 'db', 'sh', '-c', $script, 'sh')
    if ($Admin -and $Database) { $a += $Database }
    return Invoke-Compose $a -InStreams $InStreams -Capture:$Capture
  }
  if ($Admin) { $cnf = New-MyCnf (Get-Setting 'DB_ADMIN_USER' 'root') (Get-Setting 'DB_ADMIN_PASSWORD' (Get-Setting 'DB_ROOT_PASSWORD' '')) }
  else { $cnf = New-MyCnf $Db.User $Db.Password }
  try {
    $a = @("--defaults-extra-file=$cnf", '--default-character-set=utf8mb4', '-N')
    if ($Admin) { if ($Database) { $a += $Database } } else { $a += $Db.Name }
    return Invoke-Tool -Exe (Find-Tool @('mysql', 'mariadb')) -ArgList $a -InStreams $InStreams -Capture:$Capture
  } finally { Remove-Item $cnf -Force -ErrorAction SilentlyContinue }
}

function Get-Sha256([string]$path) { (Get-FileHash -Algorithm SHA256 $path).Hash.ToLowerInvariant() }

# sha256sum-тэй ижил формат ("hash  нэр") — Linux дээр `sha256sum -c` шалгана
function Write-Sums([string]$dir, [string[]]$names) {
  $lines = foreach ($n in $names) { "{0}  {1}" -f (Get-Sha256 (Join-Path $dir $n)), $n }
  [IO.File]::WriteAllText((Join-Path $dir 'SHA256SUMS'), (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
}

function Test-Sums([string]$dir) {
  $f = Join-Path $dir 'SHA256SUMS'
  if (-not (Test-Path $f)) { Stop-WithError "$f олдсонгүй" }
  foreach ($line in [IO.File]::ReadAllLines($f)) {
    if ($line -notmatch '^([0-9a-f]{64}) [ *](.+)$') { continue }
    $p = Join-Path $dir $Matches[2]
    if (-not (Test-Path $p) -or (Get-Sha256 $p) -ne $Matches[1]) { Stop-WithError "${dir}: $($Matches[2]) хяналтын нийлбэр таарахгүй — нөөц гэмтсэн" }
  }
}

function Open-GzipRead([string]$path) {
  New-Object IO.Compression.GZipStream ([IO.File]::OpenRead($path)), ([IO.Compression.CompressionMode]::Decompress)
}

# Файлын архивын дээд хавтас (STORAGE_DIR-ээс хамаарч `storage` биш байж болно)
function Get-ArchiveTop([string]$tgz) {
  $first = ((Invoke-Tool -Exe (Get-Tar) -ArgList @('-tzf', $tgz) -Capture) -split "`r?`n" | Where-Object { $_ } | Select-Object -First 1)
  $parts = @($first -split '/' | Where-Object { $_ -and $_ -ne '.' })
  return $parts[0]
}

function Get-Tar { if (Test-Path "$env:SystemRoot\System32\tar.exe") { "$env:SystemRoot\System32\tar.exe" } else { Find-Tool @('tar') } }
