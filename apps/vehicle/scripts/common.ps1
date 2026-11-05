# Shared helpers for apps\vehicle\scripts\*.ps1 (Windows PowerShell 5.1 and PowerShell 7). Dot-sourced, not run directly.
# Kept ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less files in the ANSI code page.
#
# Native tools (adb, emulator, sdkmanager) report failure through $LASTEXITCODE, so the default
# ErrorActionPreference stays 'Continue' (with 'Stop', PS 5.1 turns any stderr line of a native tool into an error).

$ErrorActionPreference = 'Continue'

$PG_PKG = 'com.parkinggack.app'
$PG_ACTIVITY = "$PG_PKG/.ui.MainActivity"
$PG_AVD_PLEOS = 'Pleos_Connect'
$PG_AVD_FALLBACK = 'AAOS_Google_34'
$PG_LOG_TAGS = @('MainActivity', 'AppController', 'CarSignals', 'VehicleGateway', 'NaviGateway')
# Pleos image: home screen app and the navigation app it starts (both take the foreground shortly after boot)
$PG_PLEOS_HOME_PKG = 'ai.umos.homescreen'
$PG_PLEOS_NAV_PKG = 'ai.umos.maps.android.navigation.app'

$PG_SCRIPTS_DIR = $PSScriptRoot
$PG_VEHICLE_DIR = Split-Path -Parent $PG_SCRIPTS_DIR
$PG_REPO_DIR = Split-Path -Parent (Split-Path -Parent $PG_VEHICLE_DIR)
$PG_APK = "$PG_VEHICLE_DIR\app\build\outputs\apk\debug\app-debug.apk"
$PG_OUT_DIR = "$PG_VEHICLE_DIR\build\emulator"

# Pleos Connect emulator v2.1.0 - values from the update-site XMLs (checked 2026-11-03):
#   API 34, tag android-automotive, vendor pleos, revision 2, needs emulator >= 24
#   x86_64: crp_car_emulator.zip 4,087,751,964 bytes / arm64: crp_car_arm64_emulator.zip 4,669,762,816 bytes
$PLEOS_SITE_X86 = 'https://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-sys-img.xml'
$PLEOS_SITE_ARM = 'https://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-arm64-sys-img.xml'
$PLEOS_PKG_PREFIX = 'system-images;android-34;pleos_car_emulator'
# Fallback: Google's Android Automotive image (normal SDK repo), ~1.37 GB, needs emulator >= 35
$GOOGLE_AAOS_PKG_PREFIX = 'system-images;android-34-ext9;android-automotive'
# Android SDK Command-line Tools 23.0
$PG_CMDLINE_TOOLS_BUILD = '16111833'

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
function Step([string]$m) { Write-Host ''; Write-Host "==> $m" -ForegroundColor Cyan }
function Info([string]$m) { Write-Host "    $m" }
function Note([string]$m) { Write-Host "    $m" -ForegroundColor DarkGray }
function Warn([string]$m) { Write-Host "WARNING: $m" -ForegroundColor Yellow }
function Die([string]$m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

function Confirm-Step([string]$prompt, [bool]$defaultYes = $true) {
  if ([Console]::IsInputRedirected) { return $defaultYes }
  $hint = '[y/N]'
  if ($defaultYes) { $hint = '[Y/n]' }
  $a = Read-Host "    $prompt $hint"
  if ([string]::IsNullOrWhiteSpace($a)) { return $defaultYes }
  return ($a -match '^(y|yes)$')
}

# Quote an argument that contains ';' for a .bat tool (sdkmanager.bat / avdmanager.bat run through cmd.exe).
function Q([string]$s) { return '"' + $s + '"' }

# Run a native command, return its output lines as strings (stderr included). Exit code in $LASTEXITCODE.
function Exec([string]$exe, [string[]]$argv) {
  $out = & $exe @argv 2>&1 | ForEach-Object { "$_" }
  return $out
}

function Join-Lines($lines) { if ($null -eq $lines) { return '' } return (($lines | Out-String).Trim()) }

# ---------------------------------------------------------------------------
# Host
# ---------------------------------------------------------------------------
function Get-HostAbi {
  $arch = $env:PROCESSOR_ARCHITEW6432
  if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
  switch ($arch) {
    'AMD64' { return 'x86_64' }
    'ARM64' { return 'arm64-v8a' }
    default { return "unsupported-$arch" }
  }
}

# ---------------------------------------------------------------------------
# Android SDK
# ---------------------------------------------------------------------------
function Get-LocalPropsSdk {
  $f = "$PG_VEHICLE_DIR\local.properties"
  if (-not (Test-Path $f)) { return '' }
  $line = Get-Content $f | Where-Object { $_ -match '^\s*sdk\.dir\s*[=:]' } | Select-Object -Last 1
  if (-not $line) { return '' }
  $v = ($line -replace '^\s*sdk\.dir\s*[=:]\s*', '')
  return ($v -replace '\\:', ':' -replace '\\\\', '\')
}

function Get-DefaultSdkDir { return "$env:LOCALAPPDATA\Android\Sdk" }

function Test-SdkDir([string]$d) {
  if (-not $d -or -not (Test-Path $d)) { return $false }
  foreach ($sub in 'platform-tools', 'cmdline-tools', 'platforms', 'emulator', 'licenses') {
    if (Test-Path "$d\$sub") { return $true }
  }
  return $false
}

# Sets $script:PG_SDK, $script:PG_ADB, $script:PG_EMULATOR and ANDROID_HOME / ANDROID_SDK_ROOT. Returns $true if found.
function Find-Sdk([string]$explicit) {
  $script:PG_SDK = ''
  if ($explicit) { $script:PG_SDK = $explicit }
  else {
    foreach ($c in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Get-LocalPropsSdk), (Get-DefaultSdkDir))) {
      if (Test-SdkDir $c) { $script:PG_SDK = $c; break }
    }
  }
  if (-not $script:PG_SDK) { return $false }
  if (Test-Path $script:PG_SDK) { $script:PG_SDK = (Resolve-Path $script:PG_SDK).Path }
  $env:ANDROID_HOME = $script:PG_SDK
  $env:ANDROID_SDK_ROOT = $script:PG_SDK
  $script:PG_ADB = "$script:PG_SDK\platform-tools\adb.exe"
  $script:PG_EMULATOR = "$script:PG_SDK\emulator\emulator.exe"
  return $true
}

