<#
.SYNOPSIS
  Drive the car-app demo on a running emulator (Windows). Same commands as demo.sh.

.EXAMPLE
  .\apps\vehicle\scripts\demo.ps1 main -Speed 1.5        # replay demo with the C-02 destination card
  .\apps\vehicle\scripts\demo.ps1 parallel -NoDest       # parallel-parking replay, no card
  .\apps\vehicle\scripts\demo.ps1 reset                  # clear app data -> onboarding (C-11)
  .\apps\vehicle\scripts\demo.ps1 seed                   # put the 13 example records back (C-01/C-09 full)
  .\apps\vehicle\scripts\demo.ps1 stop                   # force-stop the app
  .\apps\vehicle\scripts\demo.ps1 list                   # list scenarios
  .\apps\vehicle\scripts\demo.ps1 live-speed off         # no speed signal -> 1.4 m/s creep in D/R (Virtual Console)
  .\apps\vehicle\scripts\demo.ps1 vhal gear D            # inject a VHAL value (unverified on the Pleos image)
#>
param(
  [Parameter(Position = 0)][string]$Command = 'main',
  [Parameter(Position = 1)][string]$Arg1 = '',
  [Parameter(Position = 2)][string]$Arg2 = '',
  [string]$Speed = '1',       # replay speed factor 0.25..8
  [switch]$NoDest,            # skip the C-02 destination card
  [switch]$NoLaunch,          # reset: do not relaunch
  [string]$Serial = '',
  [string]$Sdk = ''
)
. "$PSScriptRoot\common.ps1"

$scenarios = @(
  @('main', 'pangyo-department-store', 'underground, 2-turn spiral ramp to B2, 2 reverses, ~1m40s at x1'),
  @('parallel', 'parallel-parking', 'on-street parallel parking, 1 reverse'),
  @('angled', 'angled-parking', 'angled bay, forward in, no reverse'),
  @('flat', 'flat-lot-simple', 'flat lot, forward into a bay, no ramp'),
  @('split', 'split-level', '1.5-turn ramp -> floor unclear (LOW): C-05 asks the floor, saves without one after 8 s')
)

function Get-ScenarioId([string]$s) {
  switch ($s) {
    { $_ -in 'main', 'pangyo', 'pangyo-department-store' } { return 'pangyo-department-store' }
    { $_ -in 'parallel', 'parallel-parking' } { return 'parallel-parking' }
    { $_ -in 'angled', 'angled-parking' } { return 'angled-parking' }
    { $_ -in 'flat', 'flat-lot', 'flat-lot-simple' } { return 'flat-lot-simple' }
    { $_ -in 'split', 'split-level' } { return 'split-level' }
  }
  return ''
}

if ($Command -eq 'list') {
  Info 'Scenarios (ids accepted by ScenarioGenerator.byId; MainActivity also maps "main"):'
  foreach ($s in $scenarios) { Info ('  {0,-9} {1,-24} {2}' -f $s[0], $s[1], $s[2]) }
  exit 0
}

Require-Sdk $Sdk
Require-Device $Serial (Select-AvdName '' $false)
if (-not (Test-AppInstalled)) { Die "$PG_PKG is not installed on $PG_SERIAL. Run apps\vehicle\scripts\run-app.ps1 first." }

function Test-AppRunning { return [bool](Join-Lines (Adbs @('shell', 'pidof', $PG_PKG))) }
# Start-AppVerified: relaunch if another app (e.g. the Pleos navigation app right after boot) has the foreground
function Restart-App { $null = Adbs @('shell', 'am', 'force-stop', $PG_PKG); $null = Start-AppVerified }

