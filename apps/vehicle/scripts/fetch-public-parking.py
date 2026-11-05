#!/usr/bin/env python3
"""
공공데이터포털 「전국주차장정보표준데이터」에서 판교 주변 주차장을 받아
apps/vehicle/app/src/main/java/com/parkinggack/app/data/PublicLots.kt 를 다시 만든다.
앱은 이 파일만 읽는다 (차에서는 네트워크 없이, 서비스 키는 앱에 넣지 않음).

  python3 apps/vehicle/scripts/fetch-public-parking.py              # 판교역 반경 3 km
  python3 apps/vehicle/scripts/fetch-public-parking.py --radius 5000
  python3 apps/vehicle/scripts/fetch-public-parking.py --dry-run    # 파일은 안 쓰고 목록만 출력

서비스 키 (일반 인증키, Decoding):
  환경 변수 DATA_GO_KR_KEY, 없으면 apps/vehicle/secrets.properties 의 DATA_GO_KR_KEY=...
  https://www.data.go.kr/data/15012896/standard.do 에서 활용신청(자동 승인) → 마이페이지 > 개발계정.
  새 키는 등록 후 바로 안 될 수 있다 (SERVICE_KEY_IS_NOT_REGISTERED_ERROR → 잠시 뒤 다시).

표준 라이브러리만 쓴다 (Python 3.8+).
"""
import argparse
import datetime as dt
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
VEHICLE = os.path.join(ROOT, "apps", "vehicle")
SECRETS = os.path.join(VEHICLE, "secrets.properties")
OUT = os.path.join(VEHICLE, "app", "src", "main", "java", "com", "parkinggack", "app", "data", "PublicLots.kt")
ENDPOINT = "https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api"

# 판교역
CENTER = (37.3947, 127.1112)
# 시드 주차장 이름의 핵심 낱말 — 받은 뒤 짝이 있는지 보여 주기만 한다 (짝 찾기는 앱의 PublicParking.match)
SEED_KEYS = ["현대백화점", "아브뉴프랑", "알파돔", "판교공영", "테크원", "H스퀘어", "백현마을"]
MAX_LOTS = 400


