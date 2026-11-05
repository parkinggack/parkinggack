/**
 * libSQL (@libsql/client): 로컬은 file: SQLite, 배포는 Turso(libsql://). 모두 비동기.
 * 버전 붙은 SQL 마이그레이션 — 새 변경은 MIGRATIONS 끝에 { version: n+1, sql } 를 더한다 (이미 적용된 항목은 고치지 말 것).
 * 서버리스(Vercel)에서는 인스턴스 여러 개가 동시에 시작할 수 있어서, 한 마이그레이션은 한 트랜잭션(batch)으로 적용하고
 * 버전 행이 이미 있으면(다른 인스턴스가 먼저 적용) 실패를 무시하고 다시 확인한다.
 * 이 파일은 클라이언트를 만들지 않는다 — 로컬(Node)은 db-node.ts, Vercel(원격 Turso)은 vercel.ts.
 */
import type { Client } from '@libsql/client'

export type DB = Client

interface Migration {
  version: number
  name: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial',
    sql: `
      CREATE TABLE lots (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        aliases       TEXT NOT NULL DEFAULT '[]',
        lat           REAL NOT NULL,
        lng           REAL NOT NULL,
        address       TEXT,
        floors        TEXT NOT NULL,
        zone_scheme   TEXT NOT NULL,
        manual_tags   TEXT NOT NULL DEFAULT '[]',
        public_info   TEXT NOT NULL DEFAULT '[]',
        fee_text      TEXT,
        pitch         TEXT,
        suggestible   INTEGER NOT NULL DEFAULT 1,
        demo          INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        difficulty          REAL,
        tags                TEXT NOT NULL DEFAULT '[]',
        stat_chips          TEXT NOT NULL DEFAULT '[]',
        sample_count        INTEGER NOT NULL DEFAULT 0,
        score_sample_count  INTEGER NOT NULL DEFAULT 0,
        rating_count        INTEGER NOT NULL DEFAULT 0,
        stats               TEXT
      );
      CREATE TABLE records (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        client_record_id TEXT NOT NULL UNIQUE,
        lot_id           TEXT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
        floor            TEXT,
        reverse_count    INTEGER NOT NULL,
        steering_turns   INTEGER NOT NULL,
        brake_count      INTEGER,
        duration_sec     INTEGER NOT NULL,
        ramp_turns       REAL NOT NULL,
        shape            TEXT NOT NULL,
        approximate      INTEGER NOT NULL,
        vehicle_class    TEXT NOT NULL,
        experience       TEXT NOT NULL,
        parked_hour      INTEGER NOT NULL,
        parked_weekday   INTEGER NOT NULL,
        d                REAL NOT NULL,
        demo             INTEGER NOT NULL DEFAULT 0,
        received_ms      INTEGER NOT NULL
      );
      CREATE INDEX records_lot_time ON records(lot_id, received_ms);
      CREATE INDEX records_time ON records(received_ms);
      CREATE TABLE ratings (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        client_rating_id TEXT NOT NULL UNIQUE,
        lot_id           TEXT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
        stars            INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
        demo             INTEGER NOT NULL DEFAULT 0,
        created_ms       INTEGER NOT NULL
      );
      CREATE INDEX ratings_lot_time ON ratings(lot_id, created_ms);
      CREATE TABLE shares (
        code        TEXT PRIMARY KEY,
        payload     TEXT,
        created_ms  INTEGER NOT NULL,
        expires_ms  INTEGER NOT NULL
      );
      CREATE INDEX shares_expires ON shares(expires_ms);
      CREATE TABLE meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'v1.1 devices, pairing, my parkings, push, lot category/region, dashboard layouts',
    sql: `
      ALTER TABLE lots ADD COLUMN category TEXT NOT NULL DEFAULT 'OTHER';
      ALTER TABLE lots ADD COLUMN region TEXT NOT NULL DEFAULT 'other';
      CREATE INDEX lots_region ON lots(region);

