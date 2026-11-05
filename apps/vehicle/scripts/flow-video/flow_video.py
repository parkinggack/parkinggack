#!/usr/bin/env python3
"""
주차각 화면 흐름 영상(RAW) 녹화 — 공모전 영상 편집용 원본 클립.

차 앱(Pleos 에뮬레이터)은 adb screenrecord(180초마다 파일을 이어 붙임), 폰 앱(배포본 웹)은 Playwright 로
같은 시각에 찍고, 클립마다 벽시계 시작 시각과 누른 순간들을 clips.json / manifest.md 에 남긴다 (편집 때 맞추기용).

  python3 apps/vehicle/scripts/flow-video/flow_video.py list
  python3 apps/vehicle/scripts/flow-video/flow_video.py car-onboarding car-main ...   하나씩
  python3 apps/vehicle/scripts/flow-video/flow_video.py all                           전부 (차 → 폰 시연 → 연결·주차·링크)
  python3 apps/vehicle/scripts/flow-video/flow_video.py manifest                      manifest.md 만 다시

옵션
  --out DIR        결과 폴더 (기본 captures/flow-videos/<YYYYMMDD-HHMM>, 같은 폴더에 이어 찍으려면 지정)
  --speed X        시연 재생 배속 (기본 1.5 — docs/run-locally.md 7장 시연 영상과 같음)
  --state-dir DIR  연결한 폰의 저장소(토큰 포함) 둘 곳 (기본 <out>/.state — 영상 폴더를 넘길 땐 지울 것)
  --serial ID      adb 기기

차 클립은 앱 데이터를 지우고(pm clear) 상태를 만든 뒤 찍는다. 운영 서버에 쓰는 것:
  share-link(C-07 짧은 링크) · car-rating(별점) · pair(폰 연결) · park-to-phone(실제 주행 기록 → 폰) · car-king(주차왕 참여 → 찍고 나서 참여 취소)
준비: 에뮬레이터 + 앱(run-app.sh), adb forward tcp:8088 tcp:8088 (park-to-phone), 이 폴더에서 npm i, brew install ffmpeg.
Virtual Console 브라우저 탭은 닫아 둘 것 (실제 주행이 차속을 덮어씀). 비행기 모드는 쓰지 않는다 (오프라인은 프록시).
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace

SCRIPT_DIR = Path(__file__).resolve().parent
SCRIPTS = SCRIPT_DIR.parent
REPO = SCRIPTS.parents[2]
sys.path.insert(0, str(SCRIPTS / "sim"))
import sim_routines as sr  # noqa: E402  (Device · Sim · api — 시뮬레이션 루틴과 같은 도구)

LIVE_DRIVE = SCRIPTS / "live-drive" / "live_drive_test.py"
DEMO_SH = SCRIPTS / "demo.sh"
PHONE_JS = SCRIPT_DIR / "phone_flows.mjs"
EXTRA_PATH = "/opt/homebrew/bin:/usr/local/bin"
ENV = dict(os.environ, PATH=EXTRA_PATH + os.pathsep + os.environ.get("PATH", ""))
FFMPEG = shutil.which("ffmpeg", path=ENV["PATH"]) or "ffmpeg"
FFPROBE = shutil.which("ffprobe", path=ENV["PATH"]) or "ffprobe"
NODE = shutil.which("node", path=ENV["PATH"]) or "node"
WEB = "https://parkinggack.vercel.app"


def log(msg=""):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def iso(t):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t)) + f".{int((t % 1) * 1000):03d}"


# ---------------------------------------------------------------- 차 화면 녹화 (screenrecord 를 180초마다 이어서)

class CarRec:
    R = "/sdcard/fv"

    def __init__(self, dev, out, size="1920x1080", bitrate=12_000_000):
        self.dev, self.out, self.size, self.bitrate = dev, out, size, bitrate
        self.proc = None

    def clock_offset(self):
        """기기 시계 - 맥 시계 (초). 왕복 시간의 가운데로"""
        best = None
        for _ in range(3):
            a = time.time()
            d = self.dev.sh("date +%s.%N").strip()
            b = time.time()
            try:
                off = float(d) - (a + b) / 2
            except ValueError:
                continue
            if best is None or (b - a) < best[1]:
                best = (off, b - a)
        return best[0] if best else 0.0

    def start(self):
        R = self.R
        self.dev.sh(f"pkill -INT screenrecord; rm -rf {R}; mkdir -p {R}")
        loop = (f"i=0; while [ ! -f {R}/stop ]; do i=$((i+1)); echo $i $(date +%s.%N) >> {R}/t.txt; "
                f"screenrecord --size {self.size} --bit-rate {self.bitrate} --time-limit 180 {R}/p$i.mp4; done")
        self.offset = self.clock_offset()
        self.proc = subprocess.Popen([self.dev.exe, "-s", self.dev.serial, "shell", loop],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            if self.dev.sh("pidof screenrecord").strip():
                break
            time.sleep(0.2)
        else:
            raise RuntimeError("screenrecord 가 시작되지 않음")
        time.sleep(1.0)  # 인코더가 첫 프레임을 내기까지

    def stop(self, name):
        R = self.R
        time.sleep(0.3)
        self.dev.sh(f"touch {R}/stop; pkill -INT screenrecord")
        try:
            self.proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        time.sleep(1.0)
        parts = []
        for line in self.dev.sh(f"cat {R}/t.txt").splitlines():
            m = re.match(r"(\d+)\s+([\d.]+)", line.strip())
            if m:
                parts.append((int(m.group(1)), float(m.group(2)) - self.offset))
        files = []
        for i, t in parts:
            dst = self.out / (f"{name}.mp4" if len(parts) == 1 else f"{name}-part{i}.mp4")
            self.dev.run("pull", f"{R}/p{i}.mp4", str(dst), timeout=120)
            if dst.exists() and dst.stat().st_size > 0:
                files.append((dst.name, t))
        if len(files) > 1:  # 편집용 한 파일 (부분 파일은 그대로 둔다)
            lst = self.out / f".{name}.concat.txt"
            lst.write_text("".join(f"file '{f}'\n" for f, _ in files))
            subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy",
                            "-movflags", "+faststart", str(self.out / f"{name}.mp4")], env=ENV)
            lst.unlink(missing_ok=True)
        self.dev.sh(f"rm -rf {R}")
        return dict(file=f"{name}.mp4", parts=[dict(file=f, start=t, startIso=iso(t)) for f, t in files],
                    start=files[0][1] if files else None, clockOffsetSec=round(self.offset, 3))


# ---------------------------------------------------------------- 폰 (phone_flows.mjs 를 파이프로)

class Phone:
    def __init__(self, flow, name, out, state=None, save_state=None):
        cmd = [NODE, str(PHONE_JS), flow, "--out", str(out), "--name", name]
        if state:
            cmd += ["--state", str(state)]
        if save_state:
            cmd += ["--save-state", str(save_state)]
        self.name = name
        self.cmd = cmd
        self.events = []
        self.cv = threading.Condition()
        self.p = subprocess.Popen(cmd, cwd=SCRIPT_DIR, env=ENV, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  text=True, bufsize=1)
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        for line in self.p.stdout:
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            with self.cv:
                self.events.append(ev)
                self.cv.notify_all()
            if ev.get("ev") in ("mark", "start", "error", "need"):
                log(f"      📱 {ev.get('ev')} {ev.get('label') or ev.get('key') or ev.get('message') or ''}")
        with self.cv:
            self.events.append({"ev": "exit"})
            self.cv.notify_all()

    def wait(self, pred, timeout):
        deadline = time.time() + timeout
        with self.cv:
            while True:
                for ev in self.events:
                    if pred(ev):
                        return ev
                left = deadline - time.time()
                if left <= 0:
                    return None
                self.cv.wait(left)

    def wait_mark(self, label, timeout=60):
        return self.wait(lambda e: (e.get("ev") == "mark" and e.get("label") == label) or e.get("ev") in ("error", "exit"),
                         timeout)

    def send(self, key, val):
        self.p.stdin.write(f"{key} {val}\n")
        self.p.stdin.flush()

    def finish(self, timeout=900):
        ev = self.wait(lambda e: e.get("ev") in ("done", "exit"), timeout)
        err = next((e for e in self.events if e.get("ev") == "error"), None)
        try:
            self.p.wait(timeout=60)
        except subprocess.TimeoutExpired:
            self.p.kill()
        done = next((e for e in self.events if e.get("ev") == "done"), None)
        return done, (err or {}).get("message")


# ---------------------------------------------------------------- 차 조작 (시뮬레이션 루틴의 Sim + 박자)

class FlowSim(sr.Sim):
    """sim_routines.Sim 그대로 + 누르기 전에 화면을 볼 틈(beat), 누른 시각 기록"""

    def __init__(self, dev, out, speed):
        args = SimpleNamespace(speed=speed, pause=0.0, step=False, keep_data=False, record=False)
        out.mkdir(parents=True, exist_ok=True)
        super().__init__(dev, out, args)
        self.marks = []

    def begin(self, name):
        self.cur = dict(id=name, title=name, flow="", checks=[], t0=time.time(), ok=False, error="", video="")
        self.results.append(self.cur)
        self.marks = []

    def mark(self, label):
        self.marks.append(dict(t=time.time(), label=label))

    def tap(self, label, timeout=15.0, nth=0, nodes=None, before=1.0):
        if before:
            time.sleep(before)
        self.mark(f"tap {label}")
        super().tap(label, timeout=timeout, nth=nth, nodes=nodes)

    def swipe(self, x1, y1, x2, y2, ms=700):
        self.mark(f"swipe {y1}->{y2}")
        self.dev.sh(f"input swipe {x1} {y1} {x2} {y2} {ms}")
        time.sleep(ms / 1000 + 0.6)

    def onboard_fast(self, share="나만 볼게요"):
        n = self.see("", "주차하다 헤맨 흔적이 지도가 돼요", timeout=25, quiet=True)
        super().tap("다음", nodes=n)
        n = self.see("", "주차 기록은 익명으로만 모여요", quiet=True)
        super().tap(share, nodes=n)
        super().tap("다음", nodes=n)
        n = self.see("", "운전한 지 얼마나 되셨어요?", quiet=True)
        super().tap("1~3년", nodes=n)
        super().tap("시작하기", nodes=n)
        self.see("", "내 주차", timeout=20, quiet=True)
        time.sleep(1.5)


def beat(s=1.2):
    time.sleep(s)


def live_drive_marks(stdout, ref_epoch):
    """live_drive_test.py 출력의 '[HH:MM:SS] 기어 D → R  (102.4s)' · '· parked (130.2s, …)' 줄 → 벽시계 마크.
    줄의 시각은 초 단위로 잘려 있으므로, 케이스 시작 시각을 모든 줄의 범위가 겹치는 곳으로 잡아 0.1초 안팎으로 맞춘다"""
    rows = []
    day = time.strftime("%Y-%m-%d", time.localtime(ref_epoch))
    for line in stdout.splitlines():
        m = re.match(r"\[(\d\d:\d\d:\d\d)\]\s+(기어 \S+ → \S+|· \w+)\s+\((\d+(?:\.\d+)?)s", line)
        if m:
            wall = time.mktime(time.strptime(f"{day} {m.group(1)}", "%Y-%m-%d %H:%M:%S"))
            rows.append((wall, float(m.group(3)), m.group(2).lstrip("· ")))
    if not rows:
        return []
    lo = max(w - c for w, c, _ in rows)
    hi = min(w + 1 - c for w, c, _ in rows)
    t0 = (lo + hi) / 2 if hi >= lo else lo
    return [dict(t=t0 + c, label=f"live {lab}") for _, c, lab in rows]


# ---------------------------------------------------------------- 클립

CLIPS = []  # (key, title, fn)


def clip(key, title):
    def deco(fn):
        CLIPS.append((key, title, fn))
        return fn
    return deco


class Runner:
    def __init__(self, dev, out, args):
        self.dev, self.out, self.args = dev, out, args
        self.sim = FlowSim(dev, out / "_sim", args.speed)
        self.rec = CarRec(dev, out)
        self.state_dir = Path(args.state_dir) if args.state_dir else out / ".state"
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.db = out / "clips.json"
        self.entries = json.loads(self.db.read_text()) if self.db.exists() else []
        self.server_writes = []

    # -- 기록

    def save(self, entry):
        self.entries = [e for e in self.entries if e.get("file") != entry["file"]] + [entry]
        self.db.write_text(json.dumps(self.entries, ensure_ascii=False, indent=1))

    def car_take(self, name, flow, screens, body, how, prep=None, phone=None):
        """prep() 으로 상태를 만든 뒤 녹화 시작 → body() → 녹화 끝. phone=(flow, name, kwargs) 면 폰도 같이"""
        log(f"━━ {name} — {flow}")
        if prep:
            prep()
        self.sim.begin(name)
        self.rec.start()
        t_rec = time.time()
        log(f"   ● 녹화 시작 {iso(t_rec)}")
        err = ""
        ph = None
        try:
            body(self)
        except Exception as e:  # noqa: BLE001 — 실패도 manifest 에 남김
            err = f"{type(e).__name__}: {e}"
            log(f"   ✗ {err}")
        finally:
            info = self.rec.stop(name)
        log(f"   ■ 녹화 끝 → {info['file']} ({len(info['parts'])}개 파일)")
        entry = dict(file=info["file"], device="car", flow=flow, screens=screens, how=how, start=info["start"],
                     startIso=iso(info["start"]) if info["start"] else None, parts=info["parts"],
                     clockOffsetSec=info["clockOffsetSec"], marks=self.sim.marks, error=err,
                     checks=[(c["name"], c["ok"]) for c in self.sim.cur["checks"] if c["name"]])
        self.save(entry)
        return entry

    def phone_entry(self, done, flow, screens, how, err=None):
        if not done:
            log(f"   ✗ 폰 클립 없음 ({err})")
            return
        self.save(dict(file=Path(done["mp4"]).name if done.get("mp4") else None, webm=Path(done["webm"]).name if done.get("webm") else None,
                       device="phone", flow=flow, screens=screens, how=how, start=done["start"] / 1000,
                       startIso=iso(done["start"] / 1000), marks=[dict(t=e["t"] / 1000, label=e["label"]) for e in done["events"]],
                       captureFps=done.get("captureFps"), error=err or ""))

    # -- 상태 만들기

    def at_home(self):
        n = self.dev.nodes()
        return sr.has(n, "내 주차") and (sr.has(n, "최근 주차 위치") or sr.has(n, "이렇게 기록돼요"))

    def ensure_home(self):
        self.sim.check_parked()
        if not self.at_home():
            self.sim.go_home()
        if not self.at_home():
            self.sim.prepare()

    def fresh(self, seed, share="나만 볼게요"):
        """앱 데이터 지움 → (seed: 예시 기록 13건) → 온보딩 빠르게 → 홈 (녹화 전)"""
        self.sim.begin("prep")
        self.sim.wipe(seed=seed)
        self.sim.onboard_fast(share)
        self.state = "seeded" if seed else "empty"

    def run_phone_only(self, flow, name, title, screens):
        log(f"━━ {name} (폰, 시연 데이터)")
        ph = Phone(flow, name, self.out)
        done, err = ph.finish()
        demo = "(처음 연 폰 — 시연 데이터 아님, 서버는 읽기만)" if flow == "onboarding" else "(시연 데이터 ?demo=1)"
        self.phone_entry(done, flow=f"{title} {demo}", screens=screens,
                         how=f"node apps/vehicle/scripts/flow-video/phone_flows.mjs {flow} --out <dir> --name {name}", err=err)


# ---- 차 앱 (빈 상태 → 시연 재생)

@clip("car-onboarding", "C-11 온보딩 3장 → C-01 빈 홈")
def c_onboarding(r):
    def prep():
        r.sim.begin("prep")
        r.sim.wipe(seed=False)
        r.sim.see("", "주차하다 헤맨 흔적이 지도가 돼요", timeout=25, quiet=True)
        beat(1.5)

    def body(r):
        s = r.sim
        beat(2.5)
        s.tap("다음", before=0)
        s.see("C-11 2/3", "주차 기록은 익명으로만 모여요", "익명 기록 보내기")
        beat(2.5)
        s.tap("익명 기록 보내기")
        s.tap("다음", before=1.2)
        s.see("C-11 3/3", "운전한 지 얼마나 되셨어요?", "1~3년")
        beat(2.0)
        s.tap("1~3년")
        s.tap("시작하기", before=1.2)
        s.see("C-01 빈 홈", "이렇게 기록돼요", "내 주차", timeout=15)
        beat(4.5)
    r.car_take("car-C11-onboarding", "C-11 온보딩 3장(익명 기록 보내기 · 1~3년) → C-01 빈 홈",
               "C-11 1/3 → C-11 2/3 → C-11 3/3 → C-01(빈 홈 '이렇게 기록돼요')", body,
               "flow_video.py car-onboarding (pm clear + 예시 기록 막음 → 앱이 C-11 1/3 에 선 뒤 녹화)", prep=prep)
    r.state = "empty"


def prep_drive(r):
    if getattr(r, "state", None) not in ("empty", "drives"):
        r.fresh(seed=False)
    r.ensure_home()
    beat(1.0)


@clip("car-main", "C-02 → C-04 → C-05 B2(HIGH) → C-12 → C-01 (메인 시연 재생)")
def c_main(r):
    def body(r):
        s = r.sim
        beat(2.0)
        s.mark("demo main (dest)")
        s.demo("pangyo-department-store", dest=True)
        s.see("C-02", "도착지 주차장은 조금 까다로워요", "괜찮아요, 그냥 갈게요")
        beat(3.5)
        s.tap("괜찮아요, 그냥 갈게요")
        s.see("C-04 배너", "도착지 주차", timeout=15)
        s.see("C-04 주차 기록 중", "주차 기록 중", timeout=s.drive_timeout(40))
        s.mark("주차 기록 중")
        s.see("C-04 후진 2", "후진 2", timeout=s.drive_timeout(80))
        s.see("C-05 B2", "B2에 대셨나요?", "후진 2회", timeout=s.drive_timeout(40))
        s.mark("C-05")
        beat(3.5)
        s.tap("동선 크게 보기")
        s.see("C-12", "오늘 주차 동선", "다시 보기")
        beat(3.5)
        s.tap("다시 보기")
        beat(6.5)
        s.tap("닫기")
        s.see("C-05", "B2에 대셨나요?", "맞아요", timeout=10)
        beat(1.5)
        s.tap("맞아요")
        s.see("C-01 B2", "최근 주차 위치", "B2", timeout=15)
        beat(4.0)
    r.car_take("car-C02-C05-main-drive", "도착지 난이도 카드 → 주행 배너 → 주차 기록 중(후진 셈) → 주차 완료 B2 → 동선 다시 보기 → 홈",
               "C-01 → C-02(★4.3 현대백화점) → C-04 배너 → C-04 '주차 기록 중 · 후진 1·2' → C-05 'B2에 대셨나요?'(HIGH) → C-12 동선 · 다시 보기 → C-05 → C-01(B2)",
               body, f"flow_video.py car-main (demo.sh main --speed {r.args.speed:g} 과 같은 인텐트)", prep=lambda: prep_drive(r))
    r.state = "drives"


@clip("car-easier", "C-02 → C-03 더 쉬운 곳 → 경유지로 안내 → C-04 → C-05 1F")
def c_easier(r):
    def body(r):
        s = r.sim
        beat(2.0)
        s.mark("demo parallel (dest)")
        s.demo("parallel-parking", dest=True)
        s.see("C-02", "도착지 주차장은 조금 까다로워요", "더 쉬운 곳 보기")
        beat(3.0)
        s.tap("더 쉬운 곳 보기")
        n = s.see("C-03", "더 쉬운 주차장", "걸어서", "경유지로 안내")
        beat(4.0)
        s.tap("경유지로 안내", before=0)
        s.see("C-04 경유지 배너", "경유지", timeout=20)
        s.see("C-04 주차 기록 중", "주차 기록 중", timeout=s.drive_timeout(40))
        s.see("C-05 1F", "1F에 대셨나요?", "후진 1회", timeout=s.drive_timeout(50))
        beat(3.5)
        s.tap("맞아요")
        s.see("C-01 1F", "최근 주차 위치", "1F", timeout=15)
        beat(4.0)
    r.car_take("car-C03-easier-lot-waypoint", "더 쉬운 주차장 → 경유지로 안내 → 경유지 주차장에 평행주차",
               "C-01 → C-02 → C-03(더 쉬운 주차장 · 걸어서 N분) → 경유지로 안내(Pleos 내비가 약 1초 앞으로) → C-04 '경유지 …' → 주차 기록 중 → C-05 1F 후진 1회 → C-01",
               body, f"flow_video.py car-easier (demo.sh parallel --speed {r.args.speed:g})", prep=lambda: prep_drive(r))
    r.state = "drives"


@clip("car-lowfloor", "C-05 LOW '몇 층에 대셨나요?' → 손대지 않으면 층 없이 저장")
def c_lowfloor(r):
    def body(r):
        s = r.sim
        beat(2.0)
        s.mark("demo split (no dest)")
        s.demo("split-level", dest=False)
        s.see("C-04 주차 기록 중", "주차 기록 중", timeout=s.drive_timeout(40))
        s.see("C-05 LOW", "몇 층에 대셨나요?", timeout=s.drive_timeout(50))
        s.mark("C-05 몇 층")
        s.see("카운트다운", "층 없이 저장돼요", timeout=5)
        s.see("자동 저장", "저장했어요", absent=("층 없이 저장돼요",), timeout=15)
        s.mark("저장했어요")
        beat(3.5)
        s.go_home()
        s.see("C-01 위치 미기록", "최근 주차 위치", "위치 미기록", timeout=15)
        beat(4.0)
    r.car_take("car-C05-low-floor-autosave", "층이 애매한 주차(반 층) → '몇 층에 대셨나요?' → 손대지 않으면 8초 뒤 층 없이 저장",
               "C-01 → C-04 주차 기록 중 → C-05 '몇 층에 대셨나요?'(LOW, 층 버튼) → '…초 뒤 층 없이 저장돼요' → '저장했어요' → C-01('위치 미기록')",
               body, f"flow_video.py car-lowfloor (demo.sh split --no-dest --speed {r.args.speed:g})", prep=lambda: prep_drive(r))
    r.state = "drives"


@clip("share-link", "(c) C-05 → C-06 구역 → C-07 QR·짧은 링크 → 폰이 링크를 엶 (연결 없이)")
def c_share(r):
    holder = {}

    def body(r):
        s = r.sim
        beat(2.0)
        s.mark("demo flat (no dest)")
        s.demo("flat-lot-simple", dest=False)
        s.see("C-04 주차 기록 중", "주차 기록 중", timeout=s.drive_timeout(35))
        s.see("C-05 1F", "1F에 대셨나요?", "구역도 기억하기", timeout=s.drive_timeout(40))
        beat(3.0)
        s.tap("구역도 기억하기")
        s.see("C-06", "주차 위치 기억하기", "구역", "기둥 번호", "저장")
        beat(2.5)
        s.tap("B1")
        s.tap("C", before=1.0)
        s.tap("07", before=1.0)
        beat(1.5)
        s.tap("저장")
        s.see("C-07", "폰으로 보내기", "parkinggack.vercel.app/", "닫기", timeout=25)
        s.mark("C-07")
        label = s.read(r"parkinggack\.vercel\.app/") or ""
        m = re.search(r"(parkinggack\.vercel\.app/\S+)", label)
        link = "https://" + m.group(1) if m else ""
        log(f"      C-07 링크: {label} → {link}")
        holder["link"] = link
        beat(2.0)
        if link:
            s.mark("phone opens link")
            ph = Phone("share", "share-link-phone", r.out)
            ph.send("link", link)
            holder["phone"] = ph.finish(timeout=120)
        beat(1.5)
        s.tap("닫기")
        s.see("C-01 B1 · C-07", "최근 주차 위치", "B1", "C-07", timeout=15)
        beat(4.0)
    e = r.car_take("share-link-car", "주차 → 구역 기억하기(C-06) → 폰으로 보내기(C-07 QR·짧은 링크) — 폰이 링크를 여는 동안 C-07 유지",
                   "C-01 → C-04 주차 기록 중 → C-05 1F → C-06 B1·C·07 → C-07 QR + 짧은 링크 → (폰 M-01·M-02) → 닫기 → C-01(B1 · C-07)",
                   body, f"flow_video.py share-link (demo.sh flat --no-dest --speed {r.args.speed:g}; 링크를 읽어 폰에 넘김)",
                   prep=lambda: prep_drive(r))
    r.state = "drives"
    if holder.get("link"):
        r.server_writes.append(f"C-07 공유 링크 1개 ({holder['link']}) — 시연 재생 기록(demo-)의 위치")
    done, err = holder.get("phone", (None, "링크를 못 읽음"))
    r.phone_entry(done, "C-07 링크를 연결 안 한 폰이 엶 (QR을 기본 카메라로 찍은 것과 같음)",
                  "/s/<code> 불러오는 중 → M-01 주차 위치(B1 · C-07) → M-02 돌아가는 길 → 차 찾았어요 → M-10",
                  f"flow_video.py share-link (phone_flows.mjs share, link={holder.get('link')})", err=err)
    if e.get("start") and done:
        log(f"   ⏱ 폰 시작 - 차 시작 = {done['start'] / 1000 - e['start']:.2f}s")


@clip("car-offline", "오프라인(프록시) — C-02 기기 데이터 → C-05 → C-07 긴 링크 → C-13 안내 → 복구")
def c_offline(r):
    def prep():
        r.dev.set_offline(True)
        r.fresh(seed=False)

    def body(r):
        s = r.sim
        try:
            beat(2.0)
            s.mark("demo main (dest, offline)")
            s.demo("pangyo-department-store", dest=True)
            s.see("C-02 오프라인", "도착지 주차장은 조금 까다로워요", "괜찮아요, 그냥 갈게요", timeout=30)
            beat(3.0)
            s.tap("괜찮아요, 그냥 갈게요")
            s.see("C-04 주차 기록 중", "주차 기록 중", timeout=s.drive_timeout(45))
            s.see("C-05 B2", "B2에 대셨나요?", "폰으로 보내기", timeout=s.drive_timeout(90))
            beat(3.0)
            s.tap("폰으로 보내기")
            s.see("C-07 긴 링크", "폰으로 보내기", "vercel.app/p/", "닫기", timeout=20)
            beat(4.5)
            s.tap("닫기")
            s.go_home()
            s.see("C-01", "최근 주차 위치", "B2", timeout=15)
            beat(2.0)
            s.tap("주차왕")
            s.see("C-13 오프라인", "인터넷에 연결되면 순위를 보여 드릴게요", "다시 시도", timeout=25)
            beat(4.0)
        finally:
            r.dev.set_offline(False)
            s.mark("proxy cleared (online)")
        beat(2.0)
        s.tap("다시 시도")
        s.see_any("C-13 복구", [("주차왕에 참여할까요?", "참여 전"), ("이번 주", "순위")], timeout=30)
        beat(4.0)
    try:
        r.car_take("car-offline-C02-C07-C13", "지하에서 신호가 끊긴 경우 — 서버 없이 C-02 · 주차 기록 · C-07(위치를 담은 긴 링크) · 주차왕 안내 → 연결되면 다시 시도",
                   "(오프라인) C-01 → C-02 기기 안 데이터 → C-04 → C-05 B2 → C-07 '…/p/…' 링크 → C-01 → C-13 '인터넷에 연결되면…' → (온라인) 다시 시도 → C-13 참여 카드",
                   body, "flow_video.py car-offline (settings put global http_proxy 127.0.0.1:9 → 끝나면 :0 + delete; 비행기 모드 아님)",
                   prep=prep)
    finally:
        r.dev.set_offline(False)
    r.state = "drives"


# ---- 차 앱 (예시 기록 13건)

def prep_seeded(r):
    if getattr(r, "state", None) != "seeded":
        r.fresh(seed=True)
    r.ensure_home()
    beat(1.0)


@clip("car-home", "C-01 홈 — 예시 기록으로 채워진 첫 화면")
def c_home(r):
    def body(r):
        beat(7.0)
    r.car_take("car-C01-home-examples", "예시 기록이 들어간 홈 (최근 주차 아브뉴프랑 B2 · D-07, 자주 가는 곳)",
               "C-01(최근 주차 위치 B2 · D-07 · 주차 동선 · 자주 가는 곳 · 주차왕 한 줄)", body,
               "flow_video.py car-home (pm clear → 첫 실행 예시 기록 13건 → 온보딩 넘긴 뒤 녹화)", prep=lambda: prep_seeded(r))


@clip("car-records", "C-09 내 기록 → C-12 다시 보기")
def c_records(r):
    def body(r):
        s = r.sim
        beat(1.5)
        s.tap("내 기록")
        s.see("C-09", "모은 기록", "13번", "예시 기록 포함", timeout=15)
        beat(5.0)
        s.tap("H스퀘어")
        s.see("C-12", "주차 동선", "다시 보기", "닫기", timeout=10)
        beat(3.5)
        s.tap("다시 보기")
        beat(6.5)
        s.tap("닫기")
        s.see("C-09", "최근 기록", timeout=10)
        beat(2.5)
        s.tap("홈")
        beat(2.5)
    r.car_take("car-C09-C12-records-replay", "내 기록(13건 · 월별 후진 · '…줄었어요') → 기록 하나 → 동선 다시 보기",
               "C-01 → C-09(모은 기록 13번 · 월별 그래프 · 예시 기록 포함) → C-12(H스퀘어 동선) → 다시 보기 → C-09 → C-01",
               body, "flow_video.py car-records (예시 기록 상태)", prep=lambda: prep_seeded(r))


@clip("car-rating", "C-08 주차장 상세 → 별점 시트 → 보내기 (운영 서버에 씀)")
def c_rating(r):
    got = {}

    def body(r):
        s = r.sim
        beat(2.0)
        n = r.dev.nodes()
        texts = [x[0] for x in n]
        # '자주 가는 곳' 줄: 주차장 이름 다음 줄이 '난이도 ★3.9 어려움'
        start = texts.index("자주 가는 곳") if "자주 가는 곳" in texts else 0
        lot, score = "현대백화점 판교점", None
        for i in range(start, len(texts) - 1):
            m = re.match(r"^난이도 ★(\d\.\d)", texts[i + 1])
            if m:
                lot, score = texts[i], m.group(1)
                break
        got["lot"] = lot
        same = [x for x in n if x[0] == lot]
        s.tap(lot, nth=len(same) - 1)
        s.see("C-08", "평균 후진", "별점 남기기", timeout=15)
        score = score or (s.read(r"^\d\.\d$"))
        stars = min(5, max(1, round(float(score)))) if score else 3
        got["stars"], got["score"] = stars, score
        beat(4.5)
        s.tap("별점 남기기")
        s.see("별점 시트", "이 주차장, 주차하기 어땠나요?", f"★{stars}", timeout=10)
        beat(3.5)
        s.tap(f"★{stars}")
        s.see_any("고마워요/닫힘", [("고마워요", "고마워요"), ("경유지로 안내", "닫힘")], timeout=20)
        got["sent"] = True
        beat(4.0)
        r.dev.back()
        s.mark("back")
        s.see("C-01", "최근 주차 위치", timeout=10)
        beat(2.5)
    r.car_take("car-C08-lot-detail-rating", "자주 가는 곳 → 주차장 상세(난이도 근거) → 별점 남기기 → 고마워요",
               "C-01 → C-08(점수 · 평균 후진 · 램프 · 경유지로 안내) → 별점 시트(★1~★5) → '고마워요' → C-08 → C-01",
               body, "flow_video.py car-rating (예시 기록 상태; 그 주차장 지금 점수에 가장 가까운 별을 보냄)", prep=lambda: prep_seeded(r))
    if got.get("sent"):
        r.server_writes.append(f"별점 1건: {got['lot']} ★{got.get('stars')} (그때 점수 {got.get('score')})")


@clip("car-settings", "C-10 설정")
def c_settings(r):
    def body(r):
        s = r.sim
        beat(1.5)
        s.tap("설정")
        s.see("C-10", "설정", "폰 연결", timeout=10)
        beat(4.0)
        s.swipe(1800, 1050, 1800, 450)
        beat(3.0)
        s.swipe(1800, 450, 1800, 1050)
        beat(2.0)
        s.tap("홈")
        beat(2.0)
    r.car_take("car-C10-settings", "설정 (카드 켜기/끄기 · 익명 기록 · 운전 경력 · 폰 연결 · 기록 모두 지우기)",
               "C-01 → C-10(위 → 아래로 넘겨 보기) → C-01", body, "flow_video.py car-settings (예시 기록 상태)",
               prep=lambda: prep_seeded(r))


# ---- 차 ↔ 폰 (운영 서버)

@clip("pair", "(a) C-10 › 폰 연결 코드·QR → 폰이 코드 입력 → 양쪽 '연결됐어요'")
def c_pair(r):
    holder = {}
    state = r.state_dir / "phone-paired.json"

    def prep():
        r.fresh(seed=True)  # 새 차 기기(토큰) — 예시 기록은 서버·폰으로 안 감
        r.ensure_home()

    def body(r):
        s = r.sim
        ph = Phone("pair", "pair-phone", r.out, save_state=state)
        holder["ph"] = ph
        ph.wait_mark("ready", timeout=60)
        beat(2.0)
        s.tap("설정")
        n = s.see("C-10", "폰 연결", "아직 연결 안 됨", timeout=10)
        beat(2.5)
        s.tap("폰 연결", nodes=n)
        label = s.see_re("폰 연결 코드", r"^\d{3} \d{3}$", timeout=25)
        code = label.replace(" ", "")
        holder["code"] = code
        s.mark(f"code {code}")
        beat(3.0)
        ph.send("code", code)
        s.see("차: 폰과 연결됐어요", "폰과 연결됐어요", timeout=60)
        s.mark("car: 폰과 연결됐어요")
        beat(4.0)
        s.tap("확인")
        s.see("C-10 연결됨", "연결됨", timeout=10)
        beat(3.0)
        holder["done"] = ph.finish(timeout=120)
        beat(1.0)
        s.tap("홈")
        beat(2.5)
    e = r.car_take("pair-car", "폰 연결 — 차가 6자리 코드·QR → 폰이 코드 입력 → '폰과 연결됐어요 · iPhone' → 설정 '연결됨'",
                   "C-01 → C-10('폰 연결 · 아직 연결 안 됨') → 폰 연결 화면(6자리 코드 + QR) → '폰과 연결됐어요 · iPhone' → 확인 → C-10('연결됨 · iPhone') → C-01",
                   body, "flow_video.py pair (차: 설정 › 폰 연결 · 폰: phone_flows.mjs pair 가 코드 입력)", prep=prep)
    done, err = holder.get("done", (None, "폰이 끝나지 않음"))
    r.phone_entry(done, "폰 연결 — 차 화면의 숫자 6자리를 입력 → 내 차와 연결됐어요 → 알림 받을게요 → 홈 · 설정 '연결됨'",
                  "M-13 차와 연결 → 코드 입력(6자리를 한 자씩) → M-14 내 차와 연결됐어요 → 알림 받을게요 → M-20 '주차하면 여기에…' → M-40 내 차 연결됨 → M-20",
                  "flow_video.py pair (phone_flows.mjs pair --save-state)", err=err)
    if holder.get("code"):
        r.server_writes.append(f"페어링 1건 (코드 {holder['code']}, 폰 이름 iPhone) — 새 차 기기 토큰 + 폰 토큰")
    if e.get("start") and done:
        log(f"   ⏱ 폰 시작 - 차 시작 = {done['start'] / 1000 - e['start']:.2f}s")
    r.state = "paired"


@clip("park-to-phone", "(b) 실제 주행(Virtual Console, b3) → 폰에 '지금 주차 중' B3")
def c_park(r):
    holder = {}
    state = r.state_dir / "phone-paired.json"

    def body(r):
        s = r.sim
        if not state.exists():
            raise RuntimeError("먼저 pair 를 찍을 것 (폰 저장소 없음)")
        ph = Phone("park", "park-to-phone-phone", r.out, state=state)
        ph.wait_mark("ready", timeout=60)
        beat(2.0)
        s.mark("live drive b3 start")
        cmd = [sys.executable, str(LIVE_DRIVE), "--cases", "b3", "--no-export", "--no-restart",
               "--out", str(r.out / "_live-drive")]
        log("      ▶ " + " ".join(cmd[1:]))
        lp = subprocess.run(cmd, cwd=REPO, env=ENV, capture_output=True, text=True)
        (r.out / "_live-drive").mkdir(exist_ok=True)
        (r.out / "_live-drive" / "stdout.txt").write_text(lp.stdout + "\n" + lp.stderr)
        for line in lp.stdout.splitlines():
            if any(k in line for k in ("PASS", "FAIL", "기어", "·", "결과", "✗", "!!")):
                log("      " + line)
        s.marks.extend(live_drive_marks(lp.stdout, time.time()))
        s.marks.sort(key=lambda m: m["t"])
        # rc=1 은 live_drive_test 의 '신호 충실도'(녹화 부하로 떨어질 수 있음) — 화면 검사 결과는 _live-drive/report.md
        s.mark(f"live drive b3 end (rc={lp.returncode})")
        holder["rc"] = lp.returncode
        holder["done"] = ph.finish(timeout=420)
        beat(2.0)
        r.ensure_home()
        beat(3.0)
    e = r.car_take("park-to-phone-car", "실제 주행(Virtual Console로 기어·차속·조향) → 지하 3층 주차 → 기록이 연결된 폰으로",
                   "C-01 → C-04 주행 → 램프 3바퀴 '주차 기록 중' → R(후방 카메라가 앱을 덮음, 정상) → C-04 후진 1·2 → P → C-05 'B3에 대셨나요?' 저장했어요 → 맞아요 → C-01(B3)",
                   body, "flow_video.py park-to-phone (live-drive/live_drive_test.py --cases b3 --no-export --no-restart)")
    done, err = holder.get("done", (None, "폰이 끝나지 않음"))
    r.phone_entry(done, "연결된 폰 홈에서 기다림 → 차가 주차하면(30초마다 확인) '지금 주차 중' B3 → 내 주차 위치 → 돌아가는 길",
                  "M-20 '주차하면 여기에…' → (토스트 'B3…에 주차했어요') M-20 지금 주차 중 B3 → M-01 → M-02 돌아가는 길 힌트 → 차 찾았어요 → M-20",
                  "flow_video.py park-to-phone (phone_flows.mjs park --state <pair 가 저장한 것>)", err=err)
    r.server_writes.append("실제 주차 기록 1건 (b3, B3 · 후진 2회) → PUT /v1/me/parkings (폰 동기화) · 폰 '차 찾았어요' POST …/found")
    if e.get("start") and done:
        log(f"   ⏱ 폰 시작 - 차 시작 = {done['start'] / 1000 - e['start']:.2f}s")


@clip("car-king", "C-13 주차왕 참여 화면 → 참여 → 순위판 (찍고 나서 서버에서 참여 취소)")
def c_king(r):
    def prep():
        if getattr(r, "state", None) not in ("paired",):
            log("   (연결·실제 주차 없이 찍음 — 순위판에 '나' 줄이 없을 수 있음)")
            prep_seeded(r)
        r.ensure_home()

    def body(r):
        s = r.sim
        beat(2.0)
        s.tap("주차왕")
        s.see("C-13 참여 전", "주차왕에 참여할까요?", "다시 뽑기", "참여할게요", timeout=25)
        beat(4.0)
        s.tap("다시 뽑기")
        beat(2.5)
        s.tap("참여할게요")
        s.see("C-13 순위", "이번 주", "후진·핸들", absent=("참여할게요",), timeout=30)
        s.mark("joined board")
        beat(7.0)
        s.tap("홈")
        beat(4.0)
    try:
        r.car_take("car-C13-king-join-board", "주차왕 — 참여 전 화면(닉네임 다시 뽑기 · 내 리그) → 참여할게요 → 이번 주 등수 · 점수 막대 · 순위판",
                   "C-01 → C-13 '주차왕에 참여할까요?'(닉네임 · 다시 뽑기) → 참여할게요 → C-13 이번 주 N등 · 후진·핸들/가 본 주차장/지난달보다 → C-01 주차왕 한 줄",
                   body, "flow_video.py car-king (pair · park-to-phone 다음 — 이번 주 실제 주차가 있어 '나' 줄이 보임)", prep=prep)
    finally:
        token = r.dev.car_token()
        if token:
            st, _ = sr.api("DELETE", "/v1/me/king", token)
            st2, me = sr.api("GET", "/v1/me/king", token)
            left = isinstance(me, dict) and me.get("joined") is False
            log(f"   ☞ 정리: DELETE /v1/me/king → {st}, 다시 보면 joined={me.get('joined') if isinstance(me, dict) else '?'}")
            r.server_writes.append(f"주차왕 참여 1건 → 찍은 뒤 DELETE /v1/me/king ({st}, joined={'false' if left else '?'})")


# ---- 폰 (시연 데이터, 서버에 쓰지 않음)

PHONE_DEMO = [
    ("onboarding", "phone-M10-M13-onboarding", "처음 실행 · 온보딩 · 차와 연결 화면", "M-10 시작(차가 칸에 듦) → M-11 → M-12 익명 기록(보낼게요) → M-13 차와 연결 → 코드 입력 → 뒤로 → 나중에 연결할게요 → M-20(연결 전 · 가까운 주차장)"),
    ("home", "phone-M20-home", "홈 (지금 주차 중)", "?demo=1 → M-20 홈(지금 주차 중 B2 · D-07 카드에 차가 드는 움직임 · 자주 가는 곳 · 좋아진 것)"),
    ("parking", "phone-M01-M02-parking", "주차 위치 + 돌아가는 길", "M-20 → M-01 내 주차 위치 B2 D-07 → M-02 돌아가는 길(그림 + 힌트 3단계) → 차 찾았어요 → M-20 '주차하면 여기에…'"),
    ("lots", "phone-M30-M31-lots", "주차장 목록 + 상세", "M-20 → M-30 주차장(쉬운 순/가까운 순) → M-31 현대백화점 판교점(근거 · 층별 혼잡) → 더 쉬운 곳 → 뒤로 ×2"),
    ("king", "phone-M50-M53-king", "주차왕 순위판 · 내 점수 · 주간 결과", "M-20 → 주차왕(M-53 지난주 결과가 올라옴 → 닫기) → M-50 순위판 → M-51 내 점수 → 순위로 → 리그 시트 → M-53 → 닫기"),
    ("kingJoin", "phone-M52-king-join", "주차왕 참여하기", "M-40 주차왕 그만두기 → M-52 참여 전(닉네임 다시 뽑기 ×2) → 참여할게요 → (M-53 → 닫기) → M-50"),
    ("records", "phone-M32-M33-records", "기록 · 통계 · 주차 동선", "M-20 → M-32 기록(이번 달 평균 후진 · 6개월 막대 · 목록) → M-33 주차 동선 → 다시 보기 → 뒤로"),
    ("settings", "phone-M40-settings", "설정", "M-20 → M-40 설정 → 운전 경력 → 뒤로 → 내 차(시연 중) › 시연 끝낼게요 → M-10"),
]


@clip("phone-demo", "폰 시연 데이터 둘러보기 8개 (?demo=1, 서버에 쓰지 않음)")
def c_phone_demo(r):
    want = r.args.phone_flows.split(",") if r.args.phone_flows else None
    for flow, name, title, screens in PHONE_DEMO:
        if want and flow not in want and name not in want:
            continue
        r.run_phone_only(flow, name, title, screens)


# ---- 보충 클립 (2026-11-05): 실제 D 주행 배너 · B3 직후 C-12 · 콘솔+앱 한 화면 · PC 대시보드/시안

sys.path.insert(0, str(SCRIPTS / "live-drive"))
import live_drive_test as ld  # noqa: E402  (Virtual Console API · b3 시나리오)

DESK_JS = SCRIPT_DIR / "desk_flows.mjs"
STEER_K = -1.0  # 콘솔 조향 → 앱 조향 배율 (이 이미지에서 확인된 값, live_drive_test 사전 점검과 같음)
BG = "0x0b0d0f"


def overlay(r, allow):
    """'다른 앱 위에 그리기'. 끄면 DrivePresenter 가 주행 중 내비를 앞으로 띄우지 않아 앱 안 C-04·C-05 가 그대로 보인다.
    (켜 두면 P 뒤에도 C-05 가 안 올라오는 문제가 있다 — docs/sim-findings.md 1-6)"""
    r.dev.sh(f"appops set --user {r.dev.user} {sr.PKG} SYSTEM_ALERT_WINDOW {'allow' if allow else 'ignore'}")


def console():
    con = ld.Console()
    con.start_heartbeat()
    time.sleep(1.2)
    if con.controls(0.5, 0, 0) != 200:  # 소수를 거부하는 콘솔이면 정수로
        con.int_only = True
    con.errors = 0
    return con


class Gps:
    """에뮬레이터 GPS(→ Pleos FusedLocation → 앱 지도 내 차 표시)를 차속대로 북쪽으로 옮김. heading 은 늘 0(북)이라 북쪽으로만.
    내비는 GPS 를 안 따라간다 (메모리: pleos-emulator-gps-control)"""

    def __init__(self, dev, lat, lng):
        self.dev, self.lat, self.lng, self._last = dev, lat, lng, 0.0
        self.fix(force=True)

    def fix(self, force=False):
        if force or time.time() - self._last >= 0.5:
            self.dev.run("emu", "geo", "fix", f"{self.lng:.6f}", f"{self.lat:.6f}", timeout=5)
            self._last = time.time()

    def tick(self, kph, dt):
        self.lat += kph / 3.6 * dt / 111_320
        self.fix()


def drive_profile(con, segs, marks=None, gps=None):
    """segs = [(초, 시작 km/h, 끝 km/h, 조향°, 기어)] 를 10 Hz 로 콘솔에. 별도 스레드에서 돌려도 됨. gps 면 차속대로 GPS 도"""
    gear = None
    for dur, v0, v1, steer, g in segs:
        if g != gear:
            con.gear(g)
            gear = g
            if marks is not None:
                marks.append(dict(t=time.time(), label=f"console gear {g}"))
        n = max(1, int(dur * 10))
        for i in range(n):
            v = v0 + (v1 - v0) * (i + 1) / n
            a = v1 - v0
            accel = (8 + 0.6 * v + 6 * max(0, a) / dur) if a > 0 else (4 + 0.4 * v if v > 0.5 else 0)
            brake = min(40, 10 + 4 * -a / dur) if a < 0 else (30 if v <= 0.5 and g != "P" else 0)
            con.controls(v, steer / STEER_K, brake, accel)
            if gps:
                gps.tick(v, 0.1)
            time.sleep(0.1)


def stream_case(con, meta, marks):
    """live_drive_test 의 케이스(b3 등) 신호를 10 Hz 로 그대로 — 검사·앱 끌어오기 없이 (화면은 녹화가 본다)"""
    rows, t0 = meta["rows"], time.time()
    cur, prev, i, n = None, None, 0, len(meta["rows"])
    while i < n:
        now = (time.time() - t0) * 1000
        if rows[i].t > now:
            time.sleep(min(0.05, (rows[i].t - now) / 1000))
            continue
        j = i
        while j + 1 < n and rows[j + 1].t <= now:
            j += 1
        row = rows[j]
        if row.gear != cur and row.gear in ld.GEAR_VC:
            con.gear(row.gear)
            marks.append(dict(t=time.time(), label=f"live gear {row.gear}"))
            cur = row.gear
        accel, brake = ld.pedals(row, prev)
        con.controls(row.v * 3.6, row.steer / STEER_K, brake, accel)
        prev, i = row, j + 1


GPS_HOME = (37.3947, 127.11208)  # 이 에뮬레이터의 원래 위치 (현대백화점 북쪽 약 230 m)
GPS_SOUTH = (37.3888, 127.11209)  # 현대백화점(37.3926, 127.1121) 남쪽 약 420 m — 같은 남북 도로에서 북쪽으로 달려 다가감


@clip("car-drive-banner", "실제 D 주행 중 C-04 '도착지 주차 ★4.3 어려움' 배너 (Virtual Console 차속 — 계기판에 D·km/h, 지도 위 내 차도 움직임)")
def c_drive_banner(r):
    con = console()
    gps = {}

    def prep():
        prep_drive(r)
        overlay(r, False)
        con.park()
        gps["g"] = Gps(r.dev, *GPS_SOUTH)
        beat(2.0)

    def body(r):
        s = r.sim
        beat(2.0)
        s.mark("demo main (dest) — 목적지·C-02 만, 시연 재생은 시작하지 않음")
        s.demo("pangyo-department-store", dest=True)
        s.see("C-02", "도착지 주차장은 조금 까다로워요", "괜찮아요, 그냥 갈게요")
        beat(3.0)
        th = threading.Thread(target=drive_profile, args=(con, [
            (1.5, 0, 0, 0, "D"), (6.0, 0, 32, 0, "D"), (5.0, 32, 32, 4, "D"), (4.0, 32, 28, -6, "D"),
            (6.0, 28, 28, 0, "D"), (5.0, 28, 0, 0, "D"), (1.5, 0, 0, 0, "D"), (1.0, 0, 0, 0, "P"),
        ], s.marks, gps.get("g")), daemon=True)
        th.start()
        time.sleep(9.0)
        s.see("C-04 '도착지 주차 ★4.3' (D · 차속)", "도착지 주차", "4.3", timeout=10)
        th.join()
        s.mark("console P")
        s.see("멈추고 P → C-02 로 돌아옴", "도착지 주차장은 조금 까다로워요", timeout=15)
        beat(3.0)

    try:
        r.car_take("car-C04-drive-banner-D", "실제로 D 로 달리는 중 — 주차각 C-04 배너 '도착지 주차 ★4.3 어려움' (왼쪽 계기판에 D · 차속)",
                   "C-02(★4.3 현대백화점, P) → 콘솔 D · 0→32 km/h → C-04 배너 '도착지 주차 ★4.3 어려움'(약 20초, 지도 위 내 차가 목적지 쪽으로 북상) → 감속 · P → C-02",
                   body, "flow_video.py car-drive-banner (시연 인텐트로 목적지만 넣고 재생은 안 함 + Virtual Console API 로 D·차속 · 앱 위 그리기 끔)",
                   prep=prep)
    finally:
        con.park()
        con.stop_heartbeat()
        overlay(r, True)
        Gps(r.dev, *GPS_HOME)
        r.dev.sh(f"am force-stop --user {r.dev.user} {sr.PKG}")  # 시연 목적지가 남지 않게
        r.state = None


@clip("car-b3-replay", "실제 주행 b3 → C-05 B3 → '동선 크게 보기' C-12 (그 B3 주차의 동선) → 다시 보기 → 맞아요")
def c_b3_replay(r):
    con = console()
    meta = ld.load_case("b3")

    def prep():
        r.fresh(seed=False)
        overlay(r, False)
        con.park()
        r.ensure_home()
        beat(1.0)

    def body(r):
        s = r.sim
        beat(2.0)
        s.mark("live drive b3 start")
        stream_case(con, meta, s.marks)
        s.mark("live b3 parked (P)")
        s.see("C-05 B3", "B3에 대셨나요?", timeout=20)
        beat(3.5)  # 자동 저장 '…저장했어요'까지 본 뒤
        s.tap("동선 크게 보기")
        s.see("C-12 (방금 B3 주차의 동선)", "주차 동선", "다시 보기", timeout=10)
        beat(4.0)
        s.tap("다시 보기")
        beat(7.5)
        s.tap("닫기")
        s.see("C-05", "B3에 대셨나요?", "맞아요", timeout=10)
        beat(1.5)
        s.tap("맞아요")
        s.see("C-01 B3", "최근 주차 위치", "B3", timeout=15)
        beat(3.0)

    try:
        r.car_take("car-B3-park-C12-replay", "실제 주행(Virtual Console, b3 지하 3층) → C-05 'B3에 대셨나요?' → 동선 크게 보기 → 그 B3 주차의 C-12 → 다시 보기 → 맞아요",
                   "C-01 → C-04 주행 → 램프 3바퀴 '주차 기록 중' → R(후방 카메라) → 후진 1·2 → P → C-05 B3 저장했어요 → C-12 동선 → 다시 보기 → 닫기 → 맞아요 → C-01(B3)",
                   body, "flow_video.py car-b3-replay (live_drive_test 의 b3 신호를 Virtual Console 로 10 Hz · 앱 위 그리기 끔 · '나만 볼게요'라 서버에 안 씀)",
                   prep=prep)
    finally:
        con.park()
        con.stop_heartbeat()
        overlay(r, True)


def compose(out, car_file, car_start, pc_file, pc_start, name):
    """콘솔(1280×720) + 차(1920×1080) → 나란히(1920×1080) · 겹쳐(차 전체 + 왼쪽 아래 콘솔)"""
    d = max(0.0, pc_start - car_start)
    car, pc = str(out / car_file), str(out / pc_file)
    side, pip = out / f"{name}-side-by-side.mp4", out / f"{name}-pip.mp4"
    enc = ["-c:v", "libx264", "-crf", "17", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"]
    pad = f"tpad=start_duration={d:.3f}:start_mode=add:color={BG}:stop_mode=clone:stop_duration=60"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", car, "-i", pc, "-filter_complex",
                    f"[0:v]fps=30,scale=960:540[c];[1:v]fps=30,scale=960:540,{pad}[v];"
                    f"[v][c]hstack=inputs=2:shortest=1,pad=1920:1080:0:270:color={BG}[o]",
                    "-map", "[o]", *enc, str(side)], env=ENV, check=True)
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", car, "-i", pc, "-filter_complex",
                    f"[0:v]fps=30,scale=1920:1080[c];[1:v]fps=30,scale=640:360,{pad}[v];"
                    f"[c][v]overlay=x=0:y=600:shortest=1[o]",
                    "-map", "[o]", *enc, str(pip)], env=ENV, check=True)
    return side.name, pip.name, d


@clip("console-drive", "Virtual Console 화면 + 차 화면 한 화면 — 콘솔에서 D·R 을 바꾸면 앱 '후진' 수가 오름")
def c_console(r):
    holder = {}

    def prep():
        r.fresh(seed=False)
        overlay(r, False)
        con = console()
        con.park()
        con.stop_heartbeat()  # 이제부터는 콘솔 페이지(탭)가 차를 움직인다
        r.ensure_home()
        beat(1.0)

    def body(r):
        s = r.sim
        beat(1.5)
        cmd = [NODE, str(DESK_JS), "vc", "--out", str(r.out.resolve()), "--name", "console-drive-console"]
        log("      ▶ " + " ".join(cmd[1:]))
        p = subprocess.Popen(cmd, cwd=SCRIPT_DIR, env=dict(ENV, FFMPEG=FFMPEG), stdout=subprocess.PIPE, text=True)
        for line in p.stdout:
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            if ev.get("ev") == "start":
                holder["start"] = ev["t"] / 1000
            elif ev.get("ev") == "mark":
                s.marks.append(dict(t=ev["t"] / 1000, label=ev["label"]))
                log(f"      🖥 {ev['label']}")
            elif ev.get("ev") in ("done", "error"):
                holder["done"] = ev
                if ev["ev"] == "error":
                    log(f"      ✗ {ev.get('message', '')[:300]}")
        p.wait()
        s.see("P → C-05", "에 대셨나요?", timeout=20)
        beat(2.0)

    try:
        e = r.car_take("console-drive-car", "콘솔 페이지에서 D·ACCEL·BRAKE·R 을 눌러 차를 굴림 → 차 화면 (R 이면 후방 카메라) → '주차 기록 중 · 후진 1 → 2' → P → C-05",
                       "C-01 → (콘솔 D · ACCEL) C-04 → (BRAKE · R) 후방 카메라 → (D) '주차 기록 중 · 후진 1' → (R) 카메라 → (D) '후진 2' → (P) C-05",
                       body, "flow_video.py console-drive (desk_flows.mjs vc 가 콘솔 페이지를 직접 누름 — 콘솔 탭의 물리 계산이 차속을 만든다 · 앱 위 그리기 끔)",
                       prep=prep)
    finally:
        overlay(r, True)
    done = holder.get("done") or {}
    if done.get("ev") != "done" or not holder.get("start"):
        log("   ✗ 콘솔 클립 없음")
        return
    r.save(dict(file="console-drive-console.mp4", webm="console-drive-console.webm", device="pc",
                flow="Pleos Virtual Console 페이지 (1280×720) — 위 차 클립과 같은 시각에 찍음",
                screens="콘솔 준비 → D · ACCEL · BRAKE → 조향 · R → D → R → D → P",
                how="node apps/vehicle/scripts/flow-video/desk_flows.mjs vc (Playwright recordVideo, 실시간)",
                start=holder["start"], startIso=iso(holder["start"]), marks=[m for m in r.sim.marks if m["label"].startswith("console")], error=""))
    side, pip, d = compose(r.out, e["file"], e["start"], "console-drive-console.mp4", holder["start"], "console-drive")
    for f, lay in ((side, "나란히 — 왼쪽 콘솔 · 오른쪽 차 (각 960×540, 위아래 여백)"), (pip, "겹쳐 — 차 화면 전체 + 왼쪽 아래(계기판 아래 차 그림 자리)에 콘솔 640×360")):
        r.save(dict(file=f, device="mix", flow=f"콘솔 + 차 한 화면: {lay}", screens="console-drive-car 와 같은 흐름",
                    how=f"ffmpeg 합성 (콘솔을 차 시작 기준 +{d:.2f}s 에 놓음 — 둘 다 이 맥의 벽시계)", start=e["start"],
                    startIso=iso(e["start"]), marks=e.get("marks", []), error=""))
    log(f"   ⧉ 합성 {side} · {pip} (콘솔 +{d:.2f}s)")


def run_desk(r, flow, name, title, screens):
    log(f"━━ {name} (PC)")
    cmd = [NODE, str(DESK_JS), flow, "--out", str(r.out.resolve()), "--name", name]
    p = subprocess.run(cmd, cwd=SCRIPT_DIR, env=dict(ENV, FFMPEG=FFMPEG), capture_output=True, text=True)
    evs = [json.loads(l) for l in p.stdout.splitlines() if l.startswith("{")]
    done = next((e for e in evs if e.get("ev") == "done"), None)
    err = next((e.get("message") for e in evs if e.get("ev") == "error"), None) or (p.stderr[-300:] if p.returncode else "")
    if not done:
        log(f"   ✗ {err}")
        return
    st = done["start"] / 1000
    r.save(dict(file=f"{name}.mp4", device="pc", flow=title, screens=screens,
                how=f"node apps/vehicle/scripts/flow-video/desk_flows.mjs {flow} (1920×1080 스크린샷을 한 장씩 → 30 fps)",
                start=st, startIso=iso(st),
                marks=[dict(t=st + e["t"] / 1000, label=e["label"]) for e in done.get("events", [])], error=""))


@clip("web-design", "시안 D-01 개요(판교 지도) → D-02 겹친 동선 → D-03 비교 · W-01 난이도 지도 (엔딩용)")
def c_web_design(r):
    run_desk(r, "design", "web-D01-D03-design", "PC 대시보드 시안 D-01 개요(판교 지도 · 까다로운 곳) → D-02 주차장 상세(1,284대 동선을 겹친 그림) → D-03 비교",
             "D-01(지도 · 순위) → 아래로 → D-02(겹친 동선 · 후진 지점) → 아래로 → D-03(9곳 표) → D-01")
    run_desk(r, "w01", "web-W01-design", "시안 W-01 난이도 지도 대시보드 (PT 비전 화면 · 예시 데이터)",
             "W-01(숫자 4칸 · 판교 난이도 지도 · 순위) → 아래로 '주차하다 헤맨 흔적이 진짜 주차장 지도가 돼요' → 위로")


@clip("web-dashboard", "배포된 PC 대시보드 D-10 난이도 한눈에 → D-11 주차장 상세 → D-12 데이터 내보내기")
def c_web_dashboard(r):
    run_desk(r, "dashboard", "web-D10-D12-dashboard", "배포된 PC 대시보드 https://parkinggack-data.vercel.app (시연용 예시 데이터)",
             "D-10 주차 난이도 한눈에(9곳 난이도 자 · 카드) → D-11 주차장 상세(층 평면 동선 · 후진 지점) → D-12 데이터 내보내기")


# ---------------------------------------------------------------- manifest

def probe(path):
    if not path.exists():
        return {}
    out = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration:stream=width,height,codec_name,avg_frame_rate,nb_frames",
                          "-of", "json", str(path)], capture_output=True, text=True, env=ENV).stdout
    try:
        j = json.loads(out)
    except json.JSONDecodeError:
        return {}
    st = (j.get("streams") or [{}])[0]
    return dict(duration=float(j.get("format", {}).get("duration", 0) or 0), width=st.get("width"), height=st.get("height"),
                codec=st.get("codec_name"), fps=st.get("avg_frame_rate"), frames=st.get("nb_frames"))


def fmt_dur(s):
    return f"{int(s // 60)}:{s % 60:04.1f}" if s else "?"


def write_manifest(out, server_writes=None):
    db = out / "clips.json"
    entries = json.loads(db.read_text()) if db.exists() else []
    # 폰만 따로 찍은 것(events.json)도
    known = {e.get("file") for e in entries}
    for ev in sorted(out.glob("*.events.json")):
        d = json.loads(ev.read_text())
        f = f"{d['name']}.mp4"
        if f in known or d.get("flow") in ("vc", "design", "w01", "dashboard"):  # PC 클립(desk_flows)은 clips.json 에 이미
            continue
        fl, title, screens = next(((fl, ti, sc) for fl, nm, ti, sc in PHONE_DEMO if nm == d["name"]), ("?", d["name"], ""))
        demo = "(처음 연 폰 — 시연 데이터 아님, 서버는 읽기만)" if fl == "onboarding" else "(시연 데이터 ?demo=1)"
        entries.append(dict(file=f, webm=f"{d['name']}.webm", device="phone", flow=f"{title} {demo}", screens=screens,
                            how=f"flow_video.py phone-demo --phone-flows {fl}  (= node apps/vehicle/scripts/flow-video/phone_flows.mjs {fl} --out <dir> --name {d['name']})",
                            start=d["start"] / 1000 if d.get("start") else None, startIso=iso(d["start"] / 1000) if d.get("start") else None,
                            marks=[dict(t=e["t"] / 1000, label=e["label"]) for e in d.get("events", [])], captureFps=d.get("captureFps"), error=""))
    if server_writes:
        (out / "server-writes.json").write_text(json.dumps(server_writes, ensure_ascii=False, indent=1))
    sw = json.loads((out / "server-writes.json").read_text()) if (out / "server-writes.json").exists() else []

    order = {"pair": 0, "park": 1, "share": 2}
    def key(e):
        f = e.get("file") or ""
        grp = 0 if f.startswith("car-") else 1 if f.startswith("phone-") else 2
        sub = next((v for k, v in order.items() if f.startswith(k)), 9)
        return (grp, sub, e.get("start") or 0)
    entries.sort(key=key)

    rows, details, total_s, total_b = [], [], 0.0, 0
    for e in entries:
        p = out / (e.get("file") or "")
        info = probe(p)
        size = p.stat().st_size if p.exists() else 0
        total_s += info.get("duration", 0)
        total_b += size
        res = f"{info.get('width')}×{info.get('height')}" if info else "?"
        dev = {"car": "차", "phone": "폰", "pc": "PC", "mix": "콘솔+차"}.get(e["device"], e["device"])
        rows.append(f"| `{e['file']}` | {dev} | {e['flow']} | {e['screens']} | {fmt_dur(info.get('duration', 0))} | {res} | {e.get('startIso') or '?'} |")
        extra = []
        if e.get("parts") and len(e["parts"]) > 1:
            extra.append("부분 파일(원본 그대로): " + ", ".join(f"`{p_['file']}` {p_['startIso']}" for p_ in e["parts"]))
            gaps = []
            for a, b in zip(e["parts"], e["parts"][1:]):
                da = probe(out / a["file"]).get("duration", 0)
                gaps.append(f"{b['start'] - (a['start'] + da):.1f}s")
            extra.append(f"이음매 빈틈 {', '.join(gaps)} — 합친 파일은 이음매 뒤가 그만큼 벽시계보다 앞당겨져 있음 (맞출 땐 부분 파일 시작 시각을 쓰면 정확)")
        if e.get("webm") and e["device"] == "pc":
            extra.append(f"Playwright recordVideo 원본 `{e['webm']}` (VP8) — mp4 는 이것을 30 fps H.264 로 바꾼 것")
        elif e.get("webm"):
            extra.append(f"Playwright 원본 `{e['webm']}` (1배 390×844, VP8) — 페이지를 연 순간부터라 mp4 보다 조금 일찍 시작")
        if e.get("captureFps"):
            extra.append(f"2배 프레임 {e['captureFps']}장/초로 찍어 30 fps H.264 로 묶음")
        if e.get("error"):
            extra.append(f"⚠ {e['error']}")
        st = e.get("start") or 0
        marks = "; ".join(f"{m['t'] - st:+.1f}s {m['label']}" for m in (e.get("marks") or []) if st)
        details.append(f"### `{e['file']}`\n- 만든 방법: {e['how']}\n" + "".join(f"- {x}\n" for x in extra)
                       + (f"- 누른 순간 (클립 시작 기준): {marks}\n" if marks else ""))

    md = [f"# 주차각 화면 흐름 RAW 클립 — {out.name}", "",
          f"클립 {len(entries)}개 · 합계 {fmt_dur(total_s)} · {total_b / 1e6:.0f} MB. 시각은 이 맥의 벽시계(KST). "
          "차 클립 시작 = 기기에서 screenrecord 를 띄운 시각(기기 시계를 맥 시계로 바꿈, 첫 프레임까지 ±0.5초), "
          "폰 클립 시작 = 2배 mp4 첫 프레임을 찍은 시각. 차↔폰 클립은 같은 시계라 시작 시각 차이만큼 밀어 맞추면 된다 "
          "(아래 '누른 순간'으로 확인 — 예: 폰 'type' 과 차 '폰과 연결됐어요').", "",
          "- 차: Pleos Connect 에뮬레이터 전체 화면 2560×1440 을 `screenrecord --size 1920x1080 --bit-rate 12000000` (H.264, 가변 프레임 — 화면이 바뀔 때만 프레임). "
          "앱은 오른쪽 칸 — 자르기는 편집에서. 180초가 넘는 것은 `-partN` 으로 이어 찍고 `ffmpeg -c copy` 로 한 파일도 만듦",
          "- 폰: https://parkinggack.vercel.app (배포본), 390×844 · 배율 2 · isMobile · hasTouch · iPhone UA. "
          "`page.screenshot` 2배 프레임 → 780×1688 30 fps H.264 mp4 (Playwright recordVideo 는 배율 2여도 390×844 로만 찍혀서), recordVideo webm 원본도 같이",
          "- 다시 찍기: `python3 apps/vehicle/scripts/flow-video/flow_video.py <클립 키…|all> --out <이 폴더>` (키는 `flow_video.py list`)",
          "- 곁다리 폴더(편집에는 안 씀): `_sim/` 차 클립마다 단계 확인 스크린샷 · `_live-drive/` 실제 주행 검사 보고서(report.md)·스크린샷·신호 로그 · `clips.json` 이 표의 원자료", "",
          "| 파일 | 기기 | 흐름 | 화면 순서 | 길이 | 해상도 | 시작(벽시계) |", "|---|---|---|---|---|---|---|"] + rows
    by_file = {e.get("file"): e for e in entries}
    sync = []
    for car_f, ph_f, cue in (("pair-car.mp4", "pair-phone.mp4", "폰 'phone connected' ↔ 차 'car: 폰과 연결됐어요'(차는 2초마다 확인)"),
                             ("park-to-phone-car.mp4", "park-to-phone-phone.mp4", "차 'live parked'(P) → 폰 'parking appeared'(30초마다 확인이라 최대 30초 늦음)"),
                             ("share-link-car.mp4", "share-link-phone.mp4", "차 'phone opens link' ↔ 폰 'open https://…/s/…'")):
        c, ph = by_file.get(car_f), by_file.get(ph_f)
        if c and ph and c.get("start") and ph.get("start"):
            sync.append(f"| `{car_f}` | `{ph_f}` | {ph['start'] - c['start']:+.2f}s | {cue} |")
    if sync:
        md += ["", "## 차 ↔ 폰 맞추기", "", "폰 클립을 차 클립 타임라인의 이 위치(차 시작 기준)에 놓으면 같은 순간이 된다. 확인용 순간은 아래 '누른 순간'에 둘 다 있다.", "",
               "| 차 | 폰 | 폰 시작 − 차 시작 | 맞춰 볼 순간 |", "|---|---|---|---|"] + sync
    md += ["", "## 편집할 때 알아둘 것", "",
           "- 시연 재생으로 주행이 시작되는 순간(C-02 '괜찮아요' 뒤 등) Pleos 내비가 약 1초 앞으로 떴다가 주차각이 다시 앞으로 온다 — 앱 동작(내비에 화면을 넘김)이라 그대로 둠. "
           "C-03 '경유지로 안내' 직후에도 같은 일이 있다",
           "- 실제 주행(park-to-phone-car)에서 기어 R 이면 Pleos 후방 카메라 화면이 앱을 덮는다 — 정상. 기록은 이어지고 R 이 끝나면 배너의 후진 수가 올라 있다",
           "- 차 mp4 는 가변 프레임(화면이 안 바뀌면 프레임이 없음) — 편집기가 싫어하면 `ffmpeg -i in.mp4 -vf fps=30 -c:v libx264 -crf 16 out.mp4` 로 고정 프레임으로",
           "- 폰 mp4 첫 프레임은 페이지가 막 그려진 때라 0.5초쯤 '불러오고 있어요'·애니메이션 중간이 보일 수 있다. webm(1배)은 빈 화면부터",
           "- 시연 재생 기록(id demo-…)·예시 기록(seed-…)은 서버·폰으로 가지 않는다. 폰에 뜨는 실제 주차는 park-to-phone 의 Virtual Console 주행 하나뿐",
           "- 화면 오른쪽 위 시계(오후 5:3x 등)는 녹화한 실제 시각"]
    files = set(by_file)
    extra_notes = []
    if files & {"car-C04-drive-banner-D.mp4", "car-B3-park-C12-replay.mp4", "console-drive-car.mp4"}:
        extra_notes.append("- 보충 차 클립(car-C04-drive-banner-D · car-B3-park-C12-replay · console-drive-car)은 '다른 앱 위에 그리기'를 끄고 찍었다 — 주행 중에도 앱 안 C-04 가 그대로 보이고 P 에서 C-05 가 바로 뜬다. "
                           "켜 두면 실제로는 Pleos 내비 + 위 배너가 되고 P 뒤 C-05 가 안 올라오는 문제가 있다 (docs/sim-findings.md 1-6)")
    if "car-C04-drive-banner-D.mp4" in files:
        extra_notes.append("- car-C04-drive-banner-D: 차는 진짜로 D (Virtual Console API — 왼쪽 Pleos 계기판에 D · 7→32 km/h). 목적지(현대백화점)는 시연 인텐트로 넣었고 재생은 시작하지 않았다. "
                           "지도 위 내 차는 GPS(adb emu geo fix)를 차속대로 북쪽으로 옮겨 목적지 쪽으로 다가간다(화살표는 늘 북쪽). 주행은 +10s(D) ~ +44s(P)")
    if "car-B3-park-C12-replay.mp4" in files:
        extra_notes.append("- car-B3-park-C12-replay: 20261104 의 park-to-phone 과 같은 b3 신호(같은 시나리오 파일)라 같은 B3 · 후진 2회 · 1분 47초 · C-12 '사선주차'. "
                           "앞쪽 주행은 어제 클립과 같으므로 P(+133s) 이후만 이어 붙이면 이야기가 이어진다. C-05 머리줄은 '수정구 시흥동'(목적지 없이 댄 주차라 내비 주소)")
    if files & {"console-drive-side-by-side.mp4", "console-drive-pip.mp4"}:
        extra_notes.append("- console-drive: 콘솔 페이지의 버튼(P·R·N·D, ACCEL·BRAKE, 조향)을 Playwright 가 눌렀다 — 콘솔 탭의 물리 계산이 차속을 만든다. "
                           "R→D 직후 1~2초 오른쪽 칸이 흰 화면인 것은 Pleos 후방 카메라 앱이 닫히는 중(아래 바의 카메라 아이콘이 켜져 있음) — 주차각 화면이 아니니 잘라도 된다. "
                           "P 뒤 C-05 가 '몇 층에 대셨나요?'인 것은 램프 없이 댄 주차라 층을 모르기 때문(정상)")
    if any((e.get("device") == "pc" and (e.get("file") or "").startswith("web-")) for e in entries):
        extra_notes.append("- web-*: 1920×1080 스크린샷을 한 장씩 찍어 30 fps 로 이어 붙임(스크롤이 매끈). 시안(D-01~03 · W-01)은 docs/design 그대로, 대시보드는 배포본 — 숫자는 모두 시연용 예시")
    if extra_notes:
        md += ["", "## 보충 클립 메모", ""] + extra_notes
    md += ["", "## 운영 서버에 쓴 것", ""] + ([f"- {w}" for w in sw] or ["- (없음)"])
    md += ["", "## 클립별 만든 방법 · 누른 순간", ""] + details
    (out / "manifest.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return out / "manifest.md", len(entries), total_s, total_b


# ---------------------------------------------------------------- main

ALL_ORDER = ["car-onboarding", "car-main", "car-easier", "car-lowfloor", "share-link", "car-offline",
             "car-home", "car-records", "car-rating", "car-settings", "pair", "park-to-phone", "car-king", "phone-demo"]


def main():
    ap = argparse.ArgumentParser(description="주차각 화면 흐름 RAW 영상 녹화", formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__)
    ap.add_argument("clips", nargs="*", default=["list"])
    ap.add_argument("--out")
    ap.add_argument("--speed", type=float, default=1.5)
    ap.add_argument("--state-dir")
    ap.add_argument("--serial")
    ap.add_argument("--phone-flows", help="phone-demo 중 일부만 (쉼표, 예: home,king)")
    args = ap.parse_args()

    if args.clips in (["list"], []):
        for k, t, _ in CLIPS:
            print(f"  {k:15s} {t}")
        print("  manifest        manifest.md 다시 만들기")
        return 0
    out = Path(args.out) if args.out else REPO / "captures" / "flow-videos" / time.strftime("%Y%m%d-%H%M")
    out.mkdir(parents=True, exist_ok=True)
    if args.clips == ["manifest"]:
        path, n, secs, size = write_manifest(out)
        print(f"{path} — {n}개, {fmt_dur(secs)}, {size / 1e6:.0f} MB")
        return 0
    want = ALL_ORDER if "all" in args.clips else args.clips
    by = {k: fn for k, _, fn in CLIPS}
    bad = [w for w in want if w not in by]
    if bad:
        sys.exit(f"모르는 클립: {bad} (list 참고)")

    exe = sr.find_adb()
    dev = sr.Device(exe, sr.pick_serial(exe, args.serial))
    r = Runner(dev, out, args)
    prev = out / "server-writes.json"
    if prev.exists():
        r.server_writes = json.loads(prev.read_text())
    log(f"기기 {dev.serial} (user {dev.user}) · 결과 {out}")
    try:
        for w in want:
            by[w](r)
            write_manifest(out, r.server_writes)
    finally:
        dev.set_offline(False)
        path, n, secs, size = write_manifest(out, r.server_writes)
        log(f"manifest: {path} — {n}개, {fmt_dur(secs)}, {size / 1e6:.0f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