def load_key():
    key = os.environ.get("DATA_GO_KR_KEY", "").strip()
    if not key and os.path.exists(SECRETS):
        with open(SECRETS, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATA_GO_KR_KEY="):
                    key = line.split("=", 1)[1].strip()
    if key:
        # 포털의 '인코딩' 키(%2B, %2F …)를 넣어도 되게 풀어 둔다 — 요청할 때 다시 인코딩함
        return urllib.parse.unquote(key) if "%" in key else key
    sys.exit(
        "서비스 키가 없습니다. 환경 변수 DATA_GO_KR_KEY 또는 apps/vehicle/secrets.properties 에\n"
        "  DATA_GO_KR_KEY=<공공데이터포털 일반 인증키(Decoding)>\n를 넣어 주세요."
    )


def fetch_page(key, page, rows):
    q = urllib.parse.urlencode({"serviceKey": key, "pageNo": page, "numOfRows": rows, "type": "json"})
    req = urllib.request.Request(f"{ENDPOINT}?{q}", headers={"User-Agent": "parkinggack-fetch/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # 키 오류 등은 XML로 온다
        sys.exit(f"JSON이 아닌 응답 (page {page}):\n{raw[:600]}")
    if "OpenAPI_ServiceResponse" in data:
        h = data["OpenAPI_ServiceResponse"].get("cmmMsgHeader", {})
        sys.exit(f"API 오류: {h.get('errMsg')} / {h.get('returnAuthMsg')} (code {h.get('returnReasonCode')})")
    # 표준데이터 API는 {"header","body"}를 바로 준다 (다른 공공 API처럼 "response"로 감싸 오는 경우도 받음)
    resp = data.get("response", data)
    header = resp.get("header", {})
    if str(header.get("resultCode")) not in ("00", "0"):
        if str(header.get("resultCode")) == "03":  # NODATA_ERROR
            return [], 0
        sys.exit(f"API 오류: {header.get('resultCode')} {header.get('resultMsg')}")
    body = resp.get("body", {})
    items = body.get("items") or []
    if isinstance(items, dict):  # {"item": [...]} 형태 대비
        items = items.get("item") or []
        if isinstance(items, dict):
            items = [items]
    return items, int(body.get("totalCount") or 0)


def num(v):
    try:
        s = str(v).replace(",", "").strip()
        return int(float(s)) if s else None
    except (TypeError, ValueError):
        return None


def flt(v):
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


def hhmm(v):
    s = str(v or "").strip()
    if not s:
        return None
    if len(s) == 4 and s.isdigit():
        s = s[:2] + ":" + s[2:]
    return s


def pick(item, *names):
    for n in names:
        if n in item and str(item[n]).strip() != "":
            return item[n]
    return None


def meters(a, b):
    r = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def kt(s):
    if s is None:
        return "null"
    s = str(s).strip().replace("\\", "\\\\").replace('"', '\\"').replace("$", "\\$").replace("\n", " ")
    return f'"{s}"'


def ki(v):
    return "null" if v is None else str(v)


def to_lot(item):
    lat, lng = flt(pick(item, "latitude")), flt(pick(item, "longitude"))
    name = pick(item, "prkplceNm")
    if lat is None or lng is None or not name or not (33 < lat < 39 and 124 < lng < 132):
        return None
    return {
        "id": str(pick(item, "prkplceNo") or ""),
        "name": str(name).strip(),
        "category": pick(item, "prkplceSe"),
        "type": pick(item, "prkplceType"),
        "lat": lat,
        "lng": lng,
        "spaces": num(pick(item, "prkcmprt")),
        "feeKind": pick(item, "parkingchrgeInfo"),
        "baseMinutes": num(pick(item, "basicTime")),
        "baseFee": num(pick(item, "basicCharge")),
        "extraMinutes": num(pick(item, "addUnitTime")),
        "extraFee": num(pick(item, "addUnitCharge")),
        "dayPass": num(pick(item, "dayCmmtkt")),
        "open": hhmm(pick(item, "weekdayOperOpenHhmm")),
        "close": hhmm(pick(item, "weekdayOperColseHhmm", "weekdayOperCloseHhmm")),
        "ref": pick(item, "referenceDate"),
        "addr": pick(item, "rdnmadr", "lnmadr"),
    }


def write_kotlin(lots, radius, today):
    lines = [
        "// 자동 생성 파일 — 손으로 고치지 말 것. 다시 만들기: python3 apps/vehicle/scripts/fetch-public-parking.py",
        "// 출처: 공공데이터포털 전국주차장정보표준데이터 (공공누리 제1유형, 출처 표시)",
        f"// 판교역({CENTER[0]}, {CENTER[1]}) 반경 {radius} m, {len(lots)}곳, {today} 받음",
        "package com.parkinggack.app.data",
        "",
        "import com.parkinggack.app.model.LatLng",
        "",
        "object PublicLots {",
        "    /** 받은 날 (yyyy-MM-dd). 비어 있으면 아직 안 받음 */",
        f'    const val FETCHED_AT = "{today}"',
        "",
        "    val all: List<PublicLot> = listOf(",
    ]
    for p in lots:
        lines.append(
            "        PublicLot("
            f"{kt(p['id'])}, {kt(p['name'])}, {kt(p['category'])}, {kt(p['type'])}, "
            f"LatLng({p['lat']}, {p['lng']}), {ki(p['spaces'])}, {kt(p['feeKind'])}, "
            f"{ki(p['baseMinutes'])}, {ki(p['baseFee'])}, {ki(p['extraMinutes'])}, {ki(p['extraFee'])}, {ki(p['dayPass'])}, "
            f"{kt(p['open'])}, {kt(p['close'])}, {kt(p['ref'])}),"
        )
    lines += ["    )", "}", ""]
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--radius", type=int, default=3000, help="판교역에서 반경 (m), 기본 3000")
    ap.add_argument("--rows", type=int, default=1000, help="한 번에 받을 줄 수, 기본 1000")
    ap.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 목록만 출력")
    args = ap.parse_args()

    key = load_key()
    items, total = fetch_page(key, 1, args.rows)
    if not items:
        sys.exit("받은 데이터가 없습니다.")
    print(f"전체 {total}곳. 첫 줄의 칸: {sorted(items[0].keys())}")
    pages = math.ceil(total / args.rows)
    for page in range(2, pages + 1):
        time.sleep(0.2)
        more, _ = fetch_page(key, page, args.rows)
        items += more
        print(f"  {page}/{pages} 쪽 ({len(items)}곳)", end="\r", flush=True)
    print()

    near = []
    for it in items:
        p = to_lot(it)
        if p is None:
            continue
        d = meters(CENTER, (p["lat"], p["lng"]))
        if d <= args.radius:
            p["d"] = d
            near.append(p)
    # 같은 관리번호가 여러 번 오면 하나만
    seen, uniq = set(), []
    for p in sorted(near, key=lambda x: x["d"]):
        k = p["id"] or (p["name"], round(p["lat"], 5), round(p["lng"], 5))
        if k in seen:
            continue
        seen.add(k)
        uniq.append(p)
    if len(uniq) > MAX_LOTS:
        print(f"반경 안에 {len(uniq)}곳 → 가까운 {MAX_LOTS}곳만 넣습니다.")
        uniq = uniq[:MAX_LOTS]

    print(f"\n판교역 반경 {args.radius} m: {len(uniq)}곳")
    for p in uniq[:40]:
        fee = "무료" if (p["feeKind"] or "").strip() == "무료" else (
            f"{p['baseMinutes']}분 {p['baseFee']}원 / 추가 {p['extraMinutes']}분 {p['extraFee']}원"
            if p["baseFee"] is not None or p["extraFee"] is not None else "요금 칸 비어 있음")
        print(f"  {p['d']:6.0f} m  {p['name']}  [{p['category']} {p['type']} {p['spaces']}면]  {fee}  ({p['ref']})")
    print("\n시드 주차장 이름으로 찾기:")
    for k in SEED_KEYS:
        hits = [p for p in uniq if k.replace(" ", "") in p["name"].replace(" ", "")]
        print(f"  {k}: " + (", ".join(f"{p['name']} ({p['d']:.0f} m)" for p in hits[:3]) if hits else "없음"))

    if args.dry_run:
        print("\n--dry-run: 파일은 쓰지 않았습니다.")
        return
    today = dt.date.today().isoformat()
    write_kotlin(uniq, args.radius, today)
    print(f"\n썼습니다: {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