      -- 기기 (차·폰). 토큰은 SHA-256(hex)만 저장
      CREATE TABLE devices (
        id          TEXT PRIMARY KEY,
        kind        TEXT NOT NULL CHECK (kind IN ('car', 'phone')),
        name        TEXT,
        token_hash  TEXT NOT NULL UNIQUE,
        car_id      TEXT,                 -- 폰: 연결된 차
        paired_ms   INTEGER,
        created_ms  INTEGER NOT NULL
      );
      CREATE INDEX devices_car ON devices(car_id);

      CREATE TABLE pairings (
        code        TEXT PRIMARY KEY,     -- 숫자 6자리
        car_id      TEXT NOT NULL,
        created_ms  INTEGER NOT NULL,
        expires_ms  INTEGER NOT NULL,
        claimed_ms  INTEGER,
        phone_id    TEXT,
        phone_name  TEXT
      );
      CREATE INDEX pairings_expires ON pairings(expires_ms);

      -- 내 주차 (차 → 서버 → 연결된 폰). 익명 집계(records)와 별개
      CREATE TABLE my_parkings (
        car_id      TEXT NOT NULL,
        id          TEXT NOT NULL,
        lot_id      TEXT,
        lot_name    TEXT NOT NULL,
        floor       TEXT,
        zone        TEXT,
        number      TEXT,
        note        TEXT,
        parked_ms   INTEGER NOT NULL,
        summary     TEXT,
        hints       TEXT NOT NULL,
        route       TEXT,
        path        TEXT NOT NULL,
        found_ms    INTEGER,
        created_ms  INTEGER NOT NULL,
        updated_ms  INTEGER NOT NULL,
        PRIMARY KEY (car_id, id)
      );
      CREATE INDEX my_parkings_car_time ON my_parkings(car_id, parked_ms);

      CREATE TABLE push_subscriptions (
        endpoint    TEXT PRIMARY KEY,
        device_id   TEXT NOT NULL,
        p256dh      TEXT NOT NULL,
        auth        TEXT NOT NULL,
        created_ms  INTEGER NOT NULL
      );
      CREATE INDEX push_device ON push_subscriptions(device_id);

      -- 대시보드 D-02: 도면(없으면 시드 레이아웃), 후진 잦은 곳, 도면 좌표에 맞춘 동선(층마다 한 행, JSON)
      CREATE TABLE lot_layouts (
        lot_id  TEXT NOT NULL,
        floor   TEXT NOT NULL,
        width   REAL NOT NULL,
        height  REAL NOT NULL,
        aisles  TEXT NOT NULL,
        ramps   TEXT NOT NULL,
        zones   TEXT NOT NULL,
        PRIMARY KEY (lot_id, floor)
      );
      CREATE TABLE lot_hotspots (
        lot_id      TEXT NOT NULL,
        floor       TEXT NOT NULL,
        rank        INTEGER NOT NULL,
        title       TEXT NOT NULL,
        detail      TEXT NOT NULL,
        avg_reverse REAL NOT NULL,
        x           REAL NOT NULL,
        y           REAL NOT NULL,
        r           REAL NOT NULL,
        PRIMARY KEY (lot_id, floor, rank)
      );
      CREATE TABLE lot_overlays (
        lot_id  TEXT NOT NULL,
        floor   TEXT NOT NULL,
        paths   TEXT NOT NULL,
        demo    INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (lot_id, floor)
      );
    `,
  },
  {
    version: 3,
    name: 'v1.1 shared settings, lot short name and ramp kind',
    sql: `
      ALTER TABLE lots ADD COLUMN short_name TEXT;            -- 대시보드 짧은 이름 (NULL 이면 이름 끝 "주차장"을 뗀 것)
      ALTER TABLE lots ADD COLUMN ramp_kind TEXT;             -- NONE · STRAIGHT · SPIRAL (NULL 이면 자동)

