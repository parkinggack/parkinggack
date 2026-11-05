#!/usr/bin/env bash
# One-time setup for running 주차각 on the Pleos Connect emulator (macOS / Linux). Safe to re-run.
#
#   apps/vehicle/scripts/setup-emulator.sh              # Pleos Connect v2.1.0 image + AVD "Pleos_Connect"
#   apps/vehicle/scripts/setup-emulator.sh --fallback   # Google Android Automotive API 34 image + AVD "AAOS_Google_34"
#
# What it does (each step is skipped when already done):
#   1. find the Android SDK and a JDK 17+          5. install platform-tools, emulator, platform 35, build-tools 35, system image
#   2. install SDK command-line tools if missing   6. check CPU acceleration (HVF / KVM)
#   3. add the Pleos SDK update site                7. create the AVD (Automotive profile, 4 GB RAM, cold boot)
#   4. check free disk space                        8. write apps/vehicle/local.properties (sdk.dir) if missing
# Licenses (Android SDK, 42dot "Pleos Connect SDK License") are shown by sdkmanager — you accept them yourself.
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

  --fallback        Use Google's Android Automotive API 34 image instead of Pleos Connect
                    (UI + replay demo work; Pleos SDK calls fail gracefully)
  --sdk DIR         Android SDK location (default: \$ANDROID_HOME, local.properties, $(pg_default_sdk_dir))
  --avd NAME        AVD name (default: $PG_AVD_PLEOS, or $PG_AVD_FALLBACK with --fallback)
  --recreate        Delete and recreate the AVD (wipes its data)
  --lcd WxH@DPI     Override the AVD screen, e.g. 1280x720@160 (the size the UI was designed for).
                    Default: keep the Pleos device profile; 1280x720@160 for --fallback.
  --site-only       Only register the Pleos update site (then install/create the AVD in Android Studio's GUI)
  --dry-run         Print what would be changed/installed without doing it
  -h, --help        Show this help
EOF
}

FALLBACK=0; SDK_ARG=""; AVD_ARG=""; RECREATE=0; LCD=""; PG_DRY_RUN=0; SITE_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --fallback) FALLBACK=1 ;;
    --site-only) SITE_ONLY=1 ;;
    --sdk) SDK_ARG="${2:?--sdk needs a directory}"; shift ;;
    --avd) AVD_ARG="${2:?--avd needs a name}"; shift ;;
    --recreate) RECREATE=1 ;;
    --lcd) LCD="${2:?--lcd needs WxH@DPI}"; shift ;;
    --dry-run) PG_DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "Unknown option: $1" ;;
  esac
  shift
done
export PG_DRY_RUN

# ---------------------------------------------------------------------------
# Register the Pleos update site (idempotent). sdkmanager and Android Studio (SDK Manager > SDK Update Sites)
# both read user sites from <android user home>/repositories.cfg: Java properties with keys
# count / srcNN / dispNN / enabledNN (two-digit index, no dot) — verified with sdkmanager 19.
register_pleos_site() {
  CFG_DIR="$(pg_android_user_home)"; CFG="$CFG_DIR/repositories.cfg"
  SITE_FILE="${SITE##*/}"   # crp-sys-img.xml or crp-arm64-sys-img.xml
  if [ -f "$CFG" ] && grep -q "connect-avd/2.x/$SITE_FILE" "$CFG"; then
    IDX="$(grep "connect-avd/2.x/$SITE_FILE" "$CFG" | sed -n 's/^src\([0-9][0-9]*\)=.*/\1/p' | head -1)"
    if [ -n "$IDX" ] && [ "$(pg_get_ini "$CFG" "enabled$IDX")" = "false" ]; then
      run pg_set_ini "$CFG" "enabled$IDX" true
      info "Re-enabled existing site entry in $CFG"
    else
      info "Already registered in $CFG"
    fi
  else
    COUNT="$(pg_get_ini "$CFG" count)"; COUNT="${COUNT:-0}"
    case "$COUNT" in ''|*[!0-9]*) COUNT=0 ;; esac
    N="$COUNT"   # first free index (never overwrite another site's entry)
    while [ -f "$CFG" ] && grep -q "^src$(printf '%02d' "$N")=" "$CFG"; do N=$((N + 1)); done
    IDX="$(printf '%02d' "$N")"
    info "Adding $SITE"
    info "  to $CFG (same as Android Studio > SDK Manager > SDK Update Sites > +)"
    if [ "$PG_DRY_RUN" = 1 ]; then
      note "  [dry-run] would write: src$IDX / disp$IDX=Pleos Connect Emulator / enabled$IDX=true / count=$((N + 1))"
    else
      mkdir -p "$CFG_DIR"
      [ -f "$CFG" ] || printf '### User Sources for Android SDK Manager\ncount=0\n' > "$CFG"
      # shellcheck disable=SC2001  # sed: same backslash result on bash 3.2 (macOS) and 5.x
      pg_set_ini "$CFG" "src$IDX" "$(echo "$SITE" | sed 's/:/\\:/')"
      pg_set_ini "$CFG" "disp$IDX" "Pleos Connect Emulator"
      pg_set_ini "$CFG" "enabled$IDX" "true"
      pg_set_ini "$CFG" count "$((N + 1))"
    fi
  fi
  if command -v curl >/dev/null && ! curl -fsSI --max-time 15 "$SITE" >/dev/null 2>&1; then
    warn "Could not reach $SITE (network / firewall?). sdkmanager will not see the Pleos image until it is reachable."
  fi
  info "Note: Android Studio rewrites this file while its SDK Manager window is open — close that window first."
}