function Require-Sdk([string]$explicit) {
  if (-not (Find-Sdk $explicit)) {
    Die "Android SDK not found. Install Android Studio (it creates $(Get-DefaultSdkDir)), set ANDROID_HOME, or run setup-emulator.ps1 -Sdk <dir>."
  }
  if (-not (Test-Path $script:PG_ADB)) { Die "adb not found at $script:PG_ADB - run apps\vehicle\scripts\setup-emulator.ps1 first." }
}

function Get-SdkManagerPath {
  $p = "$script:PG_SDK\cmdline-tools\latest\bin\sdkmanager.bat"
  if (Test-Path $p) { return $p }
  $c = Get-Item "$script:PG_SDK\cmdline-tools\*\bin\sdkmanager.bat" -ErrorAction SilentlyContinue | Select-Object -Last 1
  if ($c) { return $c.FullName }
  return ''
}

# ---------------------------------------------------------------------------
# Java (sdkmanager / avdmanager / Gradle need JDK 17+)
# ---------------------------------------------------------------------------
function Get-JavaMajor([string]$java) {
  $v = Join-Lines (Exec $java @('-version'))
  if ($v -match 'version "1\.(\d+)') { return [int]$Matches[1] }
  if ($v -match 'version "(\d+)') { return [int]$Matches[1] }
  return 0
}

function Find-Java {
  $cands = @()
  if ($env:JAVA_HOME) { $cands += $env:JAVA_HOME }
  $cands += "$env:ProgramFiles\Android\Android Studio\jbr"
  $cands += "$env:LOCALAPPDATA\Programs\Android Studio\jbr"
  $tb = Get-Item "$env:LOCALAPPDATA\JetBrains\Toolbox\apps\AndroidStudio\*\*\jbr" -ErrorAction SilentlyContinue | Select-Object -Last 1
  if ($tb) { $cands += $tb.FullName }
  foreach ($c in $cands) {
    if ($c -and (Test-Path "$c\bin\java.exe") -and ((Get-JavaMajor "$c\bin\java.exe") -ge 17)) {
      $env:JAVA_HOME = $c; $env:Path = "$c\bin;$env:Path"; return $true
    }
  }
  $j = Get-Command java -ErrorAction SilentlyContinue
  if ($j -and ((Get-JavaMajor $j.Source) -ge 17)) {
    $jh = Join-Lines (Exec $j.Source @('-XshowSettings:properties', '-version') | Where-Object { $_ -match '^\s*java\.home = ' })
    if ($jh) { $env:JAVA_HOME = ($jh -replace '^\s*java\.home = ', '') }
    return $true
  }
  return $false
}

function Require-Java {
  if (-not (Find-Java)) { Die 'JDK 17+ not found. Install Android Studio (bundles a JDK) or a JDK 17/21, or set JAVA_HOME.' }
}

# ---------------------------------------------------------------------------
# Android user dir / AVDs / ini files
# ---------------------------------------------------------------------------
function Get-AndroidUserHome {
  if ($env:ANDROID_USER_HOME) { return $env:ANDROID_USER_HOME }
  if ($env:ANDROID_PREFS_ROOT) { return "$env:ANDROID_PREFS_ROOT\.android" }
  if ($env:ANDROID_SDK_HOME) { return "$env:ANDROID_SDK_HOME\.android" }
  return "$env:USERPROFILE\.android"
}

