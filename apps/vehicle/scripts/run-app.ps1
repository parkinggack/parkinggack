<#
.SYNOPSIS
  Build the debug APK, start the emulator (cold boot) if needed, install and launch the car app, forward Virtual Console.

.DESCRIPTION
  After boot it sets the device time zone (-TimeZone, default Asia/Seoul; the Pleos AVD ships with
  America/Los_Angeles, so parking times would show US time). -KeepTimeZone leaves it as it is.
  On a fresh boot it waits for the Pleos launcher and its navigation app to come up first, and it relaunches the app
  if they still take the foreground.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File apps\vehicle\scripts\run-app.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File apps\vehicle\scripts\run-app.ps1 -Fallback -NoBuild
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File apps\vehicle\scripts\run-app.ps1 -NoBuild -KeepTimeZone
#>
param(
  [string]$Avd = '',          # AVD to start (default Pleos_Connect, else AAOS_Google_34 if only that exists)
  [switch]$Fallback,          # same as -Avd AAOS_Google_34
  [string]$Serial = '',       # use this already-running device (adb serial)
  [switch]$NoBuild,           # skip Gradle, install the existing APK
  [switch]$QuickBoot,         # allow snapshot quick boot (default: cold boot -no-snapshot-load)
  [switch]$Wipe,              # -wipe-data
  [switch]$Headless,          # -no-window
  [string]$Gpu = '',          # -gpu mode (auto, host, swiftshader_indirect, ...)
  [int]$BootTimeout = 600,
  [switch]$NoGrant,           # install without granting runtime permissions
  [string]$TimeZone = 'Asia/Seoul',   # device time zone to set after boot (the Pleos AVD boots with America/Los_Angeles)
  [switch]$KeepTimeZone,      # leave the device time zone as it is
  [string]$Sdk = ''
)
. "$PSScriptRoot\common.ps1"

# adb shell passes the value through the device shell, so allow only zone-id characters
if ($TimeZone -cnotmatch '^[A-Za-z0-9_+/-]+$') { Die "-TimeZone must be a zone id such as Asia/Seoul (got '$TimeZone')." }

Require-Sdk $Sdk
$avdName = Select-AvdName $Avd ([bool]$Fallback)

# ---------------------------------------------------------------------------
if (-not $NoBuild) {
  Step 'Build debug APK (apps\vehicle: gradlew.bat assembleDebug)'
  Require-Java
  Push-Location $PG_VEHICLE_DIR
  try {
    & .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) {
      Warn 'Build failed. Retrying with --max-workers=1 (helps when Maven Central answers 429).'
      & .\gradlew.bat --max-workers=1 assembleDebug
      if ($LASTEXITCODE -ne 0) { Die 'Gradle build failed.' }
    }
  } finally { Pop-Location }
}
if (-not (Test-Path $PG_APK)) { Die "APK not found: $PG_APK (run without -NoBuild)" }
Info "APK: $PG_APK"

# ---------------------------------------------------------------------------
Step 'Emulator'
$proc = $null
$log = ''
$freshBoot = $false
$sel = Select-Device $Serial $avdName
if ($sel -eq 2) { exit 1 }
if ($sel -eq 0) {
  $name = Get-EmulatorAvdName $PG_SERIAL
  Info "Using running device $PG_SERIAL $(if ($name) { "(AVD $name)" })"
  # still booting (e.g. just started from Android Studio) -> same launcher race as a boot started here
  if ((Join-Lines (Adbs @('shell', 'getprop', 'sys.boot_completed'))) -ne '1') { $freshBoot = $true }
} else {
  if ($Serial -or $env:ANDROID_SERIAL) { Die "Device $Serial$env:ANDROID_SERIAL is not online (adb devices)." }
  if (-not (Test-Avd $avdName)) { Die "AVD '$avdName' not found in $(Get-AvdHome). Run apps\vehicle\scripts\setup-emulator.ps1 first." }
  if (-not (Test-Path $PG_EMULATOR)) { Die "Emulator not installed ($PG_EMULATOR). Run setup-emulator.ps1." }
  # pick a free console port so the adb serial (emulator-<port>) is known in advance
  $used = @()
  foreach ($l in (Exec $PG_ADB @('devices'))) { if ($l -match '^emulator-(\d+)') { $used += [int]$Matches[1] } }
  $port = 5554
  while ($used -contains $port) { $port += 2 }
  $script:PG_SERIAL = "emulator-$port"
  $emuArgs = @('-avd', $avdName, '-port', "$port")
  if (-not $QuickBoot) { $emuArgs += '-no-snapshot-load' }
  if ($Wipe) { $emuArgs += '-wipe-data' }
  if ($Headless) { $emuArgs += '-no-window' }
  if ($Gpu) { $emuArgs += @('-gpu', $Gpu) }
  New-Item -ItemType Directory -Force -Path $PG_OUT_DIR | Out-Null
  $log = "$PG_OUT_DIR\emulator-$avdName.log"
  Info ("Starting: emulator " + ($emuArgs -join ' '))
  Info "Log: $log"
  # Detached from this console (hidden console via cmd /c, which also writes the log): closing this window or
  # pressing Ctrl+C later does not stop the emulator, and the emulator window itself opens normally.
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $env:ComSpec
  $psi.Arguments = '/c ""' + $PG_EMULATOR + '" ' + ($emuArgs -join ' ') + ' > "' + $log + '" 2>&1"'
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  $freshBoot = $true
}

