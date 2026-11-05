<#
.SYNOPSIS
  Record the emulator screen to MP4 (adb shell screenrecord) for the 1-2 min demo video. Files go to captures\.
.EXAMPLE
  .\apps\vehicle\scripts\record.ps1                    # start now, press Enter to stop
  .\apps\vehicle\scripts\record.ps1 start              # start in the background (then run demo.ps1)
  .\apps\vehicle\scripts\record.ps1 stop demo.mp4      # stop and pull
#>
param(
  [Parameter(Position = 0)][string]$Command = 'interactive',   # interactive | start | stop
  [Parameter(Position = 1)][string]$File = '',
  [int]$TimeLimit = 180,     # screenrecord maximum is 180 s
  [int]$BitRate = 8,         # Mbps
  [string]$Size = '',        # WxH, default = device resolution
  [string]$Serial = '',
  [string]$Sdk = ''
)
. "$PSScriptRoot\common.ps1"

Require-Sdk $Sdk
Require-Device $Serial (Select-AvdName '' $false)

$remote = '/sdcard/pg-demo.mp4'
$state = "$PG_OUT_DIR\record-$PG_SERIAL.pid"

function Test-Recording { return [bool](Join-Lines (Adbs @('shell', 'pidof', 'screenrecord'))) }

function Start-Rec {
  if (Test-Recording) { Die "screenrecord is already running on $PG_SERIAL - run: record.ps1 stop" }
  New-Item -ItemType Directory -Force -Path $PG_OUT_DIR | Out-Null
  $null = Adbs @('shell', 'rm', '-f', $remote)
  $sr = "screenrecord --time-limit $TimeLimit --bit-rate $($BitRate * 1000000)"
  if ($Size) { $sr += " --size $Size" }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $PG_ADB
  $psi.Arguments = "-s $PG_SERIAL shell $sr $remote"
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  Set-Content -Path $state -Value $p.Id -Encoding ASCII
  Start-Sleep -Seconds 1
  if (-not (Test-Recording)) { Die 'screenrecord did not start.' }
  Info "Recording $PG_SERIAL (max ${TimeLimit}s, $BitRate Mbps) -> $remote"
}

function Stop-Rec {
  # SIGINT lets screenrecord finish the MP4 properly
  $null = Adbs @('shell', 'pkill -INT screenrecord 2>/dev/null || kill -INT $(pidof screenrecord) 2>/dev/null')
  for ($i = 0; $i -lt 10 -and (Test-Recording); $i++) { Start-Sleep -Seconds 1 }
  if (Test-Path $state) {
    $procId = [int](Get-Content $state | Select-Object -First 1)
    Stop-Process -Id $procId -ErrorAction SilentlyContinue
    Remove-Item $state -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
  if (-not $File) { $script:File = 'pg-demo-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.mp4' }
  $f = $script:File
  if (-not [IO.Path]::IsPathRooted($f)) { $f = "$PG_REPO_DIR\captures\$f" }
  if ($f -notlike '*.mp4') { $f = "$f.mp4" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $f) | Out-Null
  $null = Adbs @('pull', $remote, $f)
  if ($LASTEXITCODE -ne 0) { Die "Could not pull $remote (was anything recorded?)" }
  $null = Adbs @('shell', 'rm', '-f', $remote)
  Info "Saved $f"
}

switch ($Command) {
  'start' { Start-Rec; Info 'Stop with: .\apps\vehicle\scripts\record.ps1 stop' }
  'stop' { Stop-Rec }
  'interactive' { Start-Rec; $null = Read-Host '    Press Enter to stop recording'; Stop-Rec }
  default {
    # record.ps1 demo.mp4 -> interactive with a file name
    $script:File = $Command; Start-Rec; $null = Read-Host '    Press Enter to stop recording'; Stop-Rec
  }
}
