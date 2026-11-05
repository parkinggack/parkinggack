/**
 * 테스트 한 번에 시연 DB(약 3만 8천 건)를 한 번만 만들어 두고, 테스트 앱마다 파일을 복사해서 쓴다 (빠르고 서로 안 섞임).
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestProject } from 'vitest/node'
import { migrate } from '../src/db.js'
import { openDatabase } from '../src/db-node.js'
import { seedDatabase } from '../src/seed/index.js'
import { Store } from '../src/store.js'
import { NOW } from './now.js'

declare module 'vitest' {
  export interface ProvidedContext {
    templateDb: string
    tmpRoot: string
  }
}

export default async function setup(project: TestProject) {
  const root = mkdtempSync(join(tmpdir(), 'pg-test-'))
  mkdirSync(join(root, 'apps'), { recursive: true })
  const template = join(root, 'template.db')
  // WAL 없이 (파일 하나만 복사하면 되게)
  const db = openDatabase(`file:${template}`)
  await migrate(db)
  await seedDatabase(new Store(db, () => NOW))
  db.close()
  project.provide('templateDb', template)
  project.provide('tmpRoot', join(root, 'apps'))
  return () => rmSync(root, { recursive: true, force: true })
}