# ---------------------------------------------------------------------------
step "1/8 Host, Android SDK, Java"
OS="$(pg_host_os)"; ABI="$(pg_host_abi)"
[ "$OS" = windows ] && die "On Windows use PowerShell: powershell -ExecutionPolicy Bypass -File apps\\vehicle\\scripts\\setup-emulator.ps1"
case "$ABI" in arm64-v8a|x86_64) ;; *) die "Unsupported CPU ($ABI). The emulator needs x86_64 or arm64." ;; esac
if [ "$OS" = linux ] && [ "$ABI" = arm64-v8a ]; then
  warn "Linux on ARM64: the Android Emulator has limited support here. x86_64 Linux, macOS or Windows is recommended."
fi
info "Host: $OS / system-image ABI $ABI"

if [ "$FALLBACK" = 1 ]; then
  SYSIMG="$GOOGLE_AAOS_PKG_PREFIX;$ABI"; AVD="${AVD_ARG:-$PG_AVD_FALLBACK}"; [ -z "$LCD" ] && LCD="1280x720@160"
else
  SYSIMG="$PLEOS_PKG_PREFIX;$ABI"; AVD="${AVD_ARG:-$PG_AVD_PLEOS}"
  if [ "$ABI" = arm64-v8a ]; then SITE="$PLEOS_SITE_ARM"; else SITE="$PLEOS_SITE_X86"; fi
fi
SYSIMG_DIR_REL="$(echo "$SYSIMG" | cut -d';' -f2-4 | tr ';' '/')"   # e.g. android-34/pleos_car_emulator/x86_64

if [ "$SITE_ONLY" = 1 ]; then
  [ "$FALLBACK" = 1 ] && die "--site-only is for the Pleos image."
  step "Pleos SDK update site (--site-only)"
  register_pleos_site
  cat <<EOF

    Now in Android Studio:
      Settings > Languages & Frameworks > Android SDK > SDK Platforms > Show Package Details
        > Android 14.0 (API 34) > check "Pleos Connect v2.1.0 APIs ... System Image" > Apply (accept the license)
      Device Manager > + > Create Virtual Device > Automotive > Pleos Connect v2.1.0 > RAM 4 GB > Cold boot
    Or run this script again without --site-only to do it from the command line (package $SYSIMG).
EOF
  exit 0
fi

if ! pg_find_sdk "$SDK_ARG"; then
  DEF="$(pg_default_sdk_dir)"
  warn "No Android SDK found (checked \$ANDROID_HOME, \$ANDROID_SDK_ROOT, apps/vehicle/local.properties, $DEF)."
  info "Easiest: install Android Studio (https://developer.android.com/studio), open it once, then re-run this script."
  confirm "Or create a new SDK (command-line tools only) at $DEF now?" n || exit 1
  run mkdir -p "$DEF"
  pg_find_sdk "$DEF" || PG_SDK="$DEF"
  export ANDROID_HOME="$PG_SDK" ANDROID_SDK_ROOT="$PG_SDK"
  PG_ADB="$PG_SDK/platform-tools/adb"; PG_EMULATOR="$PG_SDK/emulator/emulator"
fi
info "Android SDK: $PG_SDK"
pg_require_java
info "Java: $JAVA_HOME (major $(pg_java_major "$JAVA_HOME/bin/java"))"

# ---------------------------------------------------------------------------
step "2/8 SDK command-line tools (sdkmanager, avdmanager)"
SDKM="$(pg_sdkmanager_path)"
if [ -n "$SDKM" ]; then
  info "Found: $SDKM"
