<#
.SYNOPSIS
  One-time setup for running the parkinggack car app on the Pleos Connect emulator (Windows). Safe to re-run.

.DESCRIPTION
  1. find the Android SDK and a JDK 17+          5. install platform-tools, emulator, platform 35, build-tools 35, system image
  2. install SDK command-line tools if missing   6. check CPU acceleration (WHPX / AEHD)
  3. add the Pleos SDK update site                7. create the AVD (Automotive profile, 4 GB RAM, cold boot)
  4. check free disk space                        8. write apps\vehicle\local.properties (sdk.dir) if missing
  Licenses (Android SDK, 42dot "Pleos Connect SDK License") are shown by sdkmanager - you accept them yourself.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File apps\vehicle\scripts\setup-emulator.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File apps\vehicle\scripts\setup-emulator.ps1 -Fallback
#>
param(
  [switch]$Fallback,      # Google's Android Automotive API 34 image instead of Pleos (UI + replay demo work)
  [string]$Sdk = '',      # Android SDK location
  [string]$Avd = '',      # AVD name (default Pleos_Connect / AAOS_Google_34)
  [switch]$Recreate,      # delete and recreate the AVD
  [string]$Lcd = '',      # e.g. 1280x720@160 (default: Pleos device profile; 1280x720@160 with -Fallback)
  [switch]$SiteOnly,      # only register the Pleos update site, then use Android Studio's GUI
  [switch]$DryRun         # print what would be done
)
. "$PSScriptRoot\common.ps1"

function Run([string]$exe, [string[]]$argv) {
  if ($DryRun) { Note ("[dry-run] $exe " + ($argv -join ' ')); return }
  & $exe @argv
  if ($LASTEXITCODE -ne 0) { throw "$exe exited with $LASTEXITCODE" }
}

function Register-PleosSite([string]$site) {
  # sdkmanager and Android Studio (SDK Manager > SDK Update Sites) both read user sites from
  # <android user home>\repositories.cfg: Java properties, keys count / srcNN / dispNN / enabledNN.
  $cfgDir = Get-AndroidUserHome
  $cfg = "$cfgDir\repositories.cfg"
  $file = ($site -split '/')[-1]
  $existing = @()
  if (Test-Path $cfg) { $existing = @(Get-Content $cfg | Where-Object { $_ -like "*connect-avd/2.x/$file" }) }
  if ($existing.Count -gt 0) {
    $idx = ''
    if ($existing[0] -match '^src(\d+)=') { $idx = $Matches[1] }
    if ($idx -and ((Get-Ini $cfg "enabled$idx") -eq 'false')) {
      if (-not $DryRun) { Set-Ini $cfg "enabled$idx" 'true' }
      Info "Re-enabled existing site entry in $cfg"
    } else { Info "Already registered in $cfg" }
  } else {
    $count = 0
    [void][int]::TryParse((Get-Ini $cfg 'count'), [ref]$count)
    $n = $count
    while ((Test-Path $cfg) -and (Get-Content $cfg | Where-Object { $_ -match ('^src{0:D2}=' -f $n) })) { $n++ }
    $idx = '{0:D2}' -f $n
    Info "Adding $site"
    Info "  to $cfg (same as Android Studio > SDK Manager > SDK Update Sites > +)"
    if ($DryRun) { Note "  [dry-run] would write src$idx / disp$idx / enabled$idx=true / count=$($n + 1)" }
    else {
      New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
      if (-not (Test-Path $cfg)) { [System.IO.File]::WriteAllLines($cfg, [string[]]@('### User Sources for Android SDK Manager', 'count=0')) }
      Set-Ini $cfg "src$idx" ($site -replace ':', '\:')
      Set-Ini $cfg "disp$idx" 'Pleos Connect Emulator'
      Set-Ini $cfg "enabled$idx" 'true'
      Set-Ini $cfg 'count' "$($n + 1)"
    }
  }
  try { $null = Invoke-WebRequest -Uri $site -Method Head -UseBasicParsing -TimeoutSec 15 }
  catch { Warn "Could not reach $site (network / firewall?). sdkmanager will not see the Pleos image until it is reachable." }
  Info 'Note: Android Studio rewrites this file while its SDK Manager window is open - close that window first.'
}

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# ---------------------------------------------------------------------------
Step '1/8 Host, Android SDK, Java'
$abi = Get-HostAbi
if ($abi -eq 'arm64-v8a') { Die 'Windows on ARM: the Android Emulator does not support this host. Use an x86_64 PC or a Mac.' }
if ($abi -ne 'x86_64') { Die "Unsupported CPU ($abi). The emulator needs x86_64." }
Info "Host: Windows / system-image ABI $abi"

