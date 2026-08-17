// Persisted selection state for the DSH version manager.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const STATE_FILE = 'dsh-state.json'
export const DSH_STATE_SCHEMA_VERSION = 1

/**
 * Migrate a parsed state file to the current schema. v1 is the identity
 * migration; files written by a future schema are returned untouched so a
 * newer app's data is never downgraded or corrupted by this older shell.
 */
export function migrateDshState(parsed) {
  if (!parsed || typeof parsed !== 'object') return { schemaVersion: DSH_STATE_SCHEMA_VERSION }
  const version = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0
  if (version === DSH_STATE_SCHEMA_VERSION || version > DSH_STATE_SCHEMA_VERSION) return parsed
  return { ...parsed, schemaVersion: DSH_STATE_SCHEMA_VERSION }
}

export function dshStateFile(userData) {
  return path.join(userData, STATE_FILE)
}

export function readDshState(userData) {
  try {
    const migrated = migrateDshState(JSON.parse(readFileSync(dshStateFile(userData), 'utf8')))
    return {
      schemaVersion: DSH_STATE_SCHEMA_VERSION,
      selectedVersion: typeof migrated.selectedVersion === 'string' ? migrated.selectedVersion : null,
      dismissedLatest: typeof migrated.dismissedLatest === 'string' ? migrated.dismissedLatest : null,
      autoFollowLatest: migrated.autoFollowLatest !== false,
      npmRegistry: typeof migrated.npmRegistry === 'string' ? migrated.npmRegistry : null,
    }
  } catch {
    return {
      schemaVersion: DSH_STATE_SCHEMA_VERSION,
      selectedVersion: null,
      dismissedLatest: null,
      autoFollowLatest: true,
      npmRegistry: null,
    }
  }
}

export function writeDshState(userData, state) {
  const file = dshStateFile(userData)
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(
    temp,
    `${JSON.stringify({ schemaVersion: DSH_STATE_SCHEMA_VERSION, ...state }, null, 2)}\n`,
    { mode: 0o600 },
  )
  renameSync(temp, file)
}