else
  case "$OS/$ABI" in
    mac/arm64-v8a) ZIP="commandlinetools-mac_arm64-${PG_CMDLINE_TOOLS_BUILD}_latest.zip" ;;
    mac/*) ZIP="commandlinetools-mac_x86_64-${PG_CMDLINE_TOOLS_BUILD}_latest.zip" ;;
    *) ZIP="commandlinetools-linux-${PG_CMDLINE_TOOLS_BUILD}_latest.zip" ;;
  esac
  URL="https://dl.google.com/android/repository/$ZIP"
  info "Not installed. Android Studio: Settings > Languages & Frameworks > Android SDK > SDK Tools >"
  info "  'Android SDK Command-line Tools (latest)'. Or download it now (~160 MB):"
  info "  $URL"
  confirm "Download and install into $PG_SDK/cmdline-tools/latest?" y || die "sdkmanager is required."
  command -v unzip >/dev/null || die "'unzip' is required (e.g. sudo apt install unzip)."
  if [ "$PG_DRY_RUN" = 1 ]; then
    run curl -fL -o "<tmp>/$ZIP" "$URL"; run unzip -q "<tmp>/$ZIP" -d "<tmp>"; run mv "<tmp>/cmdline-tools" "$PG_SDK/cmdline-tools/latest"
    SDKM="$PG_SDK/cmdline-tools/latest/bin/sdkmanager"
  else
    TMPD="$(mktemp -d "${TMPDIR:-/tmp}/pg-cmdline-tools.XXXXXX")"
    curl -fL --progress-bar -o "$TMPD/$ZIP" "$URL"
    unzip -q "$TMPD/$ZIP" -d "$TMPD"
    mkdir -p "$PG_SDK/cmdline-tools"
    rm -rf "$PG_SDK/cmdline-tools/latest"
    mv "$TMPD/cmdline-tools" "$PG_SDK/cmdline-tools/latest"
    rm -rf "$TMPD"
    SDKM="$(pg_sdkmanager_path)"
    [ -n "$SDKM" ] || die "cmdline-tools install failed."
    info "Installed: $SDKM"
  fi
fi
AVDM="$(dirname "$SDKM")/avdmanager"

# ---------------------------------------------------------------------------
step "3/8 Pleos SDK update site"
if [ "$FALLBACK" = 1 ]; then
  info "Skipped (--fallback uses Google's normal SDK repository)."
else
  register_pleos_site
fi

# ---------------------------------------------------------------------------
step "4/8 Disk space"
NEED_GB=6; [ "$FALLBACK" = 0 ] && NEED_GB=16
if [ -d "$PG_SDK/system-images/$SYSIMG_DIR_REL" ]; then NEED_GB=3; fi
AVAIL_KB="$(df -Pk "$PG_SDK" 2>/dev/null | awk 'NR == 2 { print $4 }' || true)"
if [ -n "$AVAIL_KB" ]; then
  AVAIL_GB=$((AVAIL_KB / 1024 / 1024))
  info "Free on SDK disk: ${AVAIL_GB} GB (recommended: ${NEED_GB} GB+)"
  if [ "$AVAIL_GB" -lt "$NEED_GB" ]; then
    warn "Low disk space. The Pleos image download alone is 4.1 GB (x86_64) / 4.7 GB (arm64), plus unpacked image and AVD data."
    confirm "Continue anyway?" n || exit 1
  fi
fi

# ---------------------------------------------------------------------------
step "5/8 SDK packages"
PKGS=()
[ -x "$PG_SDK/platform-tools/adb" ] || PKGS+=("platform-tools")
[ -x "$PG_SDK/emulator/emulator" ] || PKGS+=("emulator")
[ -d "$PG_SDK/platforms/android-35" ] || PKGS+=("platforms;android-35")
[ -d "$PG_SDK/build-tools/35.0.0" ] || PKGS+=("build-tools;35.0.0")
SYSIMG_DIR="$PG_SDK/system-images/$SYSIMG_DIR_REL"
if [ -f "$SYSIMG_DIR/system.img" ] || [ -f "$SYSIMG_DIR/source.properties" ] || [ -f "$SYSIMG_DIR/package.xml" ]; then
  info "System image already installed: $SYSIMG"
else
  PKGS+=("$SYSIMG")
fi
if [ ${#PKGS[@]} -eq 0 ]; then
  info "Everything installed."
else
  info "Installing: ${PKGS[*]}"
  if [ "$FALLBACK" = 0 ]; then
    info "sdkmanager will print the 42dot 'Pleos Connect SDK License'. Read it and type y to accept (your decision)."
    info "Download size: 4.1 GB (x86_64) / 4.7 GB (arm64) — this takes a while."
  fi
  if ! run "$SDKM" --sdk_root="$PG_SDK" --install "${PKGS[@]}"; then
    if [ "$FALLBACK" = 0 ]; then
      warn "Installing the Pleos image failed. Alternatives:"
      info "  * Android Studio > Settings > Languages & Frameworks > Android SDK > SDK Update Sites > + > $SITE"
      info "    then SDK Platforms > Show Package Details > Android 14 (API 34) > 'Pleos Connect v2.1.0 APIs ...'"
      info "  * Or use Google's Automotive image: $(basename "$0") --fallback"
    fi
    die "sdkmanager --install failed."
  fi
fi

# ---------------------------------------------------------------------------
step "6/8 CPU acceleration"
if [ "$OS" = linux ]; then
  if [ ! -e /dev/kvm ]; then
    warn "/dev/kvm missing: enable virtualization (VT-x/AMD-V) in BIOS and install KVM (e.g. sudo apt install qemu-kvm)."
  elif [ ! -r /dev/kvm ] || [ ! -w /dev/kvm ]; then
    warn "No access to /dev/kvm: sudo usermod -aG kvm \"\$USER\"  (then log out and back in)."
  fi
fi
if [ -x "$PG_EMULATOR" ]; then
  if ACCEL="$("$PG_EMULATOR" -accel-check 2>&1)"; then
    # Output is "accel:" / status code / message / "accel". No empty alternative in the ERE: BSD grep (macOS)
    # rejects '(a|b|)' with "empty (sub)expression".
    ACCEL_MSG="$(printf '%s\n' "$ACCEL" | tr -d '\r' | grep -v -E '^[[:space:]]*(accel:?|[0-9]+)?[[:space:]]*$' | head -2 | tr '\n' ' ' || true)"
    info "${ACCEL_MSG:-Acceleration available (emulator -accel-check)}"
  else
    warn "Emulator acceleration check failed:"; printf '%s\n' "$ACCEL" | sed 's/^/      /' >&2
  fi
else
  note "emulator not installed yet (dry run?) — skipped."
fi

# ---------------------------------------------------------------------------
step "7/8 AVD '$AVD'"
AVD_HOME="$(pg_avd_home)"; AVD_DIR="$AVD_HOME/$AVD.avd"; CONFIG="$AVD_DIR/config.ini"
if pg_avd_exists "$AVD" && [ "$RECREATE" = 1 ]; then
  info "Deleting existing AVD (--recreate)"
  run "$AVDM" delete avd -n "$AVD"
fi
if pg_avd_exists "$AVD" && [ "$RECREATE" = 0 ]; then
  info "Exists: $AVD_DIR"
  CUR_SYSDIR="$(pg_get_ini "$CONFIG" image.sysdir.1)"
  case "$CUR_SYSDIR" in
    *"$SYSIMG_DIR_REL"*) ;;
    *) warn "AVD '$AVD' uses '$CUR_SYSDIR', expected '$SYSIMG_DIR_REL'. Use --recreate or --avd <other name>." ;;
  esac
else
  # Device profile: the Pleos image ships its own hardware profile ("Pleos Connect v2.1.0" under Automotive in
  # Android Studio) if its devices.xml exists; otherwise use Google's Automotive (1024p landscape) profile.
  DEVICE=""
  if [ "$FALLBACK" = 0 ] && [ -f "$SYSIMG_DIR/devices.xml" ]; then
    DEVICE="$(sed -n 's/.*<d:id>[[:space:]]*\([^<]*\)<\/d:id>.*/\1/p' "$SYSIMG_DIR/devices.xml" | head -1)"
  fi
  if [ "$FALLBACK" = 0 ] && [ -z "$DEVICE" ] && [ "$PG_DRY_RUN" = 0 ]; then
    DEVICE="$("$AVDM" list device -c 2>/dev/null | grep -i pleos | head -1 || true)"
  fi
  if [ -z "$DEVICE" ]; then
    DEVICE="automotive_1024p_landscape"
    if [ "$FALLBACK" = 0 ] && [ -d "$SYSIMG_DIR" ]; then
      warn "No Pleos hardware profile found in the image; using '$DEVICE'. Check the screen size later (docs/run-locally.md)."
    elif [ "$FALLBACK" = 0 ]; then
      note "[dry-run] after install, the image's devices.xml (Pleos hardware profile) is used if present, else '$DEVICE'"
    fi
  fi
  info "Creating with $SYSIMG, device '$DEVICE'"
  if [ "$PG_DRY_RUN" = 1 ]; then
    run "$AVDM" create avd -n "$AVD" -k "$SYSIMG" -d "$DEVICE"
  else
    echo no | "$AVDM" create avd -n "$AVD" -k "$SYSIMG" -d "$DEVICE" >/dev/null
  fi
