// Query the official @deepseek-ai/dsh version catalog from the npm registry.
import { DSH_ANY_VERSION_PATTERN, resolveNpmRegistry } from './updater-config.js'

const PACKAGE_PATH = '@deepseek-ai/dsh'

/**
 * Fetch the official catalog, filtered to the 0.1.0-rc train the shell tracks.
 * Returns `{ latest, versions: [{ version, publishedAt, tags }] }`.
 */
export async function fetchDshCatalog({
  fetcher = fetch,
  timeoutMs = 15_000,
  registry = resolveNpmRegistry(),
} = {}) {
  const base = registry.replace(/\/+$/, '')
  const response = await fetcher(`${base}/${PACKAGE_PATH}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`无法查询官方 DSH 版本（HTTP ${response.status}）`)
  const data = await response.json()
  const distTags = data['dist-tags'] ?? {}
  const tagsByVersion = new Map()
  for (const [tag, version] of Object.entries(distTags)) {
    if (typeof version !== 'string') continue
    const tags = tagsByVersion.get(version) ?? []
    tags.push(tag)
    tagsByVersion.set(version, tags)
  }
  const versions = Object.keys(data.versions ?? {})
    .filter((version) => DSH_ANY_VERSION_PATTERN.test(version))
    .map((version) => ({
      version,
      publishedAt: data.time?.[version] ?? null,
      tags: tagsByVersion.get(version) ?? [],
    }))
  // "latest" follows the npm `latest` dist-tag (the recommended version);
  // canary RCs on `next` stay visible in the list via their tags but are not
  // treated as the auto-follow/update target.
  const latest = distTags.latest ?? ''
  if (!DSH_ANY_VERSION_PATTERN.test(latest) || !versions.some((item) => item.version === latest)) {
    throw new Error('npm registry 未返回有效的 latest 版本')
  }
  return { latest, versions }
}