      -- 차마다 하나. 행이 없으면 기본값 (익명 기록 보냄 · 운전 경력 모름)
      CREATE TABLE car_settings (
        car_id           TEXT PRIMARY KEY,
        share_anonymous  INTEGER NOT NULL DEFAULT 1,
        experience       TEXT NOT NULL DEFAULT 'UNKNOWN',
        updated_ms       INTEGER NOT NULL
      );
    `,
  },
  {
    version: 4,
    name: 'v1.2 king (weekly community ranking): participants, weekly score snapshots',
    // 주차장 안 최고 속도(summary.maxSpeedKmh)는 my_parkings.summary JSON 안에 그대로 저장한다 (열을 따로 두지 않음)
    sql: `
      -- 참여자. 차 = 차 기기 id (차 한 대에 한 행, 그만두면 left_ms 만 채우고 남김) · 시연 = demo:<리그>:<번호>
      CREATE TABLE king_participants (
        id                TEXT PRIMARY KEY,
        car_id            TEXT UNIQUE,            -- 시연 참여자는 NULL
        nickname          TEXT NOT NULL,
        region            TEXT NOT NULL,
        experience        TEXT NOT NULL,          -- 참여할 때의 운전 경력 (다시 참여할 때까지 그대로)
        league_id         TEXT NOT NULL,          -- <region>:<experience>
        joined_ms         INTEGER NOT NULL,
        left_ms           INTEGER,
        demo              INTEGER NOT NULL DEFAULT 0,
        demo_maneuver     INTEGER,                -- 시연 참여자 점수 (매주 같음)
        demo_lots         INTEGER,
        demo_improvement  INTEGER
      );
      CREATE INDEX king_participants_league ON king_participants(league_id, left_ms);
      CREATE INDEX king_participants_region ON king_participants(region, left_ms);

      -- 끝난 주의 순위 (주가 바뀐 뒤 처음 요청 때·하루 정리 때 한 번 계산해서 고정)
      CREATE TABLE king_week_scores (
        league_id       TEXT NOT NULL,
        week_ms         INTEGER NOT NULL,         -- 그 주 월요일 00:00 KST
        participant_id  TEXT NOT NULL,
        car_id          TEXT,
        nickname        TEXT NOT NULL,
        demo            INTEGER NOT NULL DEFAULT 0,
        joined_ms       INTEGER NOT NULL,
        total           INTEGER NOT NULL,
        maneuver        INTEGER NOT NULL,
        lots_visited    INTEGER NOT NULL,
        improvement     INTEGER NOT NULL,
        rank            INTEGER NOT NULL,
        league_total    INTEGER NOT NULL,
        prev_rank       INTEGER,                  -- 그 전 주 등수 (같은 리그)
        pioneer         INTEGER NOT NULL DEFAULT 0,
        clean_week      INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (league_id, week_ms, participant_id)
      );
      CREATE INDEX king_week_scores_car ON king_week_scores(car_id, week_ms);
      CREATE TABLE king_weeks (
        week_ms      INTEGER PRIMARY KEY,
        computed_ms  INTEGER NOT NULL
      );
    `,
  },
]

/** ';' 로 나눔 (마이그레이션 SQL 에는 문자열 안 ';' 이 없다) */
function statements(sql: string): string[] {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function appliedVersions(db: DB): Promise<Set<number>> {
  await db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_ms INTEGER NOT NULL)')
  const rs = await db.execute('SELECT version FROM schema_migrations')
  return new Set(rs.rows.map((r) => Number(r.version)))
}

/** 적용 안 된 마이그레이션을 차례로 적용. 적용한 버전 목록을 돌려준다 */
export async function migrate(db: DB, migrations: Migration[] = MIGRATIONS): Promise<number[]> {
  const done = await appliedVersions(db)
  const applied: number[] = []
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (done.has(m.version)) continue
    try {
      await db.batch(
        [
          // 버전 행을 먼저 넣어서, 동시에 시작한 다른 인스턴스는 여기서 PRIMARY KEY 충돌로 통째로 되돌아간다
          { sql: 'INSERT INTO schema_migrations (version, name, applied_ms) VALUES (?, ?, ?)', args: [m.version, m.name, Date.now()] },
          ...statements(m.sql),
        ],
        'write',
      )
      applied.push(m.version)
    } catch (e) {
      if ((await appliedVersions(db)).has(m.version)) continue // 다른 인스턴스가 먼저 적용
      throw e
    }
  }
  return applied
}

export async function schemaVersion(db: DB): Promise<number> {
  const v = [...(await appliedVersions(db))]
  return v.length ? Math.max(...v) : 0
}