fi
if [ "$PG_DRY_RUN" = 1 ] && [ ! -f "$CONFIG" ]; then
  note "[dry-run] would set in config.ini: hw.ramSize=4096 hw.keyboard=yes hw.gpu.enabled=yes hw.gpu.mode=auto fastboot.forceColdBoot=yes ${LCD:+hw.lcd=$LCD}"
else
  [ -f "$CONFIG" ] || die "AVD config not found: $CONFIG"
  run pg_set_ini "$CONFIG" hw.ramSize 4096          # Pleos docs: RAM 4 GB
  run pg_set_ini "$CONFIG" hw.keyboard yes          # type with the host keyboard
  run pg_set_ini "$CONFIG" hw.gpu.enabled yes
  [ -n "$(pg_get_ini "$CONFIG" hw.gpu.mode)" ] || run pg_set_ini "$CONFIG" hw.gpu.mode auto
  [ -n "$(pg_get_ini "$CONFIG" disk.dataPartition.size)" ] || run pg_set_ini "$CONFIG" disk.dataPartition.size 6G
  run pg_set_ini "$CONFIG" fastboot.forceColdBoot yes   # Pleos docs: cold boot (also when started from Android Studio)
  run pg_set_ini "$CONFIG" fastboot.forceFastBoot no
  if [ -n "$LCD" ]; then
    W="${LCD%%x*}"; REST="${LCD#*x}"; H="${REST%%@*}"; DPI="160"
    case "$REST" in *@*) DPI="${REST#*@}" ;; esac
    case "$W$H$DPI" in *[!0-9]*|'') die "--lcd must look like 1280x720@160" ;; esac
    run pg_set_ini "$CONFIG" hw.lcd.width "$W"
    run pg_set_ini "$CONFIG" hw.lcd.height "$H"
    run pg_set_ini "$CONFIG" hw.lcd.density "$DPI"
    run pg_set_ini "$CONFIG" hw.initialOrientation landscape
    run pg_set_ini "$CONFIG" skin.name "${W}x${H}"
    run pg_set_ini "$CONFIG" skin.path _no_skin
    run pg_set_ini "$CONFIG" showDeviceFrame no
    info "Screen: ${W}x${H} @ ${DPI} dpi"
  fi
  info "config.ini: RAM $(pg_get_ini "$CONFIG" hw.ramSize) MB, screen $(pg_get_ini "$CONFIG" hw.lcd.width)x$(pg_get_ini "$CONFIG" hw.lcd.height) @ $(pg_get_ini "$CONFIG" hw.lcd.density) dpi, cold boot"