if ($Fallback) {
  $sysimg = "$GOOGLE_AAOS_PKG_PREFIX;$abi"
  if (-not $Avd) { $Avd = $PG_AVD_FALLBACK }
  if (-not $Lcd) { $Lcd = '1280x720@160' }
  $site = ''
} else {
  $sysimg = "$PLEOS_PKG_PREFIX;$abi"
  if (-not $Avd) { $Avd = $PG_AVD_PLEOS }
  $site = $PLEOS_SITE_X86
}
$sysimgRel = (($sysimg -split ';')[1..3]) -join '\'   # android-34\pleos_car_emulator\x86_64

if ($SiteOnly) {
  if ($Fallback) { Die '-SiteOnly is for the Pleos image.' }
  Step 'Pleos SDK update site (-SiteOnly)'
  Register-PleosSite $site
  Write-Host ''
  Info 'Now in Android Studio:'
  Info '  Settings > Languages & Frameworks > Android SDK > SDK Platforms > Show Package Details'
  Info '    > Android 14.0 (API 34) > check "Pleos Connect v2.1.0 APIs ... System Image" > Apply (accept the license)'
  Info '  Device Manager > + > Create Virtual Device > Automotive > Pleos Connect v2.1.0 > RAM 4 GB > Cold boot'
  Info "Or run this script again without -SiteOnly (package $sysimg)."
  exit 0
}

if (-not (Find-Sdk $Sdk)) {
  $def = Get-DefaultSdkDir
  Warn "No Android SDK found (checked ANDROID_HOME, ANDROID_SDK_ROOT, apps\vehicle\local.properties, $def)."
  Info 'Easiest: install Android Studio (https://developer.android.com/studio), open it once, then re-run this script.'
  if (-not (Confirm-Step "Or create a new SDK (command-line tools only) at $def now?" $false)) { exit 1 }
  if (-not $DryRun) { New-Item -ItemType Directory -Force -Path $def | Out-Null }
  $null = Find-Sdk $def
}
Info "Android SDK: $PG_SDK"
Require-Java
Info "Java: $env:JAVA_HOME"