switch ($Command) {
  'reset' {
    $user = Get-CurrentUser
    $null = Adbs @('shell', 'pm', 'clear', '--user', $user, $PG_PKG)
    # pm clear also resets runtime permissions; grant them again so no dialog interrupts the demo (best effort)
    $null = Adbs @('shell', 'pm', 'grant', '--user', $user, $PG_PKG, 'android.car.permission.CAR_SPEED')
    $null = Adbs @('shell', 'pm', 'grant', '--user', $user, $PG_PKG, 'pleos.car.permission.FUSED_LOCATION')
    $null = Adbs @('shell', 'appops', 'set', '--user', $user, $PG_PKG, 'SYSTEM_ALERT_WINDOW', 'allow')
    Info 'App data cleared (records, settings). Onboarding C-11 shows on next launch.'
    if (-not $NoLaunch) { if (Start-AppVerified) { Info 'Launched.' } }
  }
  'stop' {
    $null = Adbs @('shell', 'am', 'force-stop', $PG_PKG)
    Info "Stopped $PG_PKG."
  }
  'seed' {
    if (-not (Test-AppRunning)) { $null = Start-AppVerified }
    $null = Adbs @('shell', 'am', 'start', '--activity-single-top', '-n', $PG_ACTIVITY, '--ez', 'seedDemo', 'true')
    Info 'Example records put back (ids seed-..., never uploaded). Remove them in C-10 Settings > clear all records.'
  }
  'live-speed' {
    $perm = 'android.car.permission.CAR_SPEED'
    $user = Get-CurrentUser
    if ($Arg1 -eq 'off') {
      $null = Adbs @('shell', 'pm', 'revoke', '--user', $user, $PG_PKG, $perm)
      # user-fixed = "don't ask again": the app's permission request returns at once, no dialog (Android 12+)
      $o = Join-Lines (Adbs @('shell', 'pm', 'set-permission-flags', '--user', $user, $PG_PKG, $perm, 'user-fixed'))
      if ($LASTEXITCODE -ne 0) { Warn "Could not set user-fixed ($o); if a permission dialog appears, choose 'Don't allow'." }
      Restart-App
      Info 'Speed signal off: with gear D/R and brake released the app assumes 1.4 m/s (LiveSignalSource creep fallback).'
    } elseif ($Arg1 -eq 'on') {
      $null = Adbs @('shell', 'pm', 'clear-permission-flags', '--user', $user, $PG_PKG, $perm, 'user-fixed')
      $null = Adbs @('shell', 'pm', 'grant', '--user', $user, $PG_PKG, $perm)
      Restart-App
      Info 'Speed signal on (PERF_VEHICLE_SPEED).'
    } else { Die 'Usage: demo.ps1 live-speed on|off' }
  }
  'vhal' {
    if ($Arg1 -eq 'speed') {
      if ($Arg2 -notmatch '^\d+(\.\d+)?$') { Die 'Usage: demo.ps1 vhal speed <m/s>, e.g. 1.4' }
      $prop = '0x11600207'; $val = $Arg2            # PERF_VEHICLE_SPEED, float m/s
    } elseif ($Arg1 -eq 'gear') {
      $map = @{ 'N' = '1'; 'R' = '2'; 'P' = '4'; 'D' = '8' }   # GEAR_SELECTION
      $val = $map[$Arg2.ToUpper()]
      if (-not $val) { Die 'Usage: demo.ps1 vhal gear P|R|N|D' }
      $prop = '0x11400400'
    } else { Die 'Usage: demo.ps1 vhal speed <m/s> | vhal gear P|R|N|D' }
    $o = Join-Lines (Adbs @('shell', 'cmd', 'car_service', 'inject-vhal-event', $prop, $val))
    if ($o -match 'rror|xception|ermission|nknown|not found') {
      $o2 = Join-Lines (Adbs @('shell', 'dumpsys', 'activity', 'service', 'com.android.car', 'inject-vhal-event', $prop, $val))
      Info "car_service: $o"
      Info "dumpsys:     $o2"
      Note "If both fail, try 'adb -s $PG_SERIAL root' first (userdebug images only)."
    } else { Info "Injected $prop = $val $o" }
    Note 'Gear/steering in this app come from the Pleos Vehicle SDK; whether VHAL injection reaches it is unverified.'
  }
  default {
    $id = Get-ScenarioId $Command
    if (-not $id) { Die "Unknown scenario '$Command'. Try: demo.ps1 list" }
    if ($Speed -notmatch '^\d+(\.\d+)?$') { Die '-Speed must be a number (0.25..8), e.g. 1.5' }
    # Bring the app to the foreground first, then send the demo intent with SINGLE_TOP|CLEAR_TOP so it arrives
    # through onNewIntent. (Cold-start C-02 bug is fixed in MainActivity; launching first is a safety net.)
    if (-not (Test-AppRunning)) { Info 'Starting the app first'; $null = Start-AppVerified } else { Start-App }
    $extras = @('--es', 'demo', $id, '--ef', 'speed', $Speed)
    if ($NoDest) { $extras += @('--ez', 'dest', 'false') }
    $null = Adbs (@('shell', 'am', 'start', '--activity-single-top', '--activity-clear-top', '-n', $PG_ACTIVITY) + $extras)
    $suffix = ''
    if ($NoDest) { $suffix = ' (no destination card)' }
    Info "Demo '$id' x$Speed on $PG_SERIAL$suffix"
    if (-not $NoDest) { Info 'C-02 card shows first: tap the dismiss button to drive, or "easier lots" -> "route via" (C-03).' }
    Info "Then: C-04 banner -> 'recording' -> P -> C-05. The replay switches back to live signals when it ends."
  }
}