fi

# ---------------------------------------------------------------------------
step "8/8 apps/vehicle/local.properties"
LP="$PG_VEHICLE_DIR/local.properties"
if [ -f "$LP" ] && grep -q '^[[:space:]]*sdk\.dir' "$LP"; then
  info "Exists (sdk.dir=$(pg_local_props_sdk))"
else
  if [ "$PG_DRY_RUN" = 1 ]; then note "[dry-run] would append sdk.dir=$PG_SDK to $LP"
  else printf 'sdk.dir=%s\n' "$PG_SDK" >> "$LP"; info "Wrote sdk.dir=$PG_SDK (gitignored)"; fi
fi

# ---------------------------------------------------------------------------
step "Done"
RUN_FLAGS=""
[ "$FALLBACK" = 1 ] && RUN_FLAGS=" --fallback"
[ -n "$AVD_ARG" ] && RUN_FLAGS="$RUN_FLAGS --avd $AVD"
if [ "$PG_DRY_RUN" = 1 ]; then info "Dry run: nothing was changed."; else info "AVD '$AVD' is ready ($SYSIMG)."; fi
cat <<EOF

    Next:
      apps/vehicle/scripts/run-app.sh$RUN_FLAGS
          build, cold-boot the emulator, install, launch, forward Virtual Console
      apps/vehicle/scripts/demo.sh main --speed 1.5
          replay demo (C-02 -> C-04 -> C-05)
      Virtual Console (Pleos image only): http://127.0.0.1:8088/

    Step-by-step guide (Korean): docs/run-locally.md
EOF