# ---------------------------------------------------------------------------
Step '2/8 SDK command-line tools (sdkmanager, avdmanager)'
$sdkm = Get-SdkManagerPath
if ($sdkm) { Info "Found: $sdkm" }
else {
  $zip = "commandlinetools-win-${PG_CMDLINE_TOOLS_BUILD}_latest.zip"
  $url = "https://dl.google.com/android/repository/$zip"
  Info 'Not installed. Android Studio: Settings > Languages & Frameworks > Android SDK > SDK Tools >'
  Info "  'Android SDK Command-line Tools (latest)'. Or download it now (~155 MB):"
  Info "  $url"
  if (-not (Confirm-Step "Download and install into $PG_SDK\cmdline-tools\latest?" $true)) { Die 'sdkmanager is required.' }
  if ($DryRun) { Note "[dry-run] download $url, unzip to $PG_SDK\cmdline-tools\latest"; $sdkm = "$PG_SDK\cmdline-tools\latest\bin\sdkmanager.bat" }
  else {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("pg-cmdline-tools-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $old = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'   # the PS 5.1 progress bar makes downloads very slow
    try { Invoke-WebRequest -Uri $url -OutFile "$tmp\$zip" -UseBasicParsing -ErrorAction Stop }
    catch { Die "Download failed: $($_.Exception.Message)" }
    finally { $ProgressPreference = $old }
    Expand-Archive -Path "$tmp\$zip" -DestinationPath $tmp -Force
    New-Item -ItemType Directory -Force -Path "$PG_SDK\cmdline-tools" | Out-Null
    if (Test-Path "$PG_SDK\cmdline-tools\latest") { Remove-Item -Recurse -Force "$PG_SDK\cmdline-tools\latest" }
    Move-Item "$tmp\cmdline-tools" "$PG_SDK\cmdline-tools\latest"
    Remove-Item -Recurse -Force $tmp
    $sdkm = Get-SdkManagerPath
    if (-not $sdkm) { Die 'cmdline-tools install failed.' }
    Info "Installed: $sdkm"
  }
}
$avdm = Join-Path (Split-Path -Parent $sdkm) 'avdmanager.bat'

# ---------------------------------------------------------------------------
Step '3/8 Pleos SDK update site'
if ($Fallback) { Info "Skipped (-Fallback uses Google's normal SDK repository)." }
else { Register-PleosSite $site }

# ---------------------------------------------------------------------------
Step '4/8 Disk space'
$need = 6
if (-not $Fallback) { $need = 16 }
$sysimgDir = "$PG_SDK\system-images\$sysimgRel"
if (Test-Path $sysimgDir) { $need = 3 }
try {
  $root = [IO.Path]::GetPathRoot($PG_SDK)
  $free = [math]::Floor((New-Object IO.DriveInfo($root)).AvailableFreeSpace / 1GB)
  Info "Free on $root : $free GB (recommended: $need GB+)"
  if ($free -lt $need) {
    Warn 'Low disk space. The Pleos image download alone is 4.1 GB, plus the unpacked image and AVD data.'
    if (-not (Confirm-Step 'Continue anyway?' $false)) { exit 1 }
  }
} catch { Note 'Could not read free disk space.' }

# ---------------------------------------------------------------------------
Step '5/8 SDK packages'
$pkgs = @()
if (-not (Test-Path "$PG_SDK\platform-tools\adb.exe")) { $pkgs += 'platform-tools' }
if (-not (Test-Path "$PG_SDK\emulator\emulator.exe")) { $pkgs += 'emulator' }
if (-not (Test-Path "$PG_SDK\platforms\android-35")) { $pkgs += 'platforms;android-35' }
if (-not (Test-Path "$PG_SDK\build-tools\35.0.0")) { $pkgs += 'build-tools;35.0.0' }
if ((Test-Path "$sysimgDir\system.img") -or (Test-Path "$sysimgDir\source.properties") -or (Test-Path "$sysimgDir\package.xml")) {
  Info "System image already installed: $sysimg"
} else { $pkgs += $sysimg }
if ($pkgs.Count -eq 0) { Info 'Everything installed.' }
else {
  Info ("Installing: " + ($pkgs -join ' '))
  if (-not $Fallback) {
    Info "sdkmanager will print the 42dot 'Pleos Connect SDK License'. Read it and type y to accept (your decision)."
    Info 'Download size: 4.1 GB - this takes a while.'
  }
  # Package ids contain ';', which cmd.exe (sdkmanager.bat) needs quoted.
  $argv = @('--install') + @($pkgs | ForEach-Object { Q $_ })
  try { Run $sdkm $argv }
  catch {
    if (-not $Fallback) {
      Warn 'Installing the Pleos image failed. Alternatives:'
      Info "  * Android Studio > Settings > Languages & Frameworks > Android SDK > SDK Update Sites > + > $site"
      Info "    then SDK Platforms > Show Package Details > Android 14 (API 34) > 'Pleos Connect v2.1.0 APIs ...'"
      Info '  * Or use Google''s Automotive image: setup-emulator.ps1 -Fallback'
    }
    Die 'sdkmanager --install failed.'
  }
}

# ---------------------------------------------------------------------------
Step '6/8 CPU acceleration'
if (Test-Path $PG_EMULATOR) {
  $acc = Exec $PG_EMULATOR @('-accel-check')
  # .NET regex accepts the empty alternative (\s* matches blank lines); only BSD grep in the .sh twin needed a fix
  $msg = ($acc | Where-Object { $_ -notmatch '^(accel:?|\d+|\s*)$' } | Select-Object -First 2) -join ' '
  if ($LASTEXITCODE -eq 0) {
    if (-not $msg) { $msg = 'Acceleration available (emulator -accel-check)' }
    Info $msg
  }
  else {
    Warn "Emulator acceleration check failed: $msg"
    Info '  Enable virtualization (VT-x/AMD-V) in BIOS/UEFI, then either'
    Info '  * Windows features > "Windows Hypervisor Platform" (admin: Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform), reboot'
    Info '  * or SDK Manager > SDK Tools > "Android Emulator hypervisor driver (installer)" (AEHD; not with Hyper-V on)'
  }
} else { Note 'emulator not installed yet (dry run?) - skipped.' }

# ---------------------------------------------------------------------------
Step "7/8 AVD '$Avd'"
$avdDir = "$(Get-AvdHome)\$Avd.avd"
$config = "$avdDir\config.ini"
if ((Test-Avd $Avd) -and $Recreate) {
  Info 'Deleting existing AVD (-Recreate)'
  Run $avdm @('delete', 'avd', '-n', $Avd)
}
if ((Test-Avd $Avd) -and -not $Recreate) {
  Info "Exists: $avdDir"
  $cur = Get-Ini $config 'image.sysdir.1'
  if (($cur -replace '/', '\') -notlike "*$sysimgRel*") { Warn "AVD '$Avd' uses '$cur', expected '$sysimgRel'. Use -Recreate or -Avd <other name>." }
} else {
  # The Pleos image ships its own hardware profile ("Pleos Connect v2.1.0" under Automotive) if devices.xml exists.
  $device = ''
  if (-not $Fallback -and (Test-Path "$sysimgDir\devices.xml")) {
    $m = Select-String -Path "$sysimgDir\devices.xml" -Pattern '<d:id>\s*([^<]+)</d:id>' | Select-Object -First 1
    if ($m) { $device = $m.Matches[0].Groups[1].Value.Trim() }
  }
  if (-not $Fallback -and -not $device -and -not $DryRun) {
    $device = (Exec $avdm @('list', 'device', '-c') | Where-Object { $_ -match 'pleos' } | Select-Object -First 1)
  }
  if (-not $device) {
    $device = 'automotive_1024p_landscape'
    if (-not $Fallback -and (Test-Path $sysimgDir)) { Warn "No Pleos hardware profile found in the image; using '$device'. Check the screen size later (docs/run-locally.md)." }
  }
  Info "Creating with $sysimg, device '$device'"
  if ($DryRun) { Note "[dry-run] $avdm create avd -n $Avd -k `"$sysimg`" -d $device" }
  else {
    'no' | & $avdm create avd -n $Avd -k (Q $sysimg) -d $device | Out-Null
    if ($LASTEXITCODE -ne 0) { Die 'avdmanager create avd failed.' }
  }
}
if ($DryRun -and -not (Test-Path $config)) {
  Note "[dry-run] would set in config.ini: hw.ramSize=4096 hw.keyboard=yes hw.gpu.enabled=yes fastboot.forceColdBoot=yes $Lcd"
} elseif (-not $DryRun) {
  if (-not (Test-Path $config)) { Die "AVD config not found: $config" }
  Set-Ini $config 'hw.ramSize' '4096'          # Pleos docs: RAM 4 GB
  Set-Ini $config 'hw.keyboard' 'yes'
  Set-Ini $config 'hw.gpu.enabled' 'yes'
  if (-not (Get-Ini $config 'hw.gpu.mode')) { Set-Ini $config 'hw.gpu.mode' 'auto' }
  if (-not (Get-Ini $config 'disk.dataPartition.size')) { Set-Ini $config 'disk.dataPartition.size' '6G' }
  Set-Ini $config 'fastboot.forceColdBoot' 'yes'   # Pleos docs: cold boot
  Set-Ini $config 'fastboot.forceFastBoot' 'no'
  if ($Lcd) {
    if ($Lcd -notmatch '^(\d+)x(\d+)(@(\d+))?$') { Die '-Lcd must look like 1280x720@160' }
    $w = $Matches[1]; $h = $Matches[2]; $dpi = '160'
    if ($Matches[4]) { $dpi = $Matches[4] }
    Set-Ini $config 'hw.lcd.width' $w
    Set-Ini $config 'hw.lcd.height' $h
    Set-Ini $config 'hw.lcd.density' $dpi
    Set-Ini $config 'hw.initialOrientation' 'landscape'
    Set-Ini $config 'skin.name' "${w}x${h}"
    Set-Ini $config 'skin.path' '_no_skin'
    Set-Ini $config 'showDeviceFrame' 'no'
  }
  Info ("config.ini: RAM $(Get-Ini $config 'hw.ramSize') MB, screen $(Get-Ini $config 'hw.lcd.width')x$(Get-Ini $config 'hw.lcd.height') @ $(Get-Ini $config 'hw.lcd.density') dpi, cold boot")
}

# ---------------------------------------------------------------------------
Step '8/8 apps\vehicle\local.properties'
$lp = "$PG_VEHICLE_DIR\local.properties"
if ((Test-Path $lp) -and (Select-String -Path $lp -Pattern '^\s*sdk\.dir' -Quiet)) { Info "Exists (sdk.dir=$(Get-LocalPropsSdk))" }
elseif ($DryRun) { Note "[dry-run] would write sdk.dir=$($PG_SDK -replace '\\', '/') to $lp" }
else {
  [System.IO.File]::AppendAllText($lp, "sdk.dir=$($PG_SDK -replace '\\', '/')`r`n")
  Info "Wrote sdk.dir (gitignored)"
}

# ---------------------------------------------------------------------------
Step 'Done'
if ($DryRun) { Info 'Dry run: nothing was changed.' } else { Info "AVD '$Avd' is ready ($sysimg)." }
$flags = ''
if ($Fallback) { $flags = ' -Fallback' }
Write-Host ''
Info 'Next:'
Info "  powershell -ExecutionPolicy Bypass -File apps\vehicle\scripts\run-app.ps1$flags"
Info '  powershell -ExecutionPolicy Bypass -File apps\vehicle\scripts\demo.ps1 main -Speed 1.5'
Info '  Virtual Console (Pleos image only): http://127.0.0.1:8088/'
Info 'Step-by-step guide (Korean): docs\run-locally.md'
