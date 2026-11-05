<#
.SYNOPSIS
  Save a PNG of the emulator screen into captures\ (gitignored).
.EXAMPLE
  .\apps\vehicle\scripts\screenshot.ps1               # captures\pg-20261104-101500.png
  .\apps\vehicle\scripts\screenshot.ps1 c02-card.png
#>
param(
  [Parameter(Position = 0)][string]$File = '',
  [string]$Serial = '',
  [string]$Sdk = ''
)
. "$PSScriptRoot\common.ps1"

Require-Sdk $Sdk
Require-Device $Serial (Select-AvdName '' $false)

if (-not $File) { $File = 'pg-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.png' }
if (-not [IO.Path]::IsPathRooted($File)) { $File = "$PG_REPO_DIR\captures\$File" }
if ($File -notlike '*.png') { $File = "$File.png" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $File) | Out-Null

# PowerShell pipes are text, so "adb exec-out screencap -p > file" would corrupt the PNG: capture on the device, then pull.
$remote = '/sdcard/pg-shot.png'
$null = Adbs @('shell', 'screencap', '-p', $remote)
$null = Adbs @('pull', $remote, $File)
$null = Adbs @('shell', 'rm', '-f', $remote)
if (-not (Test-Path $File) -or (Get-Item $File).Length -lt 100) {
  Die "screencap returned no image (is the screen on? try: adb -s $PG_SERIAL shell input keyevent WAKEUP)"
}
Info "Saved $File"