function Get-AvdHome {
  if ($env:ANDROID_AVD_HOME) { return $env:ANDROID_AVD_HOME }
  return "$(Get-AndroidUserHome)\avd"
}

function Test-Avd([string]$name) { return ((Test-Path "$(Get-AvdHome)\$name.ini") -and (Test-Path "$(Get-AvdHome)\$name.avd")) }

function Select-AvdName([string]$explicit, [bool]$fallback) {
  if ($explicit) { return $explicit }
  if ($fallback) { return $PG_AVD_FALLBACK }
  if (Test-Avd $PG_AVD_PLEOS) { return $PG_AVD_PLEOS }
  if (Test-Avd $PG_AVD_FALLBACK) { return $PG_AVD_FALLBACK }
  return $PG_AVD_PLEOS
}

function Get-Ini([string]$file, [string]$key) {
  if (-not (Test-Path $file)) { return '' }
  $line = Get-Content $file | Where-Object { $_ -match ('^' + [regex]::Escape($key) + '\s*=') } | Select-Object -Last 1
  if (-not $line) { return '' }
  return (($line -replace '^[^=]*=\s*', '').Trim())
}

# Set KEY=VALUE (replace or append). Written as UTF-8 without BOM (the emulator and Java read these files).
function Set-Ini([string]$file, [string]$key, [string]$value) {
  $lines = @()
  if (Test-Path $file) { $lines = @(Get-Content $file) }
  $out = New-Object System.Collections.Generic.List[string]
  $done = $false
  foreach ($l in $lines) {
    if ($l -match ('^' + [regex]::Escape($key) + '\s*=')) {
      if (-not $done) { $out.Add("$key=$value"); $done = $true }
    } else { $out.Add($l) }
  }
  if (-not $done) { $out.Add("$key=$value") }
  [System.IO.File]::WriteAllLines($file, $out.ToArray())
}

# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------
function Get-OnlineSerials {
  $lines = Exec $script:PG_ADB @('devices')
  $r = @()
  foreach ($l in $lines) { if ($l -match '^(\S+)\s+device$') { $r += $Matches[1] } }
  return $r
}

function Get-EmulatorAvdName([string]$serial) {
  $o = Exec $script:PG_ADB @('-s', $serial, 'emu', 'avd', 'name')
  if ($o) { return ([string]@($o)[0]).Trim() }
  return ''
}

function Test-Automotive([string]$serial) {
  return ((Join-Lines (Exec $script:PG_ADB @('-s', $serial, 'shell', 'pm', 'has-feature', 'android.hardware.type.automotive'))) -eq 'true')
}

# Sets $script:PG_SERIAL. Picks: explicit serial > emulator running that AVD > the only online Automotive device.
# Returns 0 = selected, 1 = nothing suitable online, 2 = several candidates.
function Select-Device([string]$explicit, [string]$avd) {
  if (-not $explicit) { $explicit = $env:ANDROID_SERIAL }
  $script:PG_SERIAL = ''
  $serials = @(Get-OnlineSerials)
  if ($explicit) {
    if ($serials -contains $explicit) { $script:PG_SERIAL = $explicit; return 0 }
    return 1
  }
  $autos = @()
  foreach ($s in $serials) {
    if ($s -like 'emulator-*' -and $avd -and ((Get-EmulatorAvdName $s) -eq $avd)) { $script:PG_SERIAL = $s; return 0 }
    if (Test-Automotive $s) { $autos += $s }
  }
  if ($autos.Count -eq 1) { $script:PG_SERIAL = $autos[0]; return 0 }
  if ($autos.Count -gt 1) { Warn "Several Automotive devices are online: $($autos -join ' '). Pass -Serial <id>."; return 2 }
  return 1
}

function Require-Device([string]$explicit, [string]$avd) {
  $rc = Select-Device $explicit $avd
  if ($rc -eq 2) { exit 1 }
  if ($rc -ne 0) { Die 'No Automotive emulator online. Start one with apps\vehicle\scripts\run-app.ps1 (or pass -Serial <id>).' }
}

# adb -s <serial> ...  -> output lines
function Adbs([string[]]$argv) { return (Exec $script:PG_ADB (@('-s', $script:PG_SERIAL) + $argv)) }

function Wait-Boot([int]$timeoutSec, $proc) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
    if ($proc -and $proc.HasExited) { return 2 }
    if ((Join-Lines (Adbs @('get-state'))) -eq 'device') {
      if ((Join-Lines (Adbs @('shell', 'getprop', 'sys.boot_completed'))) -eq '1') {
        if ((Join-Lines (Adbs @('shell', 'pm', 'path', 'android'))) -like 'package:*') { return 0 }
      }
    }
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 3
  }
  return 1
}

