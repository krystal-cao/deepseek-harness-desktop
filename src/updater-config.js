// Pure update-feed and version helpers. This module never imports Electron so
// it can be unit-tested with plain `node --test`.

/** The npm version train the desktop wrapper follows upstream. */
export const DSH_VERSION_PATTERN = /^0\.1\.0-rc\.\d+$/

/**
 * Compare two dsh-style versions (`x.y.z` or `x.y.z-rc.n`). A stable release
 * outranks every rc of the same x.y.z. Returns false on unparsable input.
 */
export function isNewerVersion(candidate, current) {
  if (!candidate || !current) return false
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?/.exec(value.trim())
    if (!match) return null
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      rc: match[4] === undefined ? Infinity : Number(match[4]),
    }
  }
  const left = parse(candidate)
  const right = parse(current)
  if (!left || !right) return false
  for (const key of ['major', 'minor', 'patch', 'rc']) {
    if (left[key] !== right[key]) return left[key] > right[key]
  }
  return false
}

/**
 * Resolve the update feed. An explicit DSH_UPDATE_URL switches electron-updater
 * to a generic provider (useful for testing or a non-GitHub mirror); otherwise
 * the feed baked into app-update.yml at build time is used.
 */
export function resolveUpdateFeed(env = process.env) {
  return env.DSH_UPDATE_URL ? { provider: 'generic', url: env.DSH_UPDATE_URL } : undefined
}

/** Auto-check interval in milliseconds; overridable for tests. */
export function resolveAutoCheckIntervalMs(env = process.env, defaultMs = 4 * 60 * 60 * 1000) {
  const value = Number(env.DSH_UPDATE_CHECK_INTERVAL_MS)
  return Number.isFinite(value) && value > 0 ? value : defaultMs
}

/** Updates only run in packaged builds unless explicitly disabled. */
export function shouldEnableAutoUpdate(env = process.env, isPackaged = false) {
  if (env.DSH_DISABLE_AUTO_UPDATE === '1') return false
  return isPackaged
}

/**
 * Collapse electron-updater release notes (string, or the localized object
 * some providers deliver) into one readable string, preferring Chinese.
 */
export function formatReleaseNotes(info) {
  const notes = info?.releaseNotes
  if (typeof notes === 'string') return notes
  if (notes && typeof notes === 'object') {
    const zh = notes['zh-CN'] ?? notes.zh
    if (typeof zh === 'string') return zh
    const strings = Object.values(notes).filter((value) => typeof value === 'string')
    if (strings.length > 0) return strings.join('\n')
  }
  return ''
}
