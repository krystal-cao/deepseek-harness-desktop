// Shared logic for updating the pinned @deepseek-ai/dsh* package family.
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Rewrite every direct @deepseek-ai/dsh* dependency pin to one version.
 * Returns the list of pins that changed.
 */
export function rewriteDshPins(pkg, version) {
  const changed = []
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const deps = pkg[section]
    if (!deps) continue
    for (const [name, spec] of Object.entries(deps)) {
      if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue
      if (spec !== version) {
        deps[name] = version
        changed.push(`${name}@${version}`)
      }
    }
  }
  return changed
}

/**
 * Split an npm allowScripts key (`@scope/name@1.2.3` or `name@1.2.3`) into
 * `{ name, version }`; unversioned keys return version: null.
 */
export function parseAllowScriptKey(key) {
  if (typeof key !== 'string') return null
  const at = key.startsWith('@') ? key.indexOf('@', 1) : key.indexOf('@')
  if (at <= 0) return { name: key, version: null }
  return { name: key.slice(0, at), version: key.slice(at + 1) }
}

/**
 * Rewrite pkg.allowScripts pins to the versions actually installed in
 * `installedRoot/node_modules`, so npm keeps allowing native builds after an
 * upstream bump changes the resolved dependency versions. Returns the count
 * of entries whose version changed.
 */
export function syncAllowScriptsVersions(pkg, installedRoot) {
  return syncAllowScriptsVersionsWithLookup(pkg, (name) => {
    try {
      return JSON.parse(
        readFileSync(path.join(installedRoot, 'node_modules', name, 'package.json'), 'utf8'),
      ).version
    } catch {
      return null
    }
  })
}

/**
 * Sync native build permissions from an npm lockfile. This is used by the
 * automated upstream bump path, where the lockfile is refreshed before the
 * new dependency tree is installed locally.
 */
export function syncAllowScriptsVersionsFromLock(pkg, lock) {
  const entries = Object.entries(lock?.packages ?? {})
  return syncAllowScriptsVersionsWithLookup(pkg, (name) => {
    const suffix = `/node_modules/${name}`
    const match = entries
      .filter(([key]) => key === `node_modules/${name}` || key.endsWith(suffix))
      .sort(([a], [b]) => a.length - b.length)[0]
    const packageInfo = match?.[1]
    if (!packageInfo?.resolved && !packageInfo?.integrity) return null
    return packageInfo.version ?? null
  })
}

function syncAllowScriptsVersionsWithLookup(pkg, lookupVersion) {
  const allowScripts = pkg.allowScripts ?? {}
  const next = {}
  let changed = 0
  for (const [key, value] of Object.entries(allowScripts)) {
    const parsed = parseAllowScriptKey(key)
    if (!parsed || !parsed.version) {
      next[key] = value
      continue
    }
    const resolvedVersion = lookupVersion(parsed.name)
    if (resolvedVersion && resolvedVersion !== parsed.version) {
      changed += 1
      next[`${parsed.name}@${resolvedVersion}`] = value
    } else {
      next[key] = value
    }
  }
  pkg.allowScripts = next
  return changed
}
