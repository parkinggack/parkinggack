/**
 * Node(로컬 서버·CLI·테스트)용 libSQL 클라이언트. file: SQLite 는 네이티브 libsql 을 쓰고, 원격(Turso)도 된다.
 * Vercel 함수는 네이티브 모듈 없이 vercel.ts 에서 @libsql/client/http 를 쓴다.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '@libsql/client'
import { migrate, type DB } from './db.js'

/** 문자열 주소 → libSQL 클라이언트. file: 이면 폴더를 만든다 */
export function openDatabase(url: string, authToken?: string): DB {
  if (url.startsWith('file:')) mkdirSync(dirname(url.slice('file:'.length)), { recursive: true })
  return createClient({ url, authToken })
}

/** 열고 + 마이그레이션 + 로컬 파일이면 WAL·외래 키 */
export async function openAndMigrate(url: string, authToken?: string): Promise<DB> {
  const db = openDatabase(url, authToken)
  if (url.startsWith('file:')) {
    await db.execute('PRAGMA journal_mode = WAL')
    await db.execute('PRAGMA busy_timeout = 5000')
  }
  if (url.startsWith('file:') || url === ':memory:') await db.execute('PRAGMA foreign_keys = ON')
  await migrate(db)
  return db
}
