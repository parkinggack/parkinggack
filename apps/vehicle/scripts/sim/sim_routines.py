#!/usr/bin/env python3
"""
주차각 시뮬레이션 루틴 14가지 — 에뮬레이터에서 앱이 혼자 굴러가는 걸 눈으로 보며 확인하는 UI 흐름 테스트.

앱 안의 시연 재생(합성 주행 신호, ScenarioGenerator)으로 차를 '운전'시키고, 화면 글자를 읽어(uiautomator)
버튼을 누르고, 단계마다 기대한 글자가 떴는지 검사하고 스크린샷을 남긴다. 차(Virtual Console)는 건드리지 않는다.
  → 신호 경로(Pleos SDK·차속)까지 보는 실차 주행 테스트는 live-drive/live_drive_test.py

루틴 (화면 ID는 docs/product/plan.md 6장)
  1  첫 실행 → 백화점 지하 B2        C-11 온보딩 → C-01 빈 홈 → C-02 ★4.3 → C-04 기록 중 → C-05 "B2" 후진 2회 → C-01
  2  더 쉬운 곳으로 경유 (평행주차)   C-02 → C-03 경유지로 안내 → C-04 경유지 배너 → C-05 1F 후진 1회 → C-01
  3  구역 저장 → 폰으로 (평면 주차장) C-05 → C-06 층·구역·기둥 → C-07 QR·위치 링크(시연 기록은 서버에 안 씀) → C-01에 구역
  4  내 동선 다시 보기 (사선주차)     C-05 → C-12 동선 그림·사선주차·후진 0회 → 다시 보기 → 닫기 → 맞아요
  5  층을 모를 때 (반 층 주차장)      C-05 "몇 층에 대셨나요?" → 손대지 않으면 층 없이 저장 → C-09 → C-13 주차왕
  6  카드 끄기 설정 · 기록 지우기      C-10 카드 끄기 → C-02·C-05 없이 주행 → P에서 바로 저장 → 기록 모두 지우기
  7  기록·주차장 상세                  C-09 기록 → C-12 → C-01 자주 가는 곳 → C-08 → 별점 시트 열고 닫기
  8  주행 중 앱 내렸다 다시 열기       C-04 기록 중 → 홈 키 → 다시 열기 → C-05까지 이어짐
  9  연속 두 번 주차 · 층 고치기        두 번째 C-05 다른 층이에요 → C-06 B3 → C-09 2번 · 장소 이름
  10 지하에서 신호 끊김 (오프라인)     서버 차단(프록시) → C-02 기기 데이터 → C-05 → C-07 긴 링크 → C-13 안내 → 복구
  11 주차왕 참여 (운영 서버에 씀)      C-13 참여 → 등수 → 서버 joined 확인 → 끝나면 서버에서 참여 취소
  12 별점 보내기 (운영 서버에 씀)      C-08 별점 ★4 → C-08 점수·근거가 그대로인지
  13 폰 연결 (운영 서버에 씀)          C-10 코드 → 스크립트가 폰 역할로 claim → 연결됨 → 폰에 시연 기록 0건
  14 예시 기록으로 첫 실행             앱 데이터만 지우고 예시 허용 → 온보딩 → C-01 채워짐 → C-09 13건 → C-12

예시 기록: 앱은 첫 실행 때 예시 기록 13건(DemoSeed)을 넣는다. 루틴 1~13은 앱 데이터를 지운 직후 run-as 로
           shared_prefs/demo.xml(seeded=true)을 먼저 써서 빈 상태로 시작하고, 14번만 예시를 넣은 채 시작한다

자동 점검: 화면을 읽을 때마다 카피 금지어 · 터치 64dp · 주행 중 터치 · 이름 없는 버튼 · 14sp 미만 글자(추정)를
           검사해 보고서 '자동 점검 발견 사항'과 findings.json 에 모은다 (루틴 통과/실패와 별개)

사용 (레포 루트에서)
  apps/vehicle/scripts/sim.sh list
  apps/vehicle/scripts/sim.sh 1             하나
  apps/vehicle/scripts/sim.sh 2 4           여러 개
  apps/vehicle/scripts/sim.sh all           열네 개 전부 (×2 배속 약 23분)
  Windows: python apps\\vehicle\\scripts\\sim\\sim_routines.py all
옵션
  --speed X      주행 재생 배속 0.25~8 (기본 2). 1이면 실제 속도
  --pause S      검사 하나 통과할 때마다 멈춰 보는 시간 (기본 1초)
  --step         단계마다 Enter를 눌러야 다음으로 (천천히 보기)
  --keep-data    루틴 시작 전에 앱 데이터를 지우지 않음 (1번은 온보딩을 보려고 항상 지움)
  --record       루틴마다 화면 녹화(mp4, 최대 3분)도 남김
  --open         끝나면 결과 페이지(report.html)를 브라우저로 열기
  --serial ID    adb 기기 (기본: 떠 있는 에뮬레이터)

준비: 에뮬레이터 + 앱 설치 (apps/vehicle/scripts/run-app.sh). 앱 코드를 바꿨으면 run-app으로 다시 설치할 것.
결과: captures/sim-<시각>/report.html (단계별 검사·스크린샷). 종료 코드 0 = 전부 통과, 1 = 실패 있음
주의: 도는 동안 에뮬레이터의 앱을 이 스크립트가 조작하고, 앱 데이터(기록·설정)를 지운다 (--keep-data 제외).
      시연 재생 기록은 'demo-' id라 익명 기록을 켜도 서버로 안 나간다 (1번이 logcat으로 확인). 2~13번은 '나만 볼게요'를 고른다. 11~13번만 운영 서버에 쓴다(참여·별점·페어링).
      (주차장 찾기·더 쉬운 곳·주차왕 닉네임은 서버에서 읽어 온다 — 인터넷이 필요)
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
import xml.etree.ElementTree as ET
from pathlib import Path

PKG = "com.parkinggack.app"
ACTIVITY = f"{PKG}/.ui.MainActivity"
SCRIPT_DIR = Path(__file__).resolve().parent
VEHICLE_DIR = SCRIPT_DIR.parents[1]
REPO_DIR = VEHICLE_DIR.parents[1]
# 루틴 11~13이 쓰는 운영 API (앱 BuildConfig.API_BASE_URL 과 같은 곳)
API_BASE = os.environ.get("PG_API_BASE", "https://parkinggack-api.vercel.app").rstrip("/")

NODE = re.compile(r'<node [^>]*?text="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?'
                  r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')
DEMO_LOG = re.compile(r"^\s*(\d+(?:\.\d+)?)\s.*\bdemo (\S+) x")
BOUNDS = re.compile(r"\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]")

# 화면을 읽을 때마다 하는 자동 점검 (CLAUDE.md 규칙) — 루틴을 멈추지 않고 '발견 사항'으로 모은다
BANNED_COPY = [  # 운전자를 평가하거나 실패를 말하는 카피
    (re.compile(r"실패"), "'실패'"),
    (re.compile(r"못"), "'못…'(못함·못했어요)"),
    (re.compile(r"서툴"), "'서툴러요'"),
    (re.compile(r"위험\s?운전"), "'위험 운전'"),
]
MIN_TOUCH_DP = 64
# 한 줄 글자 칸 높이 ≈ 글자 크기 × 줄 높이(1.25~1.5). 14sp × 1.25 = 17.5dp 보다 낮으면 14sp 미만으로 본다 (추정)
MIN_TEXT_LINE_DP = 17
# 주행 중 화면(C-04): 배너·아이콘만, 터치 없음. '도착지 주차장은…'(C-02 카드)는 제외
DRIVING_LABEL = re.compile(r"^(주차 기록 중|도착지 주차(?!장)|경유지 (?!로))")


def log(msg=""):
    print(msg, flush=True)


def api(method, path, token=None, body=None):
    """운영 API 직접 호출 (폰 역할·검증·정리용). → (상태 코드, JSON 또는 None). 네트워크 오류면 (0, 메시지)"""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API_BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "parkinggack-sim")
    if token:
        req.add_header("Authorization", f"Device {token}")
    err = ""
    for attempt in range(3):  # 맥 쪽 DNS·연결이 잠깐 끊기는 일이 있었다 → 네트워크 오류만 다시 시도
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            return e.code, None
        except Exception as e:  # noqa: BLE001 — 네트워크 오류도 보고서에
            err = str(e)
            time.sleep(2 * (attempt + 1))
    return 0, err


def label_after(nodes, label):
    """화면 글자 순서에서 label 바로 다음 글자 (예: '닉네임' 다음의 닉네임)"""
    texts = [n[0] for n in nodes]
    return texts[texts.index(label) + 1] if label in texts[:-1] else None


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


class Device:
    def __init__(self, exe, serial):
        self.exe, self.serial = exe, serial
        self._user = None
        self._dp = None
        self.on_dump = None  # 앱 창 XML을 읽을 때마다 부름 (Sim._audit)

    def run(self, *args, timeout=30, binary=False):
        cmd = [self.exe, "-s", self.serial] + list(args)
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return b"" if binary else ""
        return r.stdout if binary else r.stdout.decode("utf-8", "replace")

    def sh(self, cmd, timeout=30):
        return self.run("shell", cmd, timeout=timeout)

    @property
    def user(self):
        # Pleos/AAOS 운전자 화면은 user 10. pm clear/grant 는 --user 없이 치면 user 0에만 적용된다
        if self._user is None:
            self._user = self.sh("am get-current-user").strip() or "0"
        return self._user

    @property
    def dp(self):
        """1dp = 몇 px (wm density / 160). 덮어쓴 값(Override)이 있으면 그것"""
        if self._dp is None:
            out = self.sh("wm density")
            m = re.search(r"Override density: (\d+)", out) or re.search(r"Physical density: (\d+)", out)
            self._dp = int(m.group(1)) / 160 if m else 1.0
        return self._dp

    def epoch(self):
        try:
            return float(self.sh("date +%s").strip())
        except ValueError:
            return time.time()

    def launch(self):
        self.sh(f"am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n {ACTIVITY}")

    def _dump(self):
        for _ in range(3):
            out = self.sh("uiautomator dump /sdcard/pg_sim_ui.xml", timeout=30)
            if "dumped" in out:
                return self.run("exec-out", "cat", "/sdcard/pg_sim_ui.xml", timeout=15)
            time.sleep(0.4)
        return ""

    def nodes(self):
        """앱 창의 [(글자, x, y)]. Pleos 왼쪽 패널·내비가 포커스를 가져가면 그 창만 덤프되므로 앱을 앞으로 (상태 그대로)"""
        xml = self._dump()
        if PKG not in xml:
            self.launch()
            time.sleep(1.0)
            xml = self._dump()
        out = []
        if PKG in xml:
            if self.on_dump:
                self.on_dump(xml)
            for t, d, a, b, c, e in NODE.findall(xml):
                label = html.unescape(t or d).replace("\n", " ").strip()
                if label:
                    out.append((label, (int(a) + int(c)) // 2, (int(b) + int(e)) // 2))
        return out

    def live_gear(self):
        """앱이 지금 받는 기어 (LiveSignal 진단 로그, 1초에 한 줄). 앱이 안 떠 있거나 로그가 없으면 None"""
        self.sh("setprop log.tag.LiveSignal DEBUG")
        time.sleep(1.4)
        out = self.run("logcat", "-d", "-v", "brief", "-s", "LiveSignal:D", timeout=15)
        found = re.findall(r"gear=(\w+)", out)
        return found[-1] if found else None

    def set_offline(self, on):
        """서버에 닿지 않게(지하 주차장처럼): 시스템 HTTP 프록시를 닿지 않는 주소로. 끄면 프록시를 지운다.
        비행기 모드는 쓰지 않는다 — Pleos 에뮬레이터는 airplane-mode 를 꺼도 eth0 이 다시 안 올라와 재부팅해야 했다.
        켠 뒤 새로 띄운 앱 프로세스부터 적용된다 (OkHttp 연결 풀) → 켜고 나서 앱 데이터를 지우고 다시 띄울 것"""
        if on:
            self.sh("settings put global http_proxy 127.0.0.1:9")
        else:
            self.sh("settings put global http_proxy :0")
            for k in ("http_proxy", "global_http_proxy_host", "global_http_proxy_port"):
                self.sh(f"settings delete global {k}")
        return self.sh("settings get global http_proxy").strip()

    def write_app_file(self, rel_path, data):
        """앱 데이터 폴더에 파일 쓰기 (디버그 APK — run-as). 예: shared_prefs/demo.xml"""
        folder = rel_path.rsplit("/", 1)[0] if "/" in rel_path else "."
        cmd = [self.exe, "-s", self.serial, "shell",
               f"run-as {PKG} --user {self.user} sh -c 'mkdir -p {folder} && cat > {rel_path}'"]
        r = subprocess.run(cmd, input=data.encode("utf-8"), capture_output=True, timeout=20)
        return r.returncode == 0

    def car_token(self):
        """앱이 서버에서 받은 차 기기 토큰 (디버그 빌드라 run-as 로 읽음). 없으면 None"""
        out = self.sh(f"run-as {PKG} --user {self.user} cat shared_prefs/device.xml")
        m = re.search(r'<string name="token">([^<]+)</string>', out)
        return m.group(1) if m else None

    def tap_xy(self, x, y):
        self.sh(f"input tap {x} {y}")

    def back(self):
        self.sh("input keyevent 4")

    def home_key(self):
        self.sh("input keyevent 3")

    def car_service_crashes_since(self, t0):
        """t0(기기 epoch) 이후 에뮬레이터 VHAL·car service 재시작 흔적 — 이때 SystemUI·앱이 같이 죽어 루틴이 멈춘다 (sim-findings 4-3)"""
        out = self.run("logcat", "-d", "-v", "epoch", "-b", "main,system,crash", timeout=20)
        keys = ("Terminating VHAL", "Car service has crashed", "FATAL EXCEPTION")
        hits = []
        for line in out.splitlines():
            m = re.match(r"^\s*(\d+(?:\.\d+)?)\s", line)
            if m and float(m.group(1)) >= t0 and any(k in line for k in keys):
                hits.append(line.strip())
        return hits

    def logcat_since(self, t0, tag):
        """t0(기기 epoch) 이후 tag 의 I 이상 로그 줄"""
        out = self.run("logcat", "-d", "-v", "epoch", "-s", f"{tag}:I", timeout=15)
        lines = []
        for line in out.splitlines():
            m = re.match(r"^\s*(\d+(?:\.\d+)?)\s", line)
            if m and float(m.group(1)) >= t0:
                lines.append(line)
        return lines

    def shot(self, path):
        data = self.run("exec-out", "screencap", "-p", binary=True, timeout=20)
        if data:
            Path(path).write_bytes(data)
            return True
        return False


def pick_serial(exe, wanted):
    if wanted:
        return wanted
    out = subprocess.run([exe, "devices"], capture_output=True, text=True).stdout
    devs = [l.split()[0] for l in out.splitlines()[1:] if l.strip().endswith("device")]
    emus = [d for d in devs if d.startswith("emulator-")]
    if not (emus or devs):
        sys.exit("adb 기기가 없어요 — 에뮬레이터를 켜고 apps/vehicle/scripts/run-app.sh 로 앱을 설치하세요")
    return (emus or devs)[0]


# ---------------------------------------------------------------- 루틴 실행기

class StepFailed(Exception):
    pass


def has(nodes, text):
    return any(text in n[0] for n in nodes)


class Sim:
    def __init__(self, dev, out_dir, args):
        self.dev, self.out, self.args = dev, out_dir, args
        self.results = []
        self.cur = None
        self.findings = []      # 자동 점검에서 걸린 것 (중복 없이)
        self._seen = set()
        self._size_hits = {}    # 크기 점검: 화면 전환 애니메이션 중 줄어든 순간을 거르려고 연속 두 번 읽힐 때만 발견으로
        dev.on_dump = self._audit

    # -- 기록

    def _record(self, name, ok, expect, observed="", shot=True):
        r = self.cur
        n = len(r["checks"]) + 1
        img = ""
        if shot:
            img = f"r{r['id']}-{n:02d}{'' if ok else '-FAIL'}.png"
            if not self.dev.shot(self.out / img):
                img = ""
        r["checks"].append(dict(n=n, name=name, ok=ok, expect=expect, observed=observed, img=img,
                                t=time.time() - r["t0"]))
        mark = "✓" if ok else "✗"
        log(f"  {mark} {r['id']}-{n:02d} {name}  ({time.time() - r['t0']:.0f}s)")
        if not ok:
            log(f"      기대: {expect}")
            if observed:
                log(f"      화면: {observed}")

    # -- 자동 점검 (화면을 읽을 때마다)

    def _finding(self, kind, text, key=None):
        key = key or (kind, text)
        if key in self._seen:
            return
        self._seen.add(key)
        r = self.cur
        n = len(self.findings) + 1
        img = f"f{n:02d}.png"
        if n > 40 or not self.dev.shot(self.out / img):
            img = ""
        where = f"{r['id']}-{len(r['checks']) + 1:02d}" if r else "-"
        self.findings.append(dict(n=n, kind=kind, text=text, where=where, img=img))
        log(f"  ⚑ 발견 {n}: [{kind}] {text}  (루틴 {where})")

    def _size_finding(self, hits, kind, text, key):
        """연속 두 번(바로 앞 덤프에서도) 작게 보였을 때만 발견으로 — 전환 애니메이션 중 축소된 순간은 거름"""
        hits.add(key)
        if key in self._size_hits:
            self._finding(kind, text, key=key)

    def _audit(self, xml):
        if self.cur is None:
            return
        hits = set()
        try:
            self._audit_nodes(xml, hits)
        finally:
            self._size_hits = hits

    def _audit_nodes(self, xml, hits):
        try:
            root = ET.fromstring(xml)
        except ET.ParseError:
            return
        app = []  # (node, 글자, 스크롤 조상 bounds)

        def label_of(el):
            own = (el.get("text") or el.get("content-desc") or "").strip()
            if own:
                return own
            for d in el.iter("node"):
                t = (d.get("text") or d.get("content-desc") or "").strip()
                if t:
                    return t
            return ""

        def walk(el, scroll):
            for ch in el.findall("node"):
                if ch.get("package") == PKG:
                    app.append((ch, scroll))
                walk(ch, ch.get("bounds") if ch.get("scrollable") == "true" else scroll)
        walk(root, None)

        texts = [html.unescape(n.get("text") or n.get("content-desc") or "").replace("\n", " ").strip() for n, _ in app]
        for t in texts:
            for rx, word in BANNED_COPY:
                if t and rx.search(t):
                    self._finding("카피", f"금지어 {word}: “{t}”")
        driving = any(DRIVING_LABEL.search(t) for t in texts if t)
        for n, scroll in app:
            t = (n.get("text") or "").strip()
            m = BOUNDS.match(n.get("bounds", ""))
            if not t or "\n" in t or n.find("node") is not None or not m:
                continue
            x1, y1, x2, y2 = map(int, m.groups())
            if scroll:
                sm = BOUNDS.match(scroll)
                if sm and (y1 <= int(sm.group(2)) or y2 >= int(sm.group(4))):
                    continue
            h = (y2 - y1) / self.dev.dp
            # 칸 높이는 이웃(큰 숫자 FitText 등)에 가려 잘려 보일 수 있다 → 글자 폭으로 잰 크기도 작을 때만
            ems = sum(1.0 if "\uac00" <= ch <= "\ud7a3" else 0.3 if ch == " " else 0.58 for ch in t)
            font_by_width = (x2 - x1) / self.dev.dp / max(ems, 1.0)
            if 0 < h < MIN_TEXT_LINE_DP and font_by_width < 13.5:
                self._size_finding(hits, "글자 크기", f"“{html.unescape(t)[:30]}” 줄 높이 {h:.0f}dp — 14sp 미만으로 보임", ("text", t))
        for n, scroll in app:
            if n.get("clickable") != "true" or n.get("enabled") == "false":
                continue
            m = BOUNDS.match(n.get("bounds", ""))
            if not m:
                continue
            x1, y1, x2, y2 = map(int, m.groups())
            name = label_of(n).replace("\n", " ")[:40]
            if not name:  # 글자도 설명(contentDescription)도 없는 버튼 — 음성 조작·화면 낭독기가 부를 이름이 없다
                self._finding("버튼 이름", f"이름 없는 버튼 {n.get('bounds')} ({n.get('class', '?').split('.')[-1]})",
                              key=("noname", self.cur["id"], n.get("bounds")))
                name = n.get("class", "?").split(".")[-1]
            if driving:
                self._finding("주행 중 터치", f"C-04 주행 화면에서 “{name}”을(를) 누를 수 있음", key=("drive", name))
            if scroll:  # 스크롤 안에서 화면 끝에 걸려 잘린 것은 크기를 재지 않는다
                sm = BOUNDS.match(scroll)
                if sm:
                    sx1, sy1, sx2, sy2 = map(int, sm.groups())
                    if y1 <= sy1 or y2 >= sy2 or x1 <= sx1 or x2 >= sx2:
                        continue
            w, h = (x2 - x1) / self.dev.dp, (y2 - y1) / self.dev.dp
            if min(w, h) < MIN_TOUCH_DP - 0.5:
                self._size_finding(hits, "터치 영역", f"“{name}” {w:.0f}×{h:.0f}dp — {MIN_TOUCH_DP}dp 미만", ("touch", name))

    def _look(self):
        if self.args.step:
            input("      (Enter → 다음)")
        elif self.args.pause > 0:
            time.sleep(self.args.pause)

    # -- 동작

    def see(self, name, *texts, absent=(), timeout=20.0, shot=True, quiet=False):
        """texts가 모두 보이고 absent가 하나도 안 보일 때까지 기다림. 못 보면 실패 → 루틴 중단"""
        deadline = time.time() + timeout
        nodes = []
        while True:
            nodes = self.dev.nodes()
            if all(has(nodes, t) for t in texts) and not any(has(nodes, t) for t in absent):
                if not quiet:
                    self._record(name, True, " · ".join(texts), shot=shot)
                    self._look()
                return nodes
            if time.time() > deadline:
                break
            time.sleep(0.3)
        missing = [t for t in texts if not has(nodes, t)] + [f"(없어야 함) {t}" for t in absent if has(nodes, t)]
        seen = " | ".join(n[0] for n in nodes[:24]) or "(앱 화면을 못 읽음)"
        self._record(name, False, "안 보임: " + ", ".join(missing), seen)
        raise StepFailed(name)

    def see_any(self, name, options, timeout=20.0):
        """options = [(글자, 설명)] 중 하나라도 보이면 통과. 어느 것이었는지 검사 이름에 붙이고 그 글자를 돌려준다"""
        deadline = time.time() + timeout
        nodes = []
        while True:
            nodes = self.dev.nodes()
            for text, label in options:
                if has(nodes, text):
                    self._record(f"{name} → {label}", True, " / ".join(t for t, _ in options))
                    self._look()
                    return text
            if time.time() > deadline:
                break
            time.sleep(0.3)
        seen = " | ".join(n[0] for n in nodes[:24]) or "(앱 화면을 못 읽음)"
        self._record(name, False, "안 보임: " + " / ".join(t for t, _ in options), seen)
        raise StepFailed(name)

    def tap(self, label, timeout=15.0, nth=0, nodes=None):
        """글자(정확히 같은 것 우선, 없으면 포함)를 찾아 가운데를 누름.
        nodes: 방금 읽은 화면 (같은 화면의 버튼을 이어 누를 때 다시 읽지 않게)"""
        deadline = time.time() + timeout
        while True:
            nodes = nodes or self.dev.nodes()
            hit = [n for n in nodes if n[0] == label] or [n for n in nodes if label in n[0]]
            if len(hit) > nth:
                _, x, y = hit[nth]
                self.dev.tap_xy(x, y)
                log(f"      ☞ '{label}' 누름")
                time.sleep(0.6)
                return
            if time.time() > deadline:
                seen = " | ".join(n[0] for n in nodes[:24]) or "(앱 화면을 못 읽음)"
                self._record(f"'{label}' 누르기", False, f"'{label}' 버튼이 보여야 함", seen)
                raise StepFailed(label)
            nodes = None
            time.sleep(0.3)

    def go_home(self):
        """왼쪽 메뉴의 '홈' (C-05·C-06처럼 메뉴가 없는 화면이면 뒤로 키)"""
        for _ in range(4):
            nodes = self.dev.nodes()
            if has(nodes, "최근 주차 위치"):
                return
            home = [n for n in nodes if n[0] == "홈"]
            if home:
                self.dev.tap_xy(home[0][1], home[0][2])
                log("      ☞ '홈' 누름")
            else:
                self.dev.back()
                log("      ☞ 뒤로")
            time.sleep(0.8)

    def see_re(self, name, pattern, timeout=10.0):
        """정규식에 맞는 글자가 보일 때까지. 찾은 글자를 검사 이름에 붙인다"""
        rx = re.compile(pattern)
        deadline = time.time() + timeout
        nodes = []
        while True:
            nodes = self.dev.nodes()
            hit = next((l for l, _, _ in nodes if rx.search(l)), None)
            if hit:
                self._record(f"{name} — “{hit}”", True, pattern)
                self._look()
                return hit
            if time.time() > deadline:
                break
            time.sleep(0.4)
        self._record(name, False, f"/{pattern}/ 가 보여야 함", " | ".join(n[0] for n in nodes[:24]) or "(앱 화면을 못 읽음)")
        raise StepFailed(name)

    def read(self, pattern):
        """화면에서 정규식에 맞는 첫 글자"""
        rx = re.compile(pattern)
        for label, _, _ in self.dev.nodes():
            if rx.search(label):
                return label
        return None

    def demo(self, scenario, dest):
        """앱의 시연 재생을 켬 (demo.sh와 같은 인텐트). 앱이 받았는지 logcat으로 확인"""
        t0 = self.dev.epoch()
        self.demo_t0 = t0
        extra = "" if dest else " --ez dest false"
        self.dev.sh(f"am start --activity-single-top --activity-clear-top -n {ACTIVITY} "
                    f"--es demo {scenario} --ef speed {self.args.speed:g}{extra}")
        deadline = time.time() + 8
        while time.time() < deadline:
            out = self.dev.run("logcat", "-d", "-v", "epoch", "-s", "MainActivity:I", timeout=15)
            for line in out.splitlines():
                m = DEMO_LOG.match(line)
                if m and float(m.group(1)) >= t0 - 2 and m.group(2) == scenario:
                    log(f"      ▶ 주행 재생 '{scenario}' ×{self.args.speed:g}{'' if dest else ' (목적지 없음)'}")
                    return
            time.sleep(0.7)
        self._record(f"주행 재생 '{scenario}' 시작", False,
                     "앱이 시연 인텐트를 받아야 함 (logcat 'MainActivity: demo …')",
                     "앱이 이 시나리오를 모르는 옛 버전일 수 있음 → apps/vehicle/scripts/run-app.sh 로 다시 설치")
        raise StepFailed(scenario)

    def wipe(self, seed=False):
        """앱 데이터 지우고 다시 띄움. seed=False 면 첫 실행 예시 기록(DemoSeed)을 막아 빈 상태로 시작
        (앱이 뜨기 전에 shared_prefs/demo.xml 에 seeded=true 를 써 둠)"""
        u = self.dev.user
        self.dev.sh(f"am force-stop --user {u} {PKG}")
        self.dev.sh(f"pm clear --user {u} {PKG}")
        if not seed:
            ok = self.dev.write_app_file("shared_prefs/demo.xml",
                                         "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n"
                                         "<map>\n    <boolean name=\"seeded\" value=\"true\" />\n</map>\n")
            if not ok:
                log("      ⚠ 예시 기록 막기 실패 (run-as) — 빈 홈 검사가 실패할 수 있음")
        # pm clear 는 런타임 권한도 지움 → 다시 허용 (권한 창이 시연을 가리지 않게. demo.sh reset 과 같음)
        for p in ("android.car.permission.CAR_SPEED", "pleos.car.permission.FUSED_LOCATION"):
            self.dev.sh(f"pm grant --user {u} {PKG} {p}")
        self.dev.sh(f"appops set --user {u} {PKG} SYSTEM_ALERT_WINDOW allow")
        self.dev.launch()
        time.sleep(1.5)
        self.check_parked()

    def check_parked(self):
        """차가 P가 아니면(누가 Virtual Console로 D/R을 넣어 둠) 앱은 C-04 주행 화면만 보이고 내비를 앞으로 띄운다 → 시작 전에 멈춤"""
        gear = self.dev.live_gear()
        if gear is not None and gear != "PARK":
            self._record("차 기어가 P인지", False, "기어 P (정차)",
                         f"앱이 받는 기어 = {gear} → Virtual Console(127.0.0.1:8088)에서 P로 두고 다시 돌릴 것", shot=True)
            raise StepFailed("기어 P 아님")

    def prepare(self):
        """루틴 2~5 공통: 앱 데이터 지우고 온보딩은 빠르게 넘김 → 빈 홈 (--keep-data면 홈으로만)"""
        if self.args.keep_data:
            self.dev.launch()
            self.check_parked()
            nodes = self.dev.nodes()
            if not has(nodes, "주차하다 헤맨 흔적이 지도가 돼요"):
                for _ in range(4):  # 다른 화면에 있으면 홈까지 뒤로
                    if has(nodes, "최근 주차 위치") or has(nodes, "이렇게 기록돼요"):
                        break
                    self.dev.back()
                    time.sleep(0.6)
                    nodes = self.dev.nodes()
                self.see("준비: 기록을 그대로 두고 홈에서 시작", "내 주차", timeout=10, shot=False)
                return
        else:
            self.wipe()
        n = self.see("", "주차하다 헤맨 흔적이 지도가 돼요", timeout=25, quiet=True)
        self.tap("다음", nodes=n)
        n = self.see("", "주차 기록은 익명으로만 모여요", quiet=True)
        self.tap("나만 볼게요", nodes=n)  # 시뮬레이션 기록을 실제 서버(난이도 집계)에 올리지 않게
        self.tap("다음", nodes=n)
        n = self.see("", "운전한 지 얼마나 되셨어요?", quiet=True)
        self.tap("1~3년", nodes=n)
        self.tap("시작하기", nodes=n)
        self.see("준비: 앱 데이터 지움 → 온보딩 넘김 → 빈 홈", "이렇게 기록돼요", timeout=15, shot=False)

    def check_no_upload(self):
        """마지막 시연 재생 뒤 기록 업로드 로그: 'demo-' 기록은 기기에만 ('queued'가 있으면 서버로 나간 것)"""
        time.sleep(1.0)
        ups = [l.split("AppController")[-1].lstrip(": ").strip()
               for l in self.dev.logcat_since(self.demo_t0 - 1, "AppController") if "upload:" in l]
        kept = [l for l in ups if "stays on device" in l]
        queued = [l for l in ups if "queued" in l]
        ok = bool(kept) and not queued
        self._record("시연 기록은 서버로 안 나감 — 익명 기록을 켜도 'demo-' 기록은 기기에만", ok,
                     "logcat 'upload: demo-… stays on device' 있고 'queued' 없음",
                     " / ".join(ups[-3:]) or "upload 로그 없음 (저장이 안 됐거나 옛 버전 앱)", shot=False)
        if not ok:
            raise StepFailed("시연 기록 업로드")

    def drive_timeout(self, sec_at_1x):
        return sec_at_1x / self.args.speed + 25

    # -- 녹화

    def _record_start(self, rid):
        if not self.args.record:
            return None
        self.dev.sh("rm -f /sdcard/pg_sim.mp4")
        cmd = [self.dev.exe, "-s", self.dev.serial, "shell", "screenrecord", "--time-limit", "180", "/sdcard/pg_sim.mp4"]
        return subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def _record_stop(self, proc, rid):
        if proc is None:
            return ""
        self.dev.sh("pkill -INT screenrecord")
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        time.sleep(1.0)
        name = f"r{rid}.mp4"
        self.dev.run("pull", "/sdcard/pg_sim.mp4", str(self.out / name), timeout=60)
        return name if (self.out / name).exists() else ""

    # -- 루틴 하나

    def run(self, routine):
        rid, title, flow, fn = routine
        self.cur = dict(id=rid, title=title, flow=flow, checks=[], t0=time.time(), ok=False, error="", video="")
        dev_t0 = self.dev.epoch()
        self.results.append(self.cur)
        log("")
        log(f"━━ 루틴 {rid} · {title}")
        log(f"   {flow}")
        rec = self._record_start(rid)
        try:
            fn(self)
            self.cur["ok"] = all(c["ok"] for c in self.cur["checks"])
        except StepFailed as e:
            self.cur["error"] = f"'{e}'에서 멈춤"
        except Exception as e:  # 스크립트 오류도 보고서에 남기고 다음 루틴으로
            self.cur["error"] = f"{type(e).__name__}: {e}"
            log(f"  ✗ 스크립트 오류: {e}")
        finally:
            self.cur["video"] = self._record_stop(rec, rid)
            self.cur["secs"] = time.time() - self.cur["t0"]
            if not self.cur["ok"]:
                # 실패 원인이 에뮬레이터 car service 재시작이면 보고서에 같이 (앱 버그와 구분)
                try:
                    hits = self.dev.car_service_crashes_since(dev_t0)
                except Exception:  # noqa: BLE001
                    hits = []
                if hits:
                    vhal = any("Terminating VHAL" in h for h in hits)
                    note = ("에뮬레이터 VHAL 재시작 — adb reboot 권장" if vhal else "앱/시스템 크래시") + f" (logcat {len(hits)}줄)"
                    self.cur["error"] = (self.cur["error"] + " · " if self.cur["error"] else "") + note
                    for h in hits[:6]:
                        log(f"   ! {h[:180]}")
                # 재생이 아직 돌고 있으면 다음 루틴을 방해하므로 앱을 멈춤
                self.dev.sh(f"am force-stop --user {self.dev.user} {PKG}")
        passed = sum(c["ok"] for c in self.cur["checks"])
        log(f"   → {'통과' if self.cur['ok'] else '실패'} ({passed}/{len(self.cur['checks'])}, {self.cur['secs']:.0f}초)"
            + (f" — {self.cur['error']}" if self.cur["error"] else ""))


# ---------------------------------------------------------------- 루틴 5가지

def r1_first_day(s):
    """첫 실행 → 메인 시연: 온보딩, 빈 홈, 도착지 난이도 카드, 자동 기록, 층 추정 B2, 홈 반영"""
    s.wipe()
    n = s.see("앱 데이터 지움 → C-11 온보딩 1/3", "주차하다 헤맨 흔적이 지도가 돼요", "다음", timeout=25)
    s.tap("다음", nodes=n)
    n = s.see("C-11 2/3 익명 기록 동의", "주차 기록은 익명으로만 모여요", "익명 기록 보내기", "나만 볼게요")
    # 실제 사용자 기본값(익명 기록 켬). 시연 재생 기록은 'demo-'라 서버로 안 나가는지 끝에서 logcat으로 확인
    s.tap("익명 기록 보내기", nodes=n)
    s.tap("다음", nodes=n)
    n = s.see("C-11 3/3 운전 경력", "운전한 지 얼마나 되셨어요?", "1~3년", "시작하기")
    s.tap("1~3년", nodes=n)
    s.tap("시작하기", nodes=n)
    s.see("C-01 빈 홈 — 가짜 기록 없이 '이렇게 기록돼요'", "이렇게 기록돼요", "내 주차", timeout=15)
    s.demo("pangyo-department-store", dest=True)
    s.see("C-02 도착지 난이도 카드 ★4.3", "도착지 주차장은 조금 까다로워요", "4.3", "더 쉬운 곳 보기", "괜찮아요, 그냥 갈게요")
    s.tap("괜찮아요, 그냥 갈게요")
    s.see("C-04 주행 배너 '도착지 주차 ★4.3' (터치 없는 화면)", "도착지 주차", "4.3", timeout=15)
    s.see("C-04 주차장 진입 감지 → '주차 기록 중'", "주차 기록 중", timeout=s.drive_timeout(40))
    s.see("C-04 후진 2번까지 실시간으로 셈", "후진 2", timeout=s.drive_timeout(80))
    s.see("C-05 P → 'B2에 대셨나요?' · 후진 2회", "B2에 대셨나요?", "후진 2회", "맞아요", timeout=s.drive_timeout(40))
    s.tap("맞아요")
    s.see("C-01 홈 '최근 주차 위치'에 B2", "최근 주차 위치", "B2", absent=("이렇게 기록돼요",), timeout=15)
    s.check_no_upload()


def r2_easier_lot(s):
    """C-02 → C-03 더 쉬운 주차장 → 경유지 → 그 주차장 기준으로 기록 (평행주차)"""
    s.prepare()
    s.demo("parallel-parking", dest=True)
    s.see("C-02 '현대백화점' 카드 ★4.3", "도착지 주차장은 조금 까다로워요", "더 쉬운 곳 보기")
    s.tap("더 쉬운 곳 보기")
    n = s.see("C-03 더 쉬운 주차장 후보 + 걷는 시간", "더 쉬운 주차장", "걸어서", "경유지로 안내")
    s.tap("경유지로 안내", nodes=n)
    s.see("C-04 배너가 '경유지 …'로 바뀜", "경유지", timeout=20)
    banner = s.read(r"^경유지 ") or ""
    log(f"      (배너: {banner or '?'})")
    s.see("C-04 진입 감지 → '주차 기록 중'", "주차 기록 중", timeout=s.drive_timeout(40))
    s.see("C-05 경유지 주차장 기준 결과 · 1F · 후진 1회", "1F에 대셨나요?", "후진 1회", absent=("현대백화점",),
          timeout=s.drive_timeout(50))
    place = s.read(r" · 오[전후] ") or ""
    if banner:
        word = banner.split()[1] if len(banner.split()) > 1 else ""
        s._record(f"C-05 주차장 이름이 경유지와 같음 ({place or '?'})", bool(word) and word in place,
                  f"'{word}' 포함", place, shot=False)
    s.tap("맞아요")
    s.see("C-01 홈에 1F", "최근 주차 위치", "1F", timeout=15)


def r3_zone_phone(s):
    """C-05 → C-06 층·구역·기둥 → 저장 → C-07 QR → 홈에 구역까지"""
    s.prepare()
    s.demo("flat-lot-simple", dest=False)
    s.see("C-04 진입 감지 → '주차 기록 중'", "주차 기록 중", timeout=s.drive_timeout(35))
    s.see("C-05 '1F에 대셨나요?' · 후진 0회", "1F에 대셨나요?", "후진 0회", "구역도 기억하기", timeout=s.drive_timeout(40))
    # 목적지가 없어도 P 위치의 주차장(250 m 안) 또는 내비 주소로 이름이 붙음 (AppController.nameByPlace)
    s.see_re("C-05 머리줄에 장소 이름 (목적지 없이도 P 위치로)", r"^(?!주차 위치 · ).+ · 오[전후] \d", timeout=8)
    s.tap("구역도 기억하기")
    s.see("C-06 층·구역·기둥 빠른 선택", "주차 위치 기억하기", "구역", "기둥 번호", "저장")
    s.tap("B1")
    s.tap("C")
    s.tap("07")
    s.see("C-06 '저장될 위치'가 고른 대로 B1 · C · 07", "B1", "C", "07")
    s.tap("저장")
    # 시연 기록(demo-)은 운영 서버에 짧은 링크를 만들지 않는다 → 위치를 담은 /p/ 링크 (sim-findings 2-4)
    s.see("C-07 폰으로 보내기 — QR · 위치 링크 (시연 기록은 서버에 안 씀)", "폰으로 보내기", "저장된 위치", "parkinggack.vercel.app/p/", "닫기")
    link = s.read(r"vercel\.app/") or ""
    log(f"      (짧은 링크: {link})")
    s.tap("닫기")
    s.see("C-01 홈 '최근 주차 위치'에 B1 · C-07", "최근 주차 위치", "B1", "C-07", timeout=15)


def r4_replay(s):
    """C-05 → C-12 위에서 본 동선 → 다시 보기 → 닫기 → 맞아요"""
    s.prepare()
    s.demo("angled-parking", dest=False)
    s.see("C-04 진입 감지 → '주차 기록 중'", "주차 기록 중", timeout=s.drive_timeout(35))
    s.see("C-05 '1F에 대셨나요?' · 후진 0회", "1F에 대셨나요?", "후진 0회", "동선 크게 보기", timeout=s.drive_timeout(40))
    s.tap("동선 크게 보기")
    s.see("C-12 동선 그림 · 사선주차 · 후진 0회", "오늘 주차 동선", "사선주차", "후진 0회", "주차 완료", "다시 보기")
    s.tap("다시 보기")
    time.sleep(1.2)
    s.see("C-12 다시 보기 (그리는 중)", "오늘 주차 동선", "닫기")
    s.tap("닫기")
    s.see("C-05로 돌아옴", "1F에 대셨나요?", "맞아요", timeout=10)
    s.tap("맞아요")
    s.see("C-01 홈 '주차 동선'에 후진 0회", "최근 주차 위치", "1F", "후진 0회", timeout=15)


def r5_unknown_floor(s):
    """층 추정 신뢰도 LOW → 층 버튼부터 → 손대지 않으면 층 없이 저장 → C-09 · C-13"""
    s.prepare()
    s.demo("split-level", dest=False)
    s.see("C-04 램프를 1바퀴 반 돌며 '주차 기록 중'", "주차 기록 중", timeout=s.drive_timeout(40))
    s.see("C-05 층을 모름 → '몇 층에 대셨나요?' 층 버튼", "몇 층에 대셨나요?", "이번엔 층을 확실히 모르겠어요",
          timeout=s.drive_timeout(50))
    s.see("C-05 손대지 않으면 '…초 뒤 층 없이 저장돼요'", "층 없이 저장돼요", timeout=5)
    s.see("C-05 8초 뒤 자동 저장 (기록을 잃지 않음)", "저장했어요", absent=("층 없이 저장돼요",), timeout=15)
    s.go_home()
    s.see("C-01 홈에 방금 기록 — 층 없이 '위치 미기록'", "최근 주차 위치", "위치 미기록", "후진 0회", timeout=15)
    s.tap("내 기록")
    if s.args.keep_data:
        s.see("C-09 내 주차 기록", "최근 기록", "모은 기록", timeout=15)
    else:
        s.see("C-09 내 주차 기록 '모은 기록 1번', 층 칸은 '–'", "최근 기록", "모은 기록", "1번", "–", timeout=15)
    s.tap("주차왕")
    # 서버 순위(API v1.2). '참여할게요'는 서버에 쓰므로 누르지 않는다
    got = s.see_any("C-13 주차왕 화면", [
        ("주차왕에 참여할까요?", "참여 전 카드"),
        ("이번 주", "이번 주 순위"),
        ("인터넷에 연결되면 순위를 보여 드릴게요", "서버 연결 안내"),
        ("서버에 연결하지 못했어요", "서버 연결 안내 (옛 문구)"),
    ])
    if got in ("인터넷에 연결되면 순위를 보여 드릴게요", "서버에 연결하지 못했어요"):
        log("      ⚠ 서버(parkinggack-api)의 주차왕 API에 닿지 않음 — 인터넷·서버 버전(1.2.0 이상) 확인. 앱은 안내 문구만 보여 줌")


def r6_cards_off(s):
    """C-10에서 도착지 카드·주차 완료 카드 끄기 → C-02·C-05 없이 주행하고 P에서 바로 저장"""
    s.prepare()
    s.tap("설정")
    n = s.see("C-10 설정", "설정", "주차 완료 카드", "도착지 난이도 카드", "끄기")
    s.tap("끄기", nodes=n)
    s.tap("주차 완료 카드", nodes=n)
    time.sleep(0.6)
    n = s.see("C-10 주차 완료 카드 '꺼짐' · 도착지 카드 '끄기'", "꺼짐")
    offs = sum(1 for l, _, _ in n if l == "꺼짐")
    s._record(f"C-10 '꺼짐' 2개 — 익명 기록(나만 볼게요)·주차 완료 카드 ({offs}개)", offs >= 2, "'꺼짐' ×2",
              " | ".join(l for l, _, _ in n[:20]), shot=False)
    s.go_home()
    s.see("C-01 홈으로", "내 주차", timeout=10, shot=False)
    s.demo("pangyo-department-store", dest=True)
    s.see("C-02 카드 없이 바로 주행 → '주차 기록 중'", "주차 기록 중", absent=("도착지 주차장은 조금 까다로워요",),
          timeout=s.drive_timeout(45))
    s.see("P → C-05 없이 바로 저장 → 홈 '최근 주차 위치'에 B2", "최근 주차 위치", "B2",
          absent=("B2에 대셨나요?", "주차 기록 중"), timeout=s.drive_timeout(130))
    # 기기 안 기록만 지운다 (서버에는 이 루틴이 보낸 것이 없음 — 나만 볼게요 + demo- 기록)
    s.tap("설정")
    n = s.see("C-10 '기록 모두 지우기'", "기록 모두 지우기", timeout=10, shot=False)
    s.tap("기록 모두 지우기", nodes=n)
    n = s.see("C-10 한 번 더 묻기 — 되돌릴 수 없음", "지운 기록은 되돌릴 수 없어요", "지우기", "취소", timeout=10)
    s.tap("지우기", nodes=n)
    s.see("C-10 '기록을 지웠어요'", "기록을 지웠어요", timeout=10, shot=False)
    s.go_home()
    s.see("C-01 빈 홈으로 — '이렇게 기록돼요'", "이렇게 기록돼요", absent=("B2",), timeout=15)


def r7_history_detail(s):
    """C-09 기록을 눌러 C-12 동선 다시 보기 → 홈 '자주 가는 곳' → C-08 주차장 상세 → 별점 시트 열고 닫기"""
    s.prepare()
    s.demo("parallel-parking", dest=True)
    s.see("C-02 '현대백화점' 카드", "도착지 주차장은 조금 까다로워요", "괜찮아요, 그냥 갈게요")
    s.tap("괜찮아요, 그냥 갈게요")
    s.see("C-05 '1F에 대셨나요?' · 후진 1회", "1F에 대셨나요?", "후진 1회", timeout=s.drive_timeout(90))
    s.tap("맞아요")
    s.see("C-01 홈", "최근 주차 위치", timeout=15, shot=False)
    s.tap("내 기록")
    s.see("C-09 기록 1건 — 현대백화점 판교점", "최근 기록", "현대백화점", timeout=15)
    s.tap("현대백화점")
    s.see("C-12 기록 줄을 눌러 동선 다시 보기", "주차 동선", "후진 1회", "닫기", timeout=10)
    s.tap("닫기")
    s.see("C-09로 돌아옴", "최근 기록", timeout=10, shot=False)
    s.go_home()
    s.see("C-01 '자주 가는 곳'에 현대백화점 판교점", "자주 가는 곳", "현대백화점 판교점", timeout=15)
    s.tap("현대백화점 판교점", nth=1)  # 첫 번째는 '최근 주차 위치' 카드의 이름(누를 수 없음), 두 번째가 '자주 가는 곳' 줄
    s.see("C-08 주차장 상세 — 난이도 근거 · 별점 · 경유지", "평균 후진", "별점 남기기", "경유지로 안내", timeout=15)
    s.tap("별점 남기기")
    s.see("C-08 별점 시트 (화면 안, 키보드 없음)", "이 주차장, 주차하기 어땠나요?", "닫기", timeout=10)
    s.tap("닫기")  # 별점은 서버에 쓰므로 보내지 않는다
    s.see("시트 닫힘 → C-08", "별점 남기기", absent=("이 주차장, 주차하기 어땠나요?",), timeout=10, shot=False)
    s.dev.back()
    s.see("뒤로 → C-01", "최근 주차 위치", timeout=10, shot=False)


def r8_resume(s):
    """주행 중(기록 중) 홈 키로 앱을 내렸다가 다시 열기 → 기록이 끊기지 않고 C-05까지"""
    s.prepare()
    s.demo("pangyo-department-store", dest=False)
    s.see("C-04 '주차 기록 중'", "주차 기록 중", timeout=s.drive_timeout(45))
    s.dev.home_key()
    log("      ☞ 홈 키 (앱을 뒤로 보냄) → 4초 뒤 다시 열기")
    time.sleep(4)
    alive = bool(s.dev.sh(f"pidof {PKG}").strip())
    s._record("앱을 내려도 프로세스가 살아 있음 (기록 유지)", alive, f"pidof {PKG}", shot=False)
    s.dev.launch()
    s.see("다시 연 뒤에도 기록이 이어져 C-05 '…에 대셨나요?' · 후진 2회", "에 대셨나요?", "후진 2회",
          timeout=s.drive_timeout(130))
    s.tap("맞아요")
    s.see("C-01 홈에 반영", "최근 주차 위치", "후진 2회", timeout=15)


def r9_two_parkings(s):
    """연속 두 번 주차 → 두 번째는 '다른 층이에요'로 B3로 고침 → 홈 B3 · C-09 '모은 기록 2번' (고쳐도 3건이 되지 않음)"""
    s.prepare()
    s.demo("flat-lot-simple", dest=False)
    s.see("첫 번째 C-05 '1F에 대셨나요?'", "1F에 대셨나요?", timeout=s.drive_timeout(75))
    s.tap("맞아요")
    s.see("C-01 홈 1F", "최근 주차 위치", "1F", timeout=15, shot=False)
    s.demo("angled-parking", dest=False)
    s.see("두 번째 C-05 '1F에 대셨나요?'", "1F에 대셨나요?", "다른 층이에요", timeout=s.drive_timeout(75))
    s.tap("다른 층이에요")
    s.see("C-06 층 고르기", "주차 위치 기억하기", "B3", "저장", timeout=10)
    s.tap("B3")
    s.tap("저장")
    s.go_home()
    s.see("C-01 홈 '최근 주차 위치'가 고친 B3", "최근 주차 위치", "B3", timeout=15)
    s.tap("내 기록")
    n = s.see("C-09 '모은 기록 2번' — 층을 고쳐도 같은 기록", "모은 기록", "2번", "B3", "1F", timeout=15)
    unnamed = [l for l, _, _ in n if l == "주차 위치"]
    s._record(f"C-09 장소 칸이 '주차 위치'로 비지 않음 (P 위치의 주차장·주소) — {len(unnamed)}칸", not unnamed,
              "'주차 위치' 0칸", " | ".join(l for l, _, _ in n[:24]), shot=False)


def r10_offline(s):
    """지하에서 신호가 끊겼을 때: 시스템 프록시로 서버 없이 C-02(기기 안 데이터) → C-05 → C-07 긴 링크 → C-13 안내 → 복구"""
    proxy = s.dev.set_offline(True)
    log(f"      ☞ 서버에 닿지 않게 (시스템 프록시 {proxy})")
    went = proxy == "127.0.0.1:9"
    try:
        s._record("오프라인 — 시스템 프록시를 닿지 않는 주소로", went, "http_proxy 127.0.0.1:9", proxy, shot=False)
        if not went:
            raise StepFailed("오프라인 전환")
        s.prepare()  # 앱 데이터를 지우고 새 프로세스로 → 처음부터 오프라인
        s.demo("pangyo-department-store", dest=True)
        s.see("C-02 서버 없이도 기기 안 데이터로 '현대백화점' 카드", "도착지 주차장은 조금 까다로워요", "괜찮아요, 그냥 갈게요", timeout=30)
        s.tap("괜찮아요, 그냥 갈게요")
        s.see("C-04 '주차 기록 중'", "주차 기록 중", timeout=s.drive_timeout(45))
        s.see("C-05 'B2에 대셨나요?' (오프라인)", "B2에 대셨나요?", "폰으로 보내기", timeout=s.drive_timeout(90))
        s.tap("폰으로 보내기")
        s.see("C-07 서버 없이 만든 링크 (위치를 링크에 담음)", "폰으로 보내기", "vercel.app/p/", "닫기", timeout=20)
        s.tap("닫기")
        s.go_home()
        s.see("C-01 홈에 B2", "최근 주차 위치", "B2", timeout=15, shot=False)
        s.tap("주차왕")
        s.see("C-13 오프라인 안내 + 다시 시도", "인터넷에 연결되면 순위를 보여 드릴게요", "다시 시도", timeout=25)
    finally:
        left = s.dev.set_offline(False)
        log(f"      ☞ 프록시 지움 (지금 값: {left or '없음'})")
    s.tap("다시 시도")
    s.see_any("네트워크가 돌아온 뒤 '다시 시도' → C-13", [
        ("주차왕에 참여할까요?", "참여 전 카드"),
        ("이번 주", "이번 주 순위"),
    ], timeout=30)


# ---------------------------------------------------------------- 서버에 쓰는 루틴 (운영 서버 — 사용자 허락 2026-11-04)

def r11_king_join(s):
    """C-13 주차왕 참여(서버에 씀) → 이번 주 등수·점수 → C-01 한 줄 → 끝나면 서버에서 참여 취소 (순위판에 시험 참가자를 남기지 않게)"""
    s.prepare()
    s.tap("주차왕")
    n = s.see("C-13 참여 전 — 닉네임 · 내 리그", "주차왕에 참여할까요?", "다시 뽑기", "참여할게요", timeout=25)
    nick = label_after(n, "닉네임")
    s.tap("다시 뽑기", nodes=n)
    time.sleep(2.0)
    nick2 = label_after(s.dev.nodes(), "닉네임")
    s._record(f"닉네임 다시 뽑기 “{nick}” → “{nick2}”", bool(nick2) and nick2 != nick, "다른 닉네임", shot=False)
    try:
        s.tap("참여할게요")
        n = s.see("C-13 참여 → 이번 주 등수 · 점수 막대", "이번 주", "후진·핸들", "가 본 주차장", absent=("참여할게요",), timeout=30)
        log(f"      (순위판의 '나' 줄: {'있음' if any(l == '나' for l, _, _ in n) else '없음 — 이번 주 주차가 없으면 순위 밖'})")
        token = s.dev.car_token()
        st, me = api("GET", "/v1/me/king", token)
        joined = isinstance(me, dict) and me.get("joined") is True
        s._record(f"서버 GET /v1/me/king → {st} joined={me.get('joined') if isinstance(me, dict) else '?'} · {me.get('nickname') if isinstance(me, dict) else ''}",
                  st == 200 and joined, "200 · joined=true · 앱에서 고른 닉네임", str(me)[:200], shot=False)
        s.go_home()
        s.see("C-01 '주차왕에 참여해 보세요'가 내 순위 줄로 바뀜", "내 주차", absent=("주차왕에 참여해 보세요",), timeout=20)
    finally:
        token = s.dev.car_token()
        if token:
            st, _ = api("DELETE", "/v1/me/king", token)
            st2, me = api("GET", "/v1/me/king", token)
            gone = isinstance(me, dict) and me.get("joined") is False
            log(f"      ☞ 정리: 서버에서 참여 취소 DELETE /v1/me/king → {st}, 다시 보면 joined={me.get('joined') if isinstance(me, dict) else '?'}")
            s._record("정리: 서버에서 주차왕 참여 취소 (순위판에서 빠짐)", st == 204 and gone, "204 → joined=false", f"{st} / {st2}", shot=False)


def r12_rating(s):
    """C-08 별점 보내기(서버에 씀): 현대백화점(★4.3)에 ★4 — 점수를 거의 흔들지 않게 → '고마워요' → 확인"""
    s.prepare()
    s.demo("parallel-parking", dest=True)
    s.see("C-02 '현대백화점' 카드", "도착지 주차장은 조금 까다로워요", "괜찮아요, 그냥 갈게요")
    s.tap("괜찮아요, 그냥 갈게요")
    s.see("C-05", "에 대셨나요?", "맞아요", timeout=s.drive_timeout(90), shot=False)
    s.tap("맞아요")
    s.see("C-01 '자주 가는 곳'에 현대백화점 판교점", "자주 가는 곳", "현대백화점 판교점", timeout=15, shot=False)
    s.tap("현대백화점 판교점", nth=1)
    s.see("C-08 주차장 상세", "별점 남기기", "평균 후진", timeout=15, shot=False)
    s.tap("별점 남기기")
    n = s.see("C-08 별점 시트 ★1~★5", "이 주차장, 주차하기 어땠나요?", "★4", timeout=10)
    s.tap("★4", nodes=n)
    # '고마워요'는 서버 응답 뒤 1.5초만 보여서 화면 읽기(1~2초)가 놓칠 수 있다 → 보이면 기록, 핵심은 아래 C-08 검사
    s.see_any("서버에 보냄 → '고마워요' 또는 시트가 닫힌 C-08", [
        ("고마워요", "'고마워요. 난이도 점수에 반영할게요'"),
        ("경유지로 안내", "이미 닫힘"),
    ], timeout=20)
    s.see("시트 닫힘 → C-08이 점수·근거를 그대로 (별점 응답에 없는 기록 수를 0으로 덮지 않음)",
          "최근 30일 · 차량", "평균 후진", absent=("고마워요", "아직 기록이 적어요", "기록 모으는 중"), timeout=15)


def r13_phone_link(s):
    """C-10 폰 연결(서버에 씀): 차가 코드를 띄우고 → 폰 역할(이 스크립트)이 POST /v1/pairings/<코드>/claim → 차 '폰과 연결됐어요'
    → C-10 '연결됨' → 시연 주차 → 폰 토큰으로 GET /v1/me/parkings (시연 기록은 폰으로도 안 감)"""
    s.prepare()
    s.tap("설정")
    n = s.see("C-10 '폰 연결 · 아직 연결 안 됨'", "폰 연결", "아직 연결 안 됨", timeout=10)
    s.tap("폰 연결", nodes=n)
    code_label = s.see_re("폰 연결 화면에 6자리 코드 · QR", r"^\d{3} \d{3}$", timeout=25)
    code = code_label.replace(" ", "")
    st, body = api("POST", f"/v1/pairings/{code}/claim", body={"phoneName": "시뮬레이션 폰"})
    phone = body.get("token") if isinstance(body, dict) else None
    s._record(f"폰 역할: POST /v1/pairings/{code}/claim → {st}", st == 200 and bool(phone), "200 + 폰 토큰", str(body)[:200], shot=False)
    if not phone:
        raise StepFailed("페어링 claim")
    s.see("차: '폰과 연결됐어요' · 시뮬레이션 폰 (2초마다 확인)", "폰과 연결됐어요", "시뮬레이션 폰", timeout=20)
    s.tap("확인")
    s.see("C-10 '폰 연결 · 연결됨 · 시뮬레이션 폰'", "연결됨", "시뮬레이션 폰", timeout=10)
    st, lst = api("GET", "/v1/me/parkings?limit=5", phone)
    before = len(lst.get("parkings", [])) if isinstance(lst, dict) else -1
    s.go_home()
    s.demo("flat-lot-simple", dest=False)
    s.see("시연 주차 → C-05", "1F에 대셨나요?", timeout=s.drive_timeout(75), shot=False)
    s.tap("맞아요")
    s.see("C-01", "최근 주차 위치", timeout=15, shot=False)
    time.sleep(3)
    st, lst = api("GET", "/v1/me/parkings?limit=5", phone)
    after = len(lst.get("parkings", [])) if isinstance(lst, dict) else -1
    s._record(f"폰 GET /v1/me/parkings → {st}, {before}건 → {after}건 (시연 기록은 폰·주차왕으로 안 보냄)",
              st == 200 and after == before == 0, "200 · 0건 → 0건", str(lst)[:200], shot=False)


def r14_example_records(s):
    """첫 실행 예시 기록(DemoSeed, 심사·시연용): 온보딩 뒤 홈이 채워져 있고 C-09 14건·월별 그래프·'예시 기록 포함' → C-12 동선"""
    s.wipe(seed=True)
    n = s.see("", "주차하다 헤맨 흔적이 지도가 돼요", timeout=25, quiet=True)
    s.tap("다음", nodes=n)
    n = s.see("", "주차 기록은 익명으로만 모여요", quiet=True)
    s.tap("나만 볼게요", nodes=n)
    s.tap("다음", nodes=n)
    n = s.see("", "운전한 지 얼마나 되셨어요?", quiet=True)
    s.tap("1~3년", nodes=n)
    s.tap("시작하기", nodes=n)
    s.see("C-01 첫 화면부터 채워짐 — 최근 주차 아브뉴프랑 B2 · D-07 (폰 시연 데이터와 같은 주차) · 자주 가는 곳",
          "최근 주차 위치", "B2", "D-07", "아브뉴프랑", "자주 가는 곳", absent=("이렇게 기록돼요",), timeout=20)
    s.tap("내 기록")
    n = s.see("C-09 예시 기록 13건 · 월별 그래프 · '예시 기록 포함'", "모은 기록", "13번", "예시 기록 포함", "H스퀘어", timeout=15)
    head = next((l for l, _, _ in n if "줄었어요" in l or "변화를" in l), "")
    s._record(f"C-09 머리말이 좋아진 것을 말함 — “{head}”", "줄었어요" in head, "'…줄었어요'", " | ".join(l for l, _, _ in n[:12]), shot=False)
    s.tap("H스퀘어")
    s.see("C-12 예시 기록도 동선 그림 · 그 날짜 제목", "주차 동선", "다시 보기", "닫기", absent=("오늘 주차 동선",), timeout=10)
    s.see_re("C-12 후진 횟수 (그 달 흐름에 맞춘 값)", r"^후진 \d+회$", timeout=5)
    s.tap("닫기")
    s.see("C-09로", "최근 기록", timeout=10, shot=False)


ROUTINES = [
    ("1", "첫 실행 → 백화점 지하 B2", "C-11 온보딩 → C-01 빈 홈 → C-02 ★4.3 → C-04 기록 중 → C-05 B2·후진 2회 → C-01", r1_first_day),
    ("2", "더 쉬운 곳으로 경유 (평행주차)", "C-02 → C-03 경유지로 안내 → C-04 경유지 배너 → C-05 1F·후진 1회 → C-01", r2_easier_lot),
    ("3", "구역 저장 → 폰으로 (평면 주차장)", "C-05 → C-06 B1·C·07 → C-07 QR·위치 링크 → C-01에 B1 · C-07", r3_zone_phone),
    ("4", "내 동선 다시 보기 (사선주차)", "C-05 → C-12 동선·사선주차·후진 0회 → 다시 보기 → 닫기 → C-05 → C-01", r4_replay),
    ("5", "층을 모를 때 (반 층 주차장)", "C-05 몇 층? → 8초 뒤 층 없이 저장 → C-01 → C-09 내 기록 → C-13 주차왕", r5_unknown_floor),
    ("6", "카드 끄기 설정 · 기록 지우기", "C-10 도착지 카드 끄기·주차 완료 카드 끄기 → C-02·C-05 없이 주행 → 홈에 B2 → C-10 기록 모두 지우기 → 빈 홈", r6_cards_off),
    ("7", "기록·주차장 상세", "C-09 기록 → C-12 → C-01 자주 가는 곳 → C-08 상세 → 별점 시트 열고 닫기", r7_history_detail),
    ("8", "주행 중 앱 내렸다 다시 열기", "C-04 기록 중 → 홈 키 → 다시 열기 → C-05 후진 2회 → C-01", r8_resume),
    ("9", "연속 두 번 주차 · 층 고치기", "C-05 맞아요 → 두 번째 C-05 다른 층이에요 → C-06 B3 → C-01 B3 → C-09 2번", r9_two_parkings),
    ("10", "지하에서 신호 끊김 (오프라인)", "서버 차단 → C-02 기기 데이터 → C-05 → C-07 긴 링크 → C-13 안내 → 복구 → 다시 시도", r10_offline),
    ("11", "주차왕 참여 (서버에 씀)", "C-13 다시 뽑기 → 참여할게요 → 이번 주 등수 → 서버 joined → C-01 한 줄 → 서버에서 참여 취소", r11_king_join),
    ("12", "별점 보내기 (서버에 씀)", "C-01 자주 가는 곳 → C-08 → 별점 ★4 → 고마워요 → 시트 닫힘", r12_rating),
    ("13", "폰 연결 (서버에 씀)", "C-10 폰 연결 → 코드 → (폰 역할) claim → 폰과 연결됐어요 → C-10 연결됨 → 시연 주차 → 폰에 0건", r13_phone_link),
    ("14", "예시 기록으로 첫 실행 (심사·시연용)", "앱 데이터 지움(예시 허용) → 온보딩 → C-01 아브뉴프랑 B2 D-07 → C-09 13건·머리말 → C-12 동선", r14_example_records),
]


# ---------------------------------------------------------------- 보고서

def write_report(out, sim, args):
    rows, sections = [], []
    for r in sim.results:
        passed = sum(c["ok"] for c in r["checks"])
        badge = '<b class="ok">통과</b>' if r["ok"] else '<b class="bad">실패</b>'
        rows.append(f'<tr><td><a href="#r{r["id"]}">{r["id"]}. {html.escape(r["title"])}</a></td><td>{badge}</td>'
                    f'<td>{passed}/{len(r["checks"])}</td><td>{r.get("secs", 0):.0f}초</td></tr>')
        cards = []
        for c in r["checks"]:
            img = (f'<a href="{c["img"]}"><img loading="lazy" src="{c["img"]}" alt=""></a>' if c["img"]
                   else '<div class="noimg">스크린샷 없음</div>')
            obs = f'<p class="obs">화면: {html.escape(c["observed"])}</p>' if c["observed"] else ""
            cards.append(f'<figure class="{"ok" if c["ok"] else "bad"}">{img}<figcaption>'
                         f'<span class="n">{r["id"]}-{c["n"]:02d} · {c["t"]:.0f}s</span> '
                         f'<b>{"✓" if c["ok"] else "✗"}</b> {html.escape(c["name"])}'
                         f'<p class="exp">{html.escape(c["expect"])}</p>{obs}</figcaption></figure>')
        video = f'<p><a href="{r["video"]}">화면 녹화 {r["video"]}</a></p>' if r.get("video") else ""
        err = f'<p class="bad">{html.escape(r["error"])}</p>' if r["error"] else ""
        sections.append(f'<section id="r{r["id"]}"><h2>{r["id"]}. {html.escape(r["title"])} {badge}</h2>'
                        f'<p class="flow">{html.escape(r["flow"])}</p>{err}{video}<div class="grid">{"".join(cards)}</div></section>')
    all_ok = all(r["ok"] for r in sim.results) and bool(sim.results)
    def frow(f):
        link = f'<a href="{f["img"]}">화면</a>' if f["img"] else ""
        return (f'<tr><td>{f["n"]}</td><td>{html.escape(f["kind"])}</td><td>{html.escape(f["text"])}</td>'
                f'<td>{html.escape(f["where"])}</td><td>{link}</td></tr>')
    frows = "".join(frow(f) for f in sim.findings)
    fsec = (f'<h2>자동 점검 발견 사항 {len(sim.findings)}건</h2><p class="flow">화면을 읽을 때마다 CLAUDE.md 규칙을 검사 — '
            f'카피 금지어 · 터치 영역 {MIN_TOUCH_DP}dp · 주행 중 터치. 루틴 통과/실패와 별개</p>'
            f'<table><tr><td>#</td><td>종류</td><td>내용</td><td>루틴-단계</td><td></td></tr>{frows}</table>'
            if sim.findings else '<p class="meta">자동 점검 발견 사항 없음 (카피 금지어 · 터치 영역 · 주행 중 터치)</p>')
    doc = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>주차각 시뮬레이션</title>
<style>
:root{{--bg:#f6f6f4;--card:#fff;--ink:#1d1d1b;--muted:#6b6b66;--line:#dcdcd6;--ok:#1d1d1b;--bad:#b3261e}}
@media (prefers-color-scheme:dark){{:root{{--bg:#141413;--card:#1f1f1d;--ink:#ececea;--muted:#9b9b95;--line:#34342f;--ok:#ececea;--bad:#ff8a80}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}}
main{{max-width:1280px;margin:0 auto;padding:24px 16px 64px}}
h1{{font-size:24px;margin:0 0 4px}} h2{{font-size:19px;margin:40px 0 4px}}
.meta,.flow,.exp,.obs,.n{{color:var(--muted)}} .flow{{margin:0 0 12px}}
table{{border-collapse:collapse;margin:16px 0}} td{{padding:6px 14px 6px 0;border-bottom:1px solid var(--line)}}
a{{color:inherit}} b.ok{{font-weight:700}} b.bad,.bad{{color:var(--bad)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}}
figure{{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}}
figure.bad{{border:2px solid var(--bad)}}
figure img{{display:block;width:100%;height:auto;border-bottom:1px solid var(--line)}}
.noimg{{padding:24px;color:var(--muted);border-bottom:1px solid var(--line)}}
figcaption{{padding:10px 12px}} figcaption p{{margin:4px 0 0;font-size:13px;word-break:break-all}}
</style></head><body><main>
<h1>주차각 시뮬레이션 루틴 — {'전부 통과' if all_ok else '실패 있음'}</h1>
<p class="meta">{time.strftime('%Y-%m-%d %H:%M')} · 기기 {html.escape(sim.dev.serial)} · 재생 ×{args.speed:g}
· 실행: <code>apps/vehicle/scripts/sim.sh {' '.join(args.routines)}</code></p>
<table>{''.join(rows)}</table>{fsec}{''.join(sections)}
</main></body></html>"""
    path = out / "report.html"
    path.write_text(doc, encoding="utf-8")
    (out / "findings.json").write_text(json.dumps(sim.findings, ensure_ascii=False, indent=1), encoding="utf-8")
    return path, all_ok


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="주차각 시뮬레이션 루틴 (에뮬레이터 UI 흐름 테스트)",
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("routines", nargs="*", default=["list"], help="1~14, all, list")
    ap.add_argument("--speed", type=float, default=2.0)
    ap.add_argument("--pause", type=float, default=1.0)
    ap.add_argument("--step", action="store_true")
    ap.add_argument("--keep-data", action="store_true")
    ap.add_argument("--record", action="store_true")
    ap.add_argument("--open", action="store_true")
    ap.add_argument("--serial")
    args = ap.parse_args()

    if args.routines in (["list"], []):
        log("시뮬레이션 루틴 (apps/vehicle/scripts/sim.sh <번호…|all>)")
        for rid, title, flow, _ in ROUTINES:
            log(f"  {rid}  {title}\n     {flow}")
        return 0
    want = [r[0] for r in ROUTINES] if "all" in args.routines else args.routines
    by_id = {r[0]: r for r in ROUTINES}
    bad = [w for w in want if w not in by_id]
    if bad:
        sys.exit(f"없는 루틴: {', '.join(bad)} — 1~{len(ROUTINES)} 또는 all")
    args.speed = min(8.0, max(0.25, args.speed))

    exe = find_adb()
    dev = Device(exe, pick_serial(exe, args.serial))
    if dev.sh("getprop sys.boot_completed").strip() != "1":
        sys.exit(f"{dev.serial} 부팅이 아직 안 끝났어요")
    if f"package:{PKG}" not in dev.sh(f"pm list packages --user {dev.user} {PKG}"):
        sys.exit("앱이 설치돼 있지 않아요 → apps/vehicle/scripts/run-app.sh")

    out = REPO_DIR / "captures" / time.strftime("sim-%Y%m%d-%H%M%S")
    out.mkdir(parents=True, exist_ok=True)
    log(f"기기 {dev.serial} (user {dev.user}) · 재생 ×{args.speed:g} · 결과 {out.relative_to(REPO_DIR)}/")
    log("에뮬레이터 화면을 보세요 — 지금부터 앱을 이 스크립트가 조작합니다.")

    sim = Sim(dev, out, args)
    try:
        for w in want:
            sim.run(by_id[w])
            write_report(out, sim, args)
    except KeyboardInterrupt:
        log("\n중단함")
        if sim.cur is not None and "secs" not in sim.cur:
            sim.cur["secs"] = time.time() - sim.cur["t0"]
            sim.cur["error"] = "사용자가 중단"
    path, all_ok = write_report(out, sim, args)

    log("")
    log("━━ 결과")
    for r in sim.results:
        passed = sum(c["ok"] for c in r["checks"])
        log(f"  {'✓' if r['ok'] else '✗'} {r['id']}. {r['title']}  {passed}/{len(r['checks'])}")
    if sim.findings:
        log(f"  자동 점검 발견 {len(sim.findings)}건:")
        for f in sim.findings:
            log(f"    ⚑ [{f['kind']}] {f['text']}  (루틴 {f['where']})")
    log(f"  보고서: {path}")
    if args.open:
        if sys.platform == "darwin":
            subprocess.run(["open", str(path)])
        else:
            webbrowser.open(path.as_uri())
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
