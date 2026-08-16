// Persisted selection state for the DSH version manager.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const STATE_FILE = 'dsh-state.json'

export function dshStateFile(userData) {
  return path.join(userData, STATE_FILE)
}

export function readDshState(userData) {
  try {
    const parsed = JSON.parse(readFileSync(dshStateFile(userData), 'utf8'))
    return {
      schemaVersion: 1,
      selectedVersion: typeof parsed.selectedVersion === 'string' ? parsed.selectedVersion : null,
      dismissedLatest: typeof parsed.dismissedLatest === 'string' ? parsed.dismissedLatest : null,
    }
  } catch {
    return { schemaVersion: 1, selectedVersion: null, dismissedLatest: null }
  }
}

export function writeDshState(userData, state) {
  const file = dshStateFile(userData)
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, `${JSON.stringify({ schemaVersion: 1, ...state }, null, 2)}\n`, { mode: 0o600 })
  renameSync(temp, file)
}
