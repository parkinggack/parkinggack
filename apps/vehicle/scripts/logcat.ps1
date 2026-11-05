<#
.SYNOPSIS
  Show the car app's logs: our tags (MainActivity, AppController, CarSignals, VehicleGateway, NaviGateway) + crashes.
.EXAMPLE
  .\apps\vehicle\scripts\logcat.ps1           # our tags
  .\apps\vehicle\scripts\logcat.ps1 -All      # everything from the app process (incl. Pleos SDK internals)
  .\apps\vehicle\scripts\logcat.ps1 -Clear    # clear the buffer first
#>
param(
  [switch]$All,               # (not -Pid: $PID is a read-only automatic variable in PowerShell)
  [switch]$Clear,
  [string]$Serial = '',
  [string]$Sdk = ''
)
. "$PSScriptRoot\common.ps1"

Require-Sdk $Sdk
Require-Device $Serial (Select-AvdName '' $false)
if ($Clear) { $null = Adbs @('logcat', '-c') }

if ($All) {
  $appPid = Join-Lines (Adbs @('shell', 'pidof', $PG_PKG))
  if (-not $appPid) { Die "$PG_PKG is not running." }
  & $PG_ADB -s $PG_SERIAL logcat -v time "--pid=$appPid"
  exit $LASTEXITCODE
}
$filters = @($PG_LOG_TAGS | ForEach-Object { "${_}:V" }) + @('AndroidRuntime:E')
& $PG_ADB -s $PG_SERIAL logcat -v time -s @filters
exit $LASTEXITCODE
