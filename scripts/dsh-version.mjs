// Shared logic for rewriting the pinned @deepseek-ai/dsh* version train.

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
