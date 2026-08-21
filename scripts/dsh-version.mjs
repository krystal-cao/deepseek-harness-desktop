// Shared logic for rewriting the pinned @deepseek-ai/dsh* version train.
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Rewrite every @deepseek-ai/dsh* dependency pin to one version.
 * Returns the list of pins that changed.
 */
export function rewriteDshPins(pkg, version) {
  const changed = []
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const deps = pkg[section]
    if (!deps) continue
    for (const [name, spec] of Object.entries(deps)) {
      if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) {
        if (spec !== version) {
          deps[name] = version
          changed.push(`${name}@${version}`)
        }
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
  const allowScripts = pkg.allowScripts ?? {}
  const next = {}
  let changed = 0
  for (const [key, value] of Object.entries(allowScripts)) {
    const parsed = parseAllowScriptKey(key)
    if (!parsed || !parsed.version) {
      next[key] = value
      continue
    }
    let installedVersion = null
    try {
      installedVersion = JSON.parse(
        readFileSync(path.join(installedRoot, 'node_modules', parsed.name, 'package.json'), 'utf8'),
      ).version
    } catch {
      // Package no longer installed; keep the original key.
    }
    if (installedVersion && installedVersion !== parsed.version) {
      changed += 1
      next[`${parsed.name}@${installedVersion}`] = value
    } else {
      next[key] = value
    }
  }
  pkg.allowScripts = next
  return changed
}

/**
 * Rewrite every @deepseek-ai/dsh* package entry in package-lock.json to target.
 * Updates root dependencies, nested package entries, resolved tarball URLs,
 * and internal package dependency constraints. Returns total entries changed.
 */
export function rewriteDshLockfile(lock, target) {
  let changed = 0
  const rewriteDeps = (deps) => {
    if (!deps) return
    for (const [k, v] of Object.entries(deps)) {
      if (k === '@deepseek-ai/dsh' || k.startsWith('@deepseek-ai/dsh-')) {
        if (typeof v === 'string') {
          const isCaret = v.startsWith('^')
          const nextVal = isCaret ? `^${target}` : target
          if (v !== nextVal) {
            deps[k] = nextVal
            changed++
          }
        }
      }
    }
  }

  if (lock.packages) {
    for (const [key, pkg] of Object.entries(lock.packages)) {
      if (key.includes('node_modules/@deepseek-ai/dsh')) {
        if (pkg.version !== target) {
          pkg.version = target
          if (typeof pkg.resolved === 'string') {
            pkg.resolved = pkg.resolved.replace(/\d+\.\d+\.\d+(?:-rc\.\d+)?/g, target)
          }
          delete pkg.integrity
          changed++
        }
      }
      rewriteDeps(pkg.dependencies)
      rewriteDeps(pkg.devDependencies)
      rewriteDeps(pkg.peerDependencies)
      rewriteDeps(pkg.optionalDependencies)
    }
  }

  return changed
}