function Test-AppInstalled { return ((Join-Lines (Adbs @('shell', 'pm', 'path', $PG_PKG))) -like 'package:*') }

function Test-PkgInstalled([string]$pkg) { return ((Join-Lines (Adbs @('shell', 'pm', 'path', $pkg))) -like 'package:*') }

function Test-PkgRunning([string]$pkg) { return [bool](Join-Lines (Adbs @('shell', 'pidof', $pkg))) }

# The device's top resumed activity as dumpsys prints it, e.g.
# "ActivityRecord{1c4b5e2 u0 com.parkinggack.app/.ui.MainActivity t12}"; 'null' while nothing is resumed,
# '' when dumpsys has no such line.
function Get-TopResumedActivity {
  $line = (Adbs @('shell', 'dumpsys', 'activity', 'activities')) | Where-Object { $_ -match '^\s*topResumedActivity=' } | Select-Object -First 1
  if (-not $line) { return '' }
  return (([string]$line) -replace '^\s*topResumedActivity=', '').Trim()
}

# Home screen package: the Pleos launcher if the image has it, else whatever resolves the HOME intent
# (com.android.car.carlauncher on Google's Automotive image). '' if unknown.
function Get-HomePkg {
  if (Test-PkgInstalled $PG_PLEOS_HOME_PKG) { return $PG_PLEOS_HOME_PKG }
  $comp = (Adbs @('shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.HOME')) |
    Where-Object { $_ -match '^[A-Za-z0-9_.]+/' } | Select-Object -Last 1
  if (-not $comp) { return '' }
  $pkg = ([string]$comp).Split('/')[0]
  if ($pkg -eq 'android') { return '' }   # ResolverActivity (no default home) tells us nothing
  return $pkg
}

# True once the launcher has taken over: a Pleos home/navigation activity is resumed, or the home app runs and a
# real activity (not FallbackHome) is resumed.
function Test-LauncherReady([string]$top, [string]$homePkg) {
  if (-not $top -or $top -eq 'null' -or $top -like '*FallbackHome*') { return $false }
  if ($top -like "* $PG_PLEOS_HOME_PKG/*" -or $top -like "* $PG_PLEOS_NAV_PKG/*") { return $true }
  if (-not $homePkg) { return $true }
  if ($top -like "* $homePkg/*") { return $true }
  return (Test-PkgRunning $homePkg)
}

# Fresh boot only: the Pleos launcher (ai.umos.homescreen) and its navigation app come up a few seconds after
# sys.boot_completed=1 and take the foreground, so an app launched right after boot ends up in the background.
# Waits until the launcher is up, then $settleSec more seconds for the navigation app. Prints a dot per poll.
# Returns $false on timeout.
function Wait-LauncherSettled([int]$timeoutSec = 60, [int]$settleSec = 5) {
  $homePkg = Get-HomePkg
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while (-not (Test-LauncherReady (Get-TopResumedActivity) $homePkg)) {
    if ($sw.Elapsed.TotalSeconds -ge $timeoutSec) { return $false }
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 2
  }
  Start-Sleep -Seconds $settleSec
  return $true
}

# Android user the foreground runs as. On Pleos/AAOS this is 10, not 0, and 'pm clear/grant/revoke' without --user act on
# user 0, so they would not touch the app the driver sees. Falls back to 0.
function Get-CurrentUser {
  $u = (Join-Lines (Adbs @('shell', 'am', 'get-current-user'))).Trim()
  if ($u -match '^\d+$') { return $u } else { return '0' }
}

function Start-App {
  $null = Adbs @('shell', 'am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-n', $PG_ACTIVITY)
}

# Launch the app, wait $pauseSec and check that it is the top resumed activity. If something else has the foreground
# (on a fresh Pleos boot: the navigation app), launch again, up to $tries times.
# Returns $false (after a warning) if it is still not on top; $true if on top or not verifiable (no line in dumpsys).
# Callers that ignore the result: $null = Start-AppVerified
function Start-AppVerified([int]$tries = 3, [int]$pauseSec = 3) {
  Start-App
  for ($i = 0; $true; $i++) {
    Start-Sleep -Seconds $pauseSec
    $top = Get-TopResumedActivity
    if (-not $top) { Note 'Could not read the top activity (dumpsys activity activities); launch not verified.'; return $true }
    if ($top -like "* $PG_PKG/*") { return $true }
    if ($i -ge $tries) {
      Warn "$PG_ACTIVITY is still not in the foreground after $tries relaunches (top: $top). Open it from the launcher."
      return $false
    }
    Note "Not in the foreground (top: $top) - launching again ($($i + 1)/$tries)"
    Start-App
  }
}