Info 'Waiting for boot (cold boot of an Automotive image can take 2-5 min)'
Write-Host -NoNewline '    '
$rc = Wait-Boot $BootTimeout $proc
Write-Host ''
if ($rc -eq 2) {
  Warn 'The emulator exited. Last log lines:'
  if ($log -and (Test-Path $log)) { Get-Content $log -Tail 25 | ForEach-Object { Write-Host "      $_" } }
  Die "Emulator did not start - see 'Troubleshooting' in docs\run-locally.md."
} elseif ($rc -ne 0) {
  Die "Timed out after ${BootTimeout}s waiting for $PG_SERIAL to boot (-BootTimeout to wait longer)."
}
Info "Booted: $PG_SERIAL"

if (-not $KeepTimeZone) {
  $curTz = Join-Lines (Adbs @('shell', 'getprop', 'persist.sys.timezone'))
  if ($curTz -cne $TimeZone) {
    $null = Adbs @('shell', 'settings', 'put', 'global', 'auto_time_zone', '0')
    $tzOut = Join-Lines (Adbs @('shell', 'cmd', 'alarm', 'set-timezone', $TimeZone))
    $newTz = Join-Lines (Adbs @('shell', 'getprop', 'persist.sys.timezone'))
    if ($newTz -cne $TimeZone) {
      Start-Sleep -Seconds 1
      $newTz = Join-Lines (Adbs @('shell', 'getprop', 'persist.sys.timezone'))
    }
    $curShown = $curTz
    if (-not $curShown) { $curShown = 'unset' }
    if ($newTz -ceq $TimeZone) { Info "Time zone: $curShown -> $TimeZone (auto time zone off; -KeepTimeZone to skip)" }
    else { Warn "Could not set the device time zone to $TimeZone (still '$newTz'). $tzOut" }
  }
}

# ---------------------------------------------------------------------------
Step 'Install'
$ia = @('install', '-r')
if (-not $NoGrant) { $ia += '-g' }
$out = Join-Lines (Adbs ($ia + @($PG_APK)))
if ($LASTEXITCODE -ne 0 -or $out -notmatch 'Success') {
  Write-Host $out
  if ($out -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE') { Info "Signature differs from the installed copy: adb -s $PG_SERIAL uninstall $PG_PKG, then re-run." }
  if ($out -match 'INSTALL_FAILED_INSUFFICIENT_STORAGE') { Info 'AVD storage full: re-run with -Wipe, or setup-emulator.ps1 -Recreate.' }
  Die 'adb install failed.'
}
if ($NoGrant) { Info "Installed $PG_PKG" } else { Info "Installed $PG_PKG (runtime permissions granted with -g)" }
if (-not $NoGrant) {
  # "Display over other apps": the Pleos navigation app brings itself to the front when it gets addWaypoint (C-03).
  # With this app-op the app may bring itself back (Android blocks background activity starts otherwise).
  $null = Adbs @('shell', 'appops', 'set', '--user', (Get-CurrentUser), $PG_PKG, 'SYSTEM_ALERT_WINDOW', 'allow')
  if ($LASTEXITCODE -eq 0) { Info 'Allowed display over other apps (returns to the front after C-03 adds a waypoint)' }
  else { Warn 'Could not allow SYSTEM_ALERT_WINDOW; after C-03 the navigation app may stay in front.' }
}

# ---------------------------------------------------------------------------
Step 'Launch'
if ($freshBoot) {
  Info 'Waiting for the launcher to settle (fresh boot: the Pleos home screen and navigation app start after boot)'
  Write-Host -NoNewline '    '
  $settled = Wait-LauncherSettled 60 5
  Write-Host ''
  if (-not $settled) { Note 'Launcher not detected within 60 s; launching anyway.' }
}
if (Start-AppVerified 3 3) { Info "Started $PG_ACTIVITY (in the foreground)" }
$null = Adbs @('forward', 'tcp:8088', 'tcp:8088')
$size = ((Adbs @('shell', 'wm', 'size')) | Where-Object { $_ -match 'size:' } | Select-Object -Last 1) -replace '.*size:\s*', ''
$density = ((Adbs @('shell', 'wm', 'density')) | Where-Object { $_ -match 'density:' } | Select-Object -Last 1) -replace '.*density:\s*', ''
Info "Screen: $size @ $density dpi (UI designed for 1280x720 @ 160 dpi)"

Write-Host ''
Info 'Virtual Console (Pleos image): http://127.0.0.1:8088/   (adb forward tcp:8088 tcp:8088 is set)'
Info 'Gear P/R/D, steering angle and brake drive the live recording.'
Write-Host ''
Info 'Next:'
Info '  .\apps\vehicle\scripts\demo.ps1 main -Speed 1.5   # replay demo: C-02 card -> drive -> C-04 -> C-05'
Info '  .\apps\vehicle\scripts\demo.ps1 reset             # clear app data -> onboarding (C-11)'
Info '  .\apps\vehicle\scripts\screenshot.ps1             # PNG into captures\'
Info '  .\apps\vehicle\scripts\record.ps1                 # MP4 into captures\ (Enter to stop)'
Info '  .\apps\vehicle\scripts\logcat.ps1                 # app logs'
