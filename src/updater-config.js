// Pure update-feed and version helpers. This module never imports Electron so
// it can be unit-tested with plain `node --test`.

/** The npm version train the desktop wrapper follows upstream. */
export const DSH_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/

/** Any official dsh version the version manager may install (semver-ish). */
export const DSH_ANY_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/

/** Bundle identifier baked into the macOS app by electron-builder (build.appId). */
export const DESKTOP_BUNDLE_ID = 'io.github.krystal-cao.deepseek-harness-desktop'

/**
 * electron-builder derives the updater cache directory from the package name:
 * `sanitizedName.toLowerCase() + "-updater"`. electron-updater downloads the
 * macOS update into `<cache>/<this name>/update.zip`; our self-install must
 * only ever look inside that exact directory (never scan other apps' caches).
 */
export function resolveUpdaterCacheDirName(packageName = 'deepseek-harness-desktop') {
  return `${packageName}-updater`
}

/** Sort dsh version strings newest-first, comparing rc numbers numerically. */
export function sortDshVersions(versions) {
  return [...versions].sort((a, b) => (isNewerVersion(a, b) ? -1 : isNewerVersion(b, a) ? 1 : 0))
}

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

/**
 * npm registry used for the dsh version catalog and runtime installs. Defaults
 * to the domestic npmmirror mirror; set DSH_NPM_REGISTRY to switch (for
 * example back to the official https://registry.npmjs.org/). An explicit
 * configured value (from the in-app registry setting) wins over the env var.
 */
export function resolveNpmRegistry(env = process.env, configured) {
  return configured || env.DSH_NPM_REGISTRY || 'https://registry.npmmirror.com/'
}

/**
 * Normalize a user-supplied registry URL (http/https, single trailing slash),
 * or return null to clear the in-app override.
 */
export function normalizeNpmRegistry(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error('无效的镜像地址')
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (trimmed.length > 200) throw new Error('镜像地址过长')
  let url
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('镜像地址不是有效的 URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('镜像地址必须以 http:// 或 https:// 开头')
  }
  return `${trimmed.replace(/\/+$/, '')}/`
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
