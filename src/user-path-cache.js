// Cache for the resolved user shell PATH. Loading a login shell profile
// (`zsh -ilc`) to discover Homebrew/nvm/... paths can take up to a second or
// three; the value almost never changes between launches, so the shell caches
// it on disk and refreshes it in the background after startup instead of
// blocking the first window on every boot.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const CACHE_FILE = 'user-path.json'

export function userPathCacheFile(userData) {
  return path.join(userData, CACHE_FILE)
}

/** Read the cached PATH string, or null when absent/unreadable/corrupt. */
export function readUserPathCache(userData) {
  try {
    const parsed = JSON.parse(readFileSync(userPathCacheFile(userData), 'utf8'))
    return typeof parsed.path === 'string' && parsed.path !== '' ? parsed.path : null
  } catch {
    return null
  }
}

/** Persist the resolved PATH atomically (temp file + rename). */
export function writeUserPathCache(userData, pathValue) {
  if (typeof pathValue !== 'string' || pathValue === '') return
  const file = userPathCacheFile(userData)
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, `${JSON.stringify({ path: pathValue }, null, 2)}\n`, { mode: 0o600 })
  renameSync(temp, file)
}