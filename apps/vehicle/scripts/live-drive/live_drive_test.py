#!/usr/bin/env python3
"""
주차각 실차 주행 테스트 — 차를 실제로 굴려서 앱이 반응하는지 본다.

demo.sh 는 앱 안에서 녹화 신호를 재생한다(차는 P에 서 있음). 이 테스트는 Pleos Virtual Console(:8088)로
기어·차속·조향·브레이크를 10 Hz로 넣어 에뮬레이터의 차를 굴린다. 앱은 실차와 같은 경로로 받는다:
  Virtual Console → Pleos Vehicle SDK(기어·조향·브레이크) / AAOS PERF_VEHICLE_SPEED(차속) → LiveSignalSource → ParkingSession

신호와 기대값은 단위 테스트 LiveDriveScenarioTest 가 만든다 (app/build/live-drive/{case}.csv|json).
기대값 = 같은 신호를 앱과 같은 ParkingSession 에 넣은 결과. 기기 결과가 다르면 판단 로직이 아니라 신호 경로 문제.

케이스 (기본: 전부, 약 9분)
  main      판교 백화점 지하: 접근 → 나선 램프 2바퀴 → 후진 2번 → P      기대: 기록 → C-05 "B2", 후진 2회
  b3        지하 3층: 접근 → 나선 램프 3바퀴 → 후진 2번 → P               기대: 기록 → C-05 "B3", 후진 2회
  repark    P 20초 대기 → 옆 칸으로 옮겨 대기 (고속 구간 없음)              기대: 걸린 시간에 P 대기 제외
  parallel  노상 평행주차                                                    기대: C-05 "1F", 후진 1회
  leave     주차장 안을 돌다 후진 → 대지 않고 40 km/h로 나감                 기대: 기록 시작 → 취소 → 카드 없음
  jam       정체 구간 서다 가다 50초 → 길가에 P                              기대: 기록 안 됨 (오인 없음)

검사
  - 상태가 바뀌고 2.5초 뒤 화면 (uiautomator): 홈 / 주행 화면 / "주차 기록 중 · 후진 N · m:ss" / C-05 층·후진·시간
  - 후진(R) 중에는 후방카메라가 앱을 덮는 게 정상 → 카메라 화면인지 확인
  - 주차 후 자동 저장 → "맞아요" → 홈에 방금 위치
  - 신호 충실도: 앱이 실제로 받은 값(LiveSignal 로그) vs 보낸 값 (90% 이상 일치)

사용
  python3 apps/vehicle/scripts/live-drive/live_drive_test.py                 # 전부
  python3 apps/vehicle/scripts/live-drive/live_drive_test.py --cases main    # 하나만
  python3 apps/vehicle/scripts/live-drive/live_drive_test.py --dry-run       # 기기 없이 계획만
  python3 apps/vehicle/scripts/live-drive/live_drive_test.py --check         # 기기·콘솔 상태만 확인 (차를 움직이지 않음)

준비: Pleos 에뮬레이터 + 앱 설치(run-app.sh) + adb forward tcp:8088 tcp:8088.
Virtual Console 브라우저 탭은 닫거나 다른 탭으로 돌려 둘 것 — 화면에 떠 있으면 탭의 물리 시뮬레이션이 차속을 덮어쓴다(사전 점검에서 잡음).
결과: captures/live-drive-<시각>/report.md + 스크린샷 + livesignal.log
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

PKG = "com.parkinggack.app"
ACTIVITY = f"{PKG}/.ui.MainActivity"
VC = "http://127.0.0.1:8088"
CLIENT_ID = "parkinggack-live-drive-test"
GEAR_VC = {"P": "Park", "R": "Reverse", "N": "Neutral", "D": "Drive"}
GEAR_LOG = {"PARK": "P", "REVERSE": "R", "NEUTRAL": "N", "DRIVE": "D", "UNKNOWN": "U"}
CASE_ORDER = ["main", "repark", "parallel", "leave", "jam", "b3"]

SCRIPT_DIR = Path(__file__).resolve().parent
VEHICLE_DIR = SCRIPT_DIR.parent.parent
REPO_DIR = VEHICLE_DIR.parent.parent
EXPORT_DIR = VEHICLE_DIR / "app" / "build" / "live-drive"
EXPORT_TEST = "com.parkinggack.app.domain.sim.LiveDriveScenarioTest"

HOME_MARK = "최근 주차 위치"
REC_MARK = "주차 기록 중"
PARKED_MARK = "대셨나요"


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ---------------------------------------------------------------- 시나리오

class Row:
    __slots__ = ("t", "v", "steer", "gear", "brake")

    def __init__(self, t, v, steer, gear, brake):
        self.t, self.v, self.steer, self.gear, self.brake = t, v, steer, gear, brake


def export_scenarios():
    gradlew = VEHICLE_DIR / ("gradlew.bat" if os.name == "nt" else "gradlew")
    cmd = [str(gradlew), "-q", "--max-workers=2", "testDebugUnitTest", "--tests", EXPORT_TEST, "--rerun"]
    log("시나리오 내보내기 (LiveDriveScenarioTest)")
    r = subprocess.run(cmd, cwd=VEHICLE_DIR, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-3000:], r.stderr[-3000:], sep="\n")
        sys.exit("시나리오 내보내기 실패 — 위 Gradle 출력 참고 (Maven 429면 잠시 뒤 다시)")


def load_case(cid):
    meta = json.loads((EXPORT_DIR / f"{cid}.json").read_text(encoding="utf-8"))
    rows = []
    for line in (EXPORT_DIR / f"{cid}.csv").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        t, v, s, g, b = (line.split(",") + [""])[:5]
        rows.append(Row(int(t), float(v), float(s), g[0].upper(), b.strip() in ("1", "true")))
    t0 = rows[0].t
    for r in rows:
        r.t -= t0
    meta["rows"] = rows
    return meta


def segments(meta):
    """기대 타임라인을 (시작ms, 끝ms, 상태, 후진수) 구간으로"""
    segs = []
    for t, st, rc, _el in meta["timeline"]:
        if not segs or (segs[-1][2], segs[-1][3]) != (st, rc):
            segs.append([t, None, st, rc])
    for i, s in enumerate(segs):
        s[1] = segs[i + 1][0] if i + 1 < len(segs) else meta["durationMs"]
    return segs


def expected_at(meta, t_ms):
    pt = meta["timeline"][0]
    for p in meta["timeline"]:
        if p[0] <= t_ms:
            pt = p
        else:
            break
    return pt


def gear_at(meta, t_ms):
    g = meta["rows"][0].gear
    for r in meta["rows"]:
        if r.t <= t_ms:
            g = r.gear
        else:
            break
    return g


def plan_checks(meta):
    """(시각ms, 상태, 후진수) — 상태가 바뀌고 2.5초 뒤, 긴 구간은 15초마다. 다음 변화 1.5초 전까지만"""
    out = []
    for ts, te, st, rc in segments(meta):
        span = te - ts
        if st == "parked":
            out.append((ts + 2500, st, rc))
            continue
        if span < 4000:
            continue
        times = [ts + min(2500, span - 1500)]
        k = ts + 17500
        while st in ("driving", "recording") and k < te - 2500:
            times.append(k)
            k += 15000
        # R 중이면 후방카메라만 보이므로, 같은 구간에서 R이 끝나고 2초 뒤 화면도 본다 (배너의 후진 수 확인)
        for t in list(times):
            if gear_at(meta, t) == "R":
                back = next((r.t for r in meta["rows"] if t < r.t < te - 1500 and r.gear != "R"), None)
                if back is not None and back + 2000 < te - 1000 and all(abs(back + 2000 - x) > 1000 for x in times):
                    times.append(back + 2000)
        out += [(t, st, rc) for t in sorted(times)]
    return out


# ---------------------------------------------------------------- 기기

def find_adb():
    cands = [os.environ.get("ANDROID_HOME"), os.environ.get("ANDROID_SDK_ROOT")]
    lp = VEHICLE_DIR / "local.properties"
    if lp.exists():
        for line in lp.read_text().splitlines():
            if line.startswith("sdk.dir="):
                cands.append(line.split("=", 1)[1].replace("\\:", ":").replace("\\\\", "\\"))
    cands += [str(Path.home() / "Library/Android/sdk"), str(Path.home() / "Android/Sdk"),
              str(Path(os.environ.get("LOCALAPPDATA", "")) / "Android/Sdk")]
    for c in cands:
        if c:
            exe = Path(c) / "platform-tools" / ("adb.exe" if os.name == "nt" else "adb")
            if exe.exists():
                return str(exe)
    return "adb"


class Adb:
    def __init__(self, exe, serial):
        self.exe, self.serial = exe, serial

    def run(self, *args, timeout=25, binary=False):
        cmd = [self.exe] + (["-s", self.serial] if self.serial else []) + list(args)
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return b"" if binary else ""
        return r.stdout if binary else r.stdout.decode("utf-8", "replace")

    def sh(self, cmd, timeout=25):
        return self.run("shell", cmd, timeout=timeout)


def pick_serial(exe, wanted):
    if wanted:
        return wanted
    out = subprocess.run([exe, "devices"], capture_output=True, text=True).stdout
    devs = [l.split()[0] for l in out.splitlines()[1:] if l.strip().endswith("device")]
    emus = [d for d in devs if d.startswith("emulator-")]
    if not (emus or devs):
        sys.exit("adb 기기가 없음 — 에뮬레이터를 켜고 run-app.sh 로 앱을 설치할 것")
    return (emus or devs)[0]


NODE = re.compile(r'<node [^>]*?text="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?'
                  r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')


class Device:
    def __init__(self, adb, refocus=True):
        self.adb = adb
        self.lock = threading.Lock()  # uiautomator 는 한 번에 하나
        # False = 실제 화면 그대로 (--real-screen): 화면을 읽을 때 앱을 앞으로 끌어오지 않는다.
        # 끌어오면 Activity가 다시 STARTED가 되어 'P 뒤 C-05가 스스로 앞으로 오는지'를 덮는다 (docs/sim-findings.md 1-6·4-1)
        self.refocus = refocus

    def clock_offset(self):
        """기기 시계 − PC 시계 (초). 세 번 재서 왕복이 가장 짧은 것"""
        best = None
        for _ in range(3):
            h1 = time.time()
            out = self.adb.sh("echo $EPOCHREALTIME").strip()
            h2 = time.time()
            try:
                d = float(out)
            except ValueError:
                continue
            if best is None or h2 - h1 < best[0]:
                best = (h2 - h1, d - (h1 + h2) / 2)
        return best[1] if best else 0.0

    def front(self):
        """맨 앞 액티비티 'pkg/.Activity' (없으면 '')"""
        t = self.top_activity()
        return t.split(" ")[2] if t.count(" ") >= 2 else t

    def banner_shown(self):
        """내비 위 주차각 배너 창(NaviOverlay, title parkinggack-navi-banner)이 떠 있는지 — uiautomator 덤프엔 안 나온다"""
        return "parkinggack-navi-banner" in self.adb.sh("dumpsys window windows")

    def top_activity(self):
        for line in self.adb.sh("dumpsys activity activities").splitlines():
            if "topResumedActivity=" in line:
                return line.split("=", 1)[1].strip()
        return ""

    def bring_front(self):
        self.adb.sh(f"am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n {ACTIVITY}")
        time.sleep(1.2)

    def _dump(self):
        for _ in range(3):
            out = self.adb.sh("uiautomator dump /sdcard/pg_live_ui.xml", timeout=30)
            if "dumped" in out:
                return self.adb.run("exec-out", "cat", "/sdcard/pg_live_ui.xml", timeout=15)
            time.sleep(0.4)
        return ""

    def screen(self, refocus=None):
        """앱 창의 (text, x, y) 목록. 후방카메라가 덮고 있으면 (None, top)"""
        if refocus is None:
            refocus = self.refocus
        with self.lock:
            xml = self._dump()
            if PKG not in xml:
                top = self.top_activity()
                if "evs" in top.lower():
                    return None, top
                if refocus:  # Pleos 왼쪽 주행 패널이 포커스를 가져가면 그 창만 덤프됨 → 앱을 앞으로(상태 그대로)
                    self.bring_front()
                    xml = self._dump()
            nodes = []
            if PKG in xml:
                for t, d, a, b, c, e in NODE.findall(xml):
                    label = html.unescape(t or d).replace("\n", " ")
                    if label:
                        nodes.append((label, (int(a) + int(c)) // 2, (int(b) + int(e)) // 2))
            return nodes, ""

    def tap(self, label):
        nodes, _ = self.screen()
        if not nodes:
            return False
        hit = [n for n in nodes if n[0] == label] or [n for n in nodes if label in n[0]]
        if not hit:
            return False
        self.adb.sh(f"input tap {hit[0][1]} {hit[0][2]}")
        return True

    def shot(self, path):
        data = self.adb.run("exec-out", "screencap", "-p", binary=True, timeout=20)
        if data:
            Path(path).write_bytes(data)


# ---------------------------------------------------------------- Virtual Console

class Console:
    def __init__(self):
        self.errors = 0
        self.writes = 0
        self._hb = None
        self._hb_on = False

    def _req(self, method, path, timeout=3):
        req = urllib.request.Request(VC + path, method=method, data=b"" if method in ("PUT", "POST") else None)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except Exception as e:  # 연결 실패
            return 0, str(e).encode()

    def state(self):
        code, body = self._req("GET", "/vehicle/state")
        return json.loads(body) if code == 200 else None

    def heartbeat(self):
        self._req("POST", f"/browser/session?client={CLIENT_ID}", timeout=2)

    def start_heartbeat(self):
        # 브라우저 탭이 하나도 없으면 콘솔이 에뮬레이터 연결을 내림(503 emulator_inactive) → 탭처럼 1초마다 신호
        self._hb_on = True

        def loop():
            while self._hb_on:
                self.heartbeat()
                time.sleep(1.0)
        self._hb = threading.Thread(target=loop, daemon=True)
        self._hb.start()

    def stop_heartbeat(self):
        self._hb_on = False

    int_only = False  # 콘솔이 소수를 거부하면 정수로 (사전 점검에서 정함)

    def controls(self, speed_kph, steer_deg, brake_pct=0, accel_pct=0):
        """차속·조향과 함께 페달도 넣는다 (엑셀 %, 브레이크 %). 탭이 없으면 콘솔은 차속을 그대로 쓰고 페달은 표시·신호로만"""
        if self.int_only:
            q = f"speed={round(speed_kph)}&accelerator={round(accel_pct)}&brake={round(brake_pct)}&steering={round(steer_deg)}"
        else:
            q = f"speed={speed_kph:.1f}&accelerator={accel_pct:.0f}&brake={brake_pct:.0f}&steering={steer_deg:.1f}"
        code, _ = self._req("PUT", f"/vehicle/controls?{q}")
        self.writes += 1
        if code != 200:
            self.errors += 1
        return code

    def gear(self, g, tries=20):
        code = 0
        for _ in range(tries):
            code, _ = self._req("PUT", f"/vehicle/gear?gear={GEAR_VC[g]}")
            if code == 200:
                return True
            self.heartbeat()
            time.sleep(0.25)
        log(f"  !! 기어 {g} 쓰기 실패 (HTTP {code})")
        return False

    def park(self):
        self.controls(0, 0, 50)
        self.gear("P")
        self.controls(0, 0, 0)


def pedals(r, prev):
    """사람처럼 페달 밟기: 속도를 올리는 동안 엑셀(가속도만큼 더), 일정 속도는 살짝, 줄일 때·정지 신호는 브레이크 (%)"""
    if r.brake:
        return 0, 30
    if prev is None or r.t <= prev.t:
        return (4 + 0.5 * r.v * 3.6) if r.v > 0.05 else 0, 0
    a = (r.v - prev.v) / ((r.t - prev.t) / 1000)  # m/s²
    if a < -0.3:
        return 0, min(40, 20 * -a)
    if r.v <= 0.05 and a <= 0:
        return 0, 0
    return min(80, 4 + 0.5 * r.v * 3.6 + 25 * max(0.0, a)), 0


# ---------------------------------------------------------------- 검사

REC_RE = re.compile(r"후진\s*(\d+)\s*·\s*(\d+):(\d\d)")
PARK_FLOOR_RE = re.compile(r"(B\d+|\d+F)에 대셨나요")
PARK_SUM_RE = re.compile(r"후진\s*(\d+)회\s*(?:·\s*(?:(\d+)분\s*)?(\d+)초)?")


def fmt_sec(s):
    return f"{s // 60}:{s % 60:02d}"


def short(text, n=140):
    t = " | ".join(x for x in text.split("\n") if x.strip())
    return t if len(t) <= n else t[:n] + "…"


def evaluate(meta, st, rc, nodes, t_from, t_to):
    """(ok, 기대, 관찰). t_from~t_to = 화면을 읽은 시간 범위(케이스 시작 기준 ms)"""
    text = "\n".join(n[0] for n in nodes)
    if st == "idle":
        ok = (HOME_MARK in text) and REC_MARK not in text and PARKED_MARK not in text
        return ok, "홈 C-01 (기록·주차 카드 없음)", short(text)
    if st == "driving":
        # 앱 글자를 하나도 못 읽었으면 통과가 아니다 (예전엔 '' 에 REC_MARK 가 없으니 PASS, docs/sim-findings.md 4-2)
        ok = bool(text.strip()) and REC_MARK not in text and HOME_MARK not in text and PARKED_MARK not in text
        return ok, "주행 화면 C-04 (기록 아님)", short(text) or "(앱 글자 없음)"
    if st == "recording":
        lo = expected_at(meta, t_from)[3] - 2
        hi = expected_at(meta, t_to)[3] + 2
        m = REC_RE.search(text)
        ok = REC_MARK in text and m is not None and int(m.group(1)) == rc and lo <= int(m.group(2)) * 60 + int(m.group(3)) <= hi
        obs = f"{REC_MARK if REC_MARK in text else '(배너 없음)'} · 후진 {m.group(1)} · {m.group(2)}:{m.group(3)}" if m else short(text)
        return ok, f"주차 기록 중 · 후진 {rc} · {fmt_sec(max(lo, 0))}~{fmt_sec(hi)}", obs
    if st == "parked":
        p = meta["expect"]["parked"]
        fm = PARK_FLOOR_RE.search(text)
        sm = PARK_SUM_RE.search(text)
        floor = fm.group(1) if fm else ("(층 선택 요청)" if "몇 층" in text else None)
        rev = int(sm.group(1)) if sm else None
        dur = (int(sm.group(2) or 0) * 60 + int(sm.group(3))) if sm and sm.group(3) else None
        floor_ok = (floor == p["floor"]) if p["confidence"] != "LOW" else floor == "(층 선택 요청)"
        ok = floor_ok and rev == p["reverseCount"] and dur is not None and abs(dur - p["durationSec"]) <= 3
        exp = f"C-05 {p['floor'] if p['confidence'] != 'LOW' else '층 선택 요청'} · 후진 {p['reverseCount']}회 · {p['durationSec']}초(±3)"
        return ok, exp, f"C-05 {floor} · 후진 {rev}회 · {dur}초"
    return False, st, short(text)


# ---------------------------------------------------------------- 신호 충실도

LOG_RE = re.compile(r"^\s*(\d+\.\d+)\s+\d+\s+\d+\s+D\s+LiveSignal\s*:\s*v=([\d.]+)\s+raw=[\d.]+\s+speedAge=(-?\d+)ms\s+"
                    r"gear=(\w+)\s+brake=\w+\s+steer=(-?[\d.]+)")


def fidelity(log_path, sent, t_start, t_end, clock_offset=0.0):
    """앱이 받은 값(1초에 한 줄) 중, 직전 0.7초 안에 보낸 값과 맞는 비율.
    clock_offset = 기기 시계 − PC 시계(초). 로그 시각은 기기 시계라 빼서 맞춘다 — 에뮬레이터를 막 켜면 1.5초쯤 어긋나
    값이 바뀌는 구간이 모두 '불일치'가 됐다 (2026-11-05 재부팅 뒤 60%, 보정하면 원래대로)"""
    if not Path(log_path).exists():
        return None
    lines = []
    for line in Path(log_path).read_text(encoding="utf-8", errors="replace").splitlines():
        m = LOG_RE.match(line)
        if m:
            t = float(m.group(1)) - clock_offset
            if t_start + 1.0 <= t <= t_end:
                lines.append((t, float(m.group(2)), int(m.group(3)), GEAR_LOG.get(m.group(4), "?"), float(m.group(5))))
    if not lines:
        return {"lines": 0}
    ok = 0
    worst = 0.0
    j = 0
    for t, v, age, g, s in lines:
        while j < len(sent) and sent[j][0] < t - 0.7:
            j += 1
        k = j
        best = None
        while k < len(sent) and sent[k][0] <= t + 0.05:
            _, sv, ss, sg = sent[k]
            d = max(abs(v - sv) / 0.35, abs(s - ss) / 3.0)
            if sg == g and (best is None or d < best):
                best = d
            k += 1
        if best is not None and best <= 1.0:
            ok += 1
        worst = max(worst, age)
    return {"lines": len(lines), "match": ok, "ratio": ok / len(lines), "maxSpeedAgeMs": worst}


# ---------------------------------------------------------------- 실행

class Runner:
    def __init__(self, dev, con, out, steer_k):
        self.dev, self.con, self.out, self.k = dev, con, out, steer_k
        self.results = []
        self.clock_offset = dev.clock_offset()
        if abs(self.clock_offset) > 0.2:
            log(f"  · 기기 시계가 PC보다 {self.clock_offset:+.2f}초 — 신호 충실도 계산에서 보정")

    def ensure_home(self):
        for _ in range(4):
            nodes, _ = self.dev.screen()
            text = "\n".join(n[0] for n in (nodes or []))
            if HOME_MARK in text and PARKED_MARK not in text:
                return True
            if PARKED_MARK in text and self.dev.tap("맞아요"):
                time.sleep(1.5)
                continue
            self.dev.adb.sh("input keyevent KEYCODE_BACK")
            time.sleep(1.0)
        return False

    def real_screen_check(self, meta, st, rc, t_ms, t_start, shot):
        """--real-screen: 앱을 끌어오지 않고 사용자가 보는 그대로 검사.
        주행·기록 = Pleos 내비가 앞 + 주차각 배너 창 / P 뒤 = 주차각이 스스로 앞으로 와서 C-05"""
        front = self.dev.front()
        if st in ("driving", "recording"):
            banner = self.dev.banner_shown()
            self.dev.shot(shot)
            navi = "navigation" in front
            if st == "driving":
                ok = navi or PKG in front  # 오버레이 권한이 없으면 앱 안 C-04
                return (t_ms, st, ok, "주행: 내비가 앞 (또는 앱 안 C-04)", f"{front}{' + 배너' if banner else ''}", shot.name)
            ok = (navi and banner) or PKG in front
            return (t_ms, st, ok, f"기록 중: 내비 + '주차 기록 중' 배너 (후진 {rc} — 배너 글자는 덤프에 없음)", f"{front}{' + 배너' if banner else ' (배너 없음)'}", shot.name)
        # parked: P 뒤 몇 초 안에 주차각이 앞으로 와야 한다 — 끌어오지 않고 기다린다
        deadline = time.time() + 6.0
        while PKG not in front and time.time() < deadline:
            time.sleep(0.5)
            front = self.dev.front()
        if PKG not in front:
            self.dev.shot(shot)
            return (t_ms, st, False, "P 뒤 주차각이 스스로 앞으로 (C-05)", f"맨 앞 = {front}", shot.name)
        nodes, _ = self.dev.screen(refocus=False)
        t_to = (time.time() - t_start) * 1000
        self.dev.shot(shot)
        ok, exp, obs = evaluate(meta, st, rc, nodes or [], t_ms, t_to)
        return (t_ms, st, ok, f"{exp} — 스스로 앞으로", obs, shot.name)

    def run_case(self, meta, log_path):
        cid = meta["id"]
        rows = meta["rows"]
        checks = plan_checks(meta)
        res = {"id": cid, "title": meta["title"], "checks": [], "fidelity": None}
        log(f"=== {cid}: {meta['title']} ({meta['durationMs'] / 1000:.0f}초)")
        self.con.park()
        if not self.ensure_home():
            log("  !! 홈 화면으로 못 돌아옴 — 그대로 진행")
        time.sleep(1.0)

        sent = []
        stop = threading.Event()
        t_start = time.time()

        def checker():
            for (t_ms, st, rc) in checks:
                wait = t_start + t_ms / 1000 - time.time()
                if wait > 0 and stop.wait(wait):
                    return
                idx = len(res["checks"]) + 1
                shot = self.out / f"{cid}-{idx:02d}-{st}.png"
                t_from = (time.time() - t_start) * 1000
                if gear_at(meta, t_ms) == "R":
                    top = self.dev.top_activity()
                    ok = "evs" in top.lower() or "camera" in top.lower()
                    self.dev.shot(shot)
                    item = (t_ms, st, ok, "후진 중 → 후방카메라가 앱을 덮음 (기록은 다음 검사에서)", top.split(" ")[2] if top.count(" ") >= 2 else top, shot.name)
                elif not self.dev.refocus and st in ("driving", "recording", "parked"):
                    item = self.real_screen_check(meta, st, rc, t_ms, t_start, shot)
                else:
                    nodes, top = self.dev.screen()
                    t_to = (time.time() - t_start) * 1000
                    self.dev.shot(shot)
                    if nodes is None:
                        item = (t_ms, st, False, f"앱 화면 ({st})", f"가려짐: {top}", shot.name)
                    else:
                        ok, exp, obs = evaluate(meta, st, rc, nodes, t_from, t_to)
                        # 화면 읽기가 길어(수 초) 그사이 상태가 바뀌었으면, 읽기를 마친 시점의 기대 상태로도 본다
                        _, st2, rc2, _ = expected_at(meta, t_to)
                        if not ok and (st2, rc2) != (st, rc) and gear_at(meta, t_to) != "R":
                            ok2, exp2, obs2 = evaluate(meta, st2, rc2, nodes, t_from, t_to)
                            if ok2:
                                ok, exp, obs = True, f"{exp2} (읽는 동안 {st}→{st2})", obs2
                        item = (t_ms, st, ok, exp, obs, shot.name)
                res["checks"].append(item)
                log(f"  {'PASS' if item[2] else 'FAIL'} {item[0] / 1000:5.1f}s {item[3]}  ←  {item[4]}")

        th = threading.Thread(target=checker, daemon=True)
        th.start()

        # 10 Hz 스트리밍: 지금 시각까지 온 마지막 줄을 보냄 (늦으면 건너뛰고 따라잡음)
        cur_gear = None
        prev_row = None
        i, n = 0, len(rows)
        last_mark = None
        marks = sorted(meta.get("marks", {}).items(), key=lambda kv: kv[1])
        try:
            while i < n:
                now = (time.time() - t_start) * 1000
                if rows[i].t > now:
                    time.sleep(min(0.05, (rows[i].t - now) / 1000))
                    continue
                j = i
                while j + 1 < n and rows[j + 1].t <= now:
                    j += 1
                r = rows[j]
                if r.gear != cur_gear and r.gear in GEAR_VC:
                    if cur_gear is not None and r.gear != cur_gear:
                        log(f"  기어 {cur_gear} → {r.gear}  ({r.t / 1000:.1f}s)")
                    self.con.gear(r.gear)
                    cur_gear = r.gear
                accel, brake = pedals(r, prev_row)
                self.con.controls(r.v * 3.6, r.steer / self.k, brake, accel)
                prev_row = r
                sent.append((time.time(), r.v, r.steer, r.gear))
                for name, mt in marks:
                    if mt <= r.t and (last_mark is None or mt > last_mark[1]):
                        last_mark = (name, mt)
                        log(f"  · {name} ({mt / 1000:.1f}s, {r.v * 3.6:.0f} km/h)")
                i = j + 1
        finally:
            t_end = time.time()

        th.join(timeout=max(0, checks[-1][0] / 1000 - (t_end - t_start)) + 40 if checks else 1)
        stop.set()

        # 주차 후: 자동 저장 → 맞아요 → 홈에 방금 위치 / 주차 없음: 홈 그대로
        p = meta["expect"]["parked"]
        if p:
            nodes, _ = self.dev.screen()
            text = "\n".join(x[0] for x in (nodes or []))
            low_on_screen = "몇 층" in text  # 기기가 LOW로 판단했으면 자동 저장은 8초 뒤
            wait_until = t_start + p["atMs"] / 1000 + (9.5 if p["confidence"] == "LOW" or low_on_screen else 4.5)
            time.sleep(max(0, wait_until - time.time()))
            nodes, _ = self.dev.screen()
            text = "\n".join(x[0] for x in (nodes or []))
            ok = "저장했어요" in text
            res["checks"].append(("after", "saved", ok, "자동 저장 (\"…저장했어요\")", short(text, 80), ""))
            log(f"  {'PASS' if ok else 'FAIL'} 자동 저장 (\"…저장했어요\")")
            if self.dev.tap("맞아요"):
                time.sleep(1.8)
            self.ensure_home()
            nodes, _ = self.dev.screen()
            text = "\n".join(x[0] for x in (nodes or []))
            shot = self.out / f"{cid}-home.png"
            self.dev.shot(shot)
            want = p["floor"] if p["confidence"] != "LOW" else None
            labels = [x[0] for x in (nodes or [])]
            shown = labels[labels.index(HOME_MARK) + 1] if HOME_MARK in labels and labels.index(HOME_MARK) + 1 < len(labels) else None
            ok = shown is not None and (want is None or shown.split(" ")[0] == want)
            res["checks"].append(("after", "home", ok, f"홈 '최근 주차 위치' = {want or '(층 없음)'}", f"{shown}", shot.name))
            log(f"  {'PASS' if ok else 'FAIL'} 홈 '최근 주차 위치' = {want or '(층 없음)'}  ←  {shown}")
        else:
            time.sleep(3.0)
            nodes, _ = self.dev.screen()
            text = "\n".join(x[0] for x in (nodes or []))
            shot = self.out / f"{cid}-end.png"
            self.dev.shot(shot)
            ok = HOME_MARK in text and PARKED_MARK not in text and REC_MARK not in text
            res["checks"].append(("after", "no-card", ok, "P 후 주차 카드 없이 홈", short(text, 100), shot.name))
            log(f"  {'PASS' if ok else 'FAIL'} P 후 주차 카드 없이 홈")

        res["fidelity"] = fidelity(log_path, sent, t_start, t_end, self.clock_offset)
        res["writeErrors"] = self.con.errors
        f = res["fidelity"] or {}
        if f.get("lines"):
            log(f"  신호 충실도 {f['match']}/{f['lines']} ({f['ratio']:.0%}), 차속 최대 지연 {f['maxSpeedAgeMs']} ms")
        else:
            log("  신호 충실도: LiveSignal 로그 없음 (setprop log.tag.LiveSignal DEBUG 가 안 먹었거나 예전 APK)")
        self.results.append(res)
        self.con.errors = 0


def preflight(dev, con, write):
    """(ok, steer_k, notes). write=False 면 차를 움직이지 않고 읽기만"""
    notes, ok = [], True

    def note(good, msg):
        nonlocal ok
        ok &= good
        notes.append(("✓" if good else "✗") + " " + msg)
        log(("  ✓ " if good else "  ✗ ") + msg)

    adb = dev.adb
    note(adb.sh("getprop sys.boot_completed").strip() == "1", f"기기 {adb.serial} 부팅 완료")
    note(f"package:{PKG}" in adb.sh(f"pm list packages {PKG}"), "앱 설치됨")
    user = adb.sh("am get-current-user").strip() or "0"
    perm = adb.sh(f"dumpsys package {PKG}")
    blk = perm.split(f"User {user}:")
    granted = len(blk) > 1 and "android.car.permission.CAR_SPEED: granted=true" in blk[1].split("User ")[0]
    note(granted, f"차속 권한 CAR_SPEED (user {user}) — 없으면 demo.sh live-speed on")
    st = con.state()
    note(st is not None, "Virtual Console 응답 (127.0.0.1:8088) — 없으면 adb forward tcp:8088 tcp:8088")
    if st is None:
        return False, -1.0, notes
    if not write:
        # 브라우저 탭이 없으면 콘솔이 에뮬레이터 연결을 내려 두므로(actual=null) 탭처럼 한 번 알리고 다시 읽는다
        con.heartbeat()
        time.sleep(1.0)
        st = con.state() or st
        g = ((st.get("gear") or {}).get("actual") or {}).get("value")
        c = st.get("controls", {})
        log(f"  현재 기어 {g}, 차속 {c.get('speed_kph')} km/h, 조향 {c.get('steering_deg')}, 콘솔 활성 {c.get('emulator_active')}")
        return ok, -1.0, notes

    con.start_heartbeat()
    t = time.time()
    while time.time() - t < 6:
        s = con.state() or {}
        if s.get("controls", {}).get("emulator_active"):
            break
        time.sleep(0.5)
    note(bool((con.state() or {}).get("controls", {}).get("emulator_active")), "콘솔 → 에뮬레이터 연결 활성")

    # 소수 차속을 받는지 (안 받으면 정수로 보냄 — 1 km/h 단위면 충분)
    con.gear("N")
    if con.controls(5.5, 0, 0) != 200:
        con.int_only = True
        notes.append("! 콘솔이 소수 값을 거부 → 차속·조향을 정수로 보냄")
    con.errors = 0
    # 브라우저 탭 물리 시뮬레이션 간섭: N에서 5 km/h를 넣고 그대로 유지되는지 (탭이 떠 있으면 감속해 버림)
    con.controls(5, 0, 0)
    vals = []
    for _ in range(8):
        time.sleep(0.25)
        vals.append(float((con.state() or {}).get("controls", {}).get("speed_kph", -1)))
    con.controls(0, 0, 0)
    con.gear("P")
    note(all(abs(v - 5) <= 0.6 for v in vals),
         f"보낸 차속이 유지됨 {vals} — 아니면 Virtual Console 브라우저 탭을 닫거나 다른 탭으로 돌릴 것")

    # LiveSignal 로그 + 조향 부호: 콘솔 -100° → 앱이 받는 값
    adb.sh("setprop log.tag.LiveSignal DEBUG")
    con.controls(0, -100, 0)
    time.sleep(2.2)
    # -T N 은 필터 전 전체 로그의 마지막 N줄이라 Pleos SDK 로그에 묻힘 → 필터만 걸고 끝 줄을 쓴다
    out = adb.run("logcat", "-d", "-v", "epoch", "-s", "LiveSignal:D", timeout=15)
    con.controls(0, 0, 0)
    got = [float(m.group(5)) for m in (LOG_RE.match(l) for l in out.splitlines()) if m]
    k = -1.0
    if got:
        k = got[-1] / -100.0
        note(abs(abs(k) - 1) < 0.05, f"앱이 받는 조향: 콘솔 -100° → 앱 {got[-1]:+.0f}° (배율 {k:+.2f})")
        if k > 0:
            notes.append("! 콘솔 왼쪽(-)이 앱에서도 -(오른쪽)로 들어옴 → LiveSignalSource.STEERING_SIGN 확인 필요")
    else:
        notes.append("! LiveSignal 로그 없음 → 조향 배율 -1(이 이미지에서 확인된 값)로 가정, 신호 충실도 검사 생략")
        log("  ! LiveSignal 로그 없음 — 조향 배율 -1 가정")
    return ok, k, notes


def write_report(out, runner, pre_notes, args):
    lines = [f"# 실차 주행 테스트 — {time.strftime('%Y-%m-%d %H:%M')}", "",
             f"케이스: {', '.join(args.cases)}", "", "## 사전 점검", ""] + [f"- {n}" for n in pre_notes] + ["", "## 요약", "",
             "| 케이스 | 화면 검사 | 신호 충실도 | 결과 |", "|---|---|---|---|"]
    all_ok = True
    for r in runner.results:
        passed = sum(1 for c in r["checks"] if c[2])
        f = r["fidelity"] or {}
        fid_ok = f.get("lines", 0) == 0 or f.get("ratio", 0) >= 0.9
        ok = passed == len(r["checks"]) and fid_ok
        all_ok &= ok
        fid = f"{f['match']}/{f['lines']} ({f['ratio']:.0%})" if f.get("lines") else "로그 없음"
        lines.append(f"| {r['id']} | {passed}/{len(r['checks'])} | {fid} | {'PASS' if ok else '**FAIL**'} |")
    for r in runner.results:
        lines += ["", f"## {r['id']} — {r['title']}", "", "| 시각 | 기대 상태 | 결과 | 기대 | 관찰 | 스크린샷 |", "|---|---|---|---|---|---|"]
        for t, st, ok, exp, obs, shot in r["checks"]:
            ts = f"{t / 1000:.1f}s" if isinstance(t, (int, float)) else t
            lines.append(f"| {ts} | {st} | {'PASS' if ok else '**FAIL**'} | {exp} | {obs.replace('|', '/')} | {shot} |")
    (out / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return all_ok


def main():
    ap = argparse.ArgumentParser(description="주차각 실차 주행 테스트 (Virtual Console로 차를 굴림)")
    ap.add_argument("--cases", default=",".join(CASE_ORDER), help=f"쉼표로 구분 ({', '.join(CASE_ORDER)})")
    ap.add_argument("--serial", help="adb serial (기본: 실행 중인 에뮬레이터)")
    ap.add_argument("--out", help="결과 폴더 (기본: captures/live-drive-<시각>)")
    ap.add_argument("--no-export", action="store_true", help="Gradle로 시나리오를 다시 만들지 않음")
    ap.add_argument("--no-restart", action="store_true", help="시작할 때 앱을 다시 띄우지 않음")
    ap.add_argument("--dry-run", action="store_true", help="기기 없이 계획(타임라인·검사 시각)만 출력")
    ap.add_argument("--check", action="store_true", help="기기·콘솔 상태만 읽기 (차를 움직이지 않음)")
    ap.add_argument("--real-screen", action="store_true",
                    help="화면을 읽을 때 앱을 앞으로 끌어오지 않음 — 주행 중 내비+배너, P 뒤 C-05가 스스로 앞으로 오는지 (오버레이 권한 필요)")
    args = ap.parse_args()
    args.cases = [c.strip() for c in args.cases.split(",") if c.strip()]
    bad = [c for c in args.cases if c not in CASE_ORDER]
    if bad:
        sys.exit(f"모르는 케이스: {bad} (가능: {CASE_ORDER})")

    have = all((EXPORT_DIR / f"{c}.json").exists() for c in args.cases)
    if not args.no_export or not have:
        try:
            export_scenarios()
        except SystemExit:
            if not have:
                raise
            log("  ! 내보내기 실패 — 전에 만든 시나리오 파일로 진행")
    metas = [load_case(c) for c in args.cases]

    if args.dry_run:
        total = 0
        for m in metas:
            total += m["durationMs"]
            p = m["expect"]["parked"]
            print(f"\n{m['id']} — {m['title']} ({m['durationMs'] / 1000:.0f}초, 최고 {max(r.v for r in m['rows']) * 3.6:.0f} km/h, "
                  f"조향 최대 {max(abs(r.steer) for r in m['rows']):.0f}°)")
            print("  기대: " + " → ".join(f"{s[2]}{'/' + str(s[3]) if s[3] else ''}@{s[0] / 1000:.1f}s" for s in segments(m)))
            print("  결과: " + (f"C-05 {p['floor']}({p['confidence']}) 후진 {p['reverseCount']}회 {p['durationSec']}초" if p else "주차 카드 없음"))
            for t, st, rc in plan_checks(m):
                tag = "후방카메라" if gear_at(m, t) == "R" else st
                print(f"    검사 {t / 1000:6.1f}s  {tag}{' 후진 ' + str(rc) if st == 'recording' else ''}")
        print(f"\n주행 시간 합계 {total / 1000 / 60:.1f}분 (+ 케이스마다 준비·저장 확인 약 15초)")
        return 0

    adb = Adb(find_adb(), None)
    adb.serial = pick_serial(adb.exe, args.serial)
    dev, con = Device(adb, refocus=not args.real_screen), Console()
    log(f"사전 점검 ({adb.serial})")
    ok, k, notes = preflight(dev, con, write=not args.check)
    if args.check:
        return 0 if ok else 1
    if not ok:
        con.stop_heartbeat()
        log("사전 점검 실패 — 위 ✗ 항목을 해결하고 다시 실행")
        return 2

    out = Path(args.out) if args.out else REPO_DIR / "captures" / f"live-drive-{time.strftime('%Y%m%d-%H%M%S')}"
    out.mkdir(parents=True, exist_ok=True)
    log_path = out / "livesignal.log"
    logcat = subprocess.Popen([adb.exe, "-s", adb.serial, "logcat", "-v", "epoch", "-T", "1", "-s", "LiveSignal:D"],
                              stdout=open(log_path, "w", encoding="utf-8"), stderr=subprocess.DEVNULL)
    runner = Runner(dev, con, out, k)
    try:
        if not args.no_restart:  # 진행 중인 시연 재생·세션 상태를 지우고 Live 신호로 시작
            adb.sh(f"am force-stop {PKG}")
            con.park()
            dev.bring_front()
            time.sleep(3.0)
        for m in metas:
            runner.run_case(m, log_path)
            time.sleep(2.0)
    except KeyboardInterrupt:
        log("중단됨")
    finally:
        con.park()
        con.stop_heartbeat()
        time.sleep(1.0)
        logcat.terminate()
    all_ok = write_report(out, runner, notes, args)
    log(f"결과: {'PASS' if all_ok else 'FAIL'} — {out / 'report.md'}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
