// Query the official @deepseek-ai/dsh version catalog from the npm registry.
import { DSH_ANY_VERSION_PATTERN } from './updater-config.js'

const REGISTRY_URL = 'https://registry.npmjs.org/@deepseek-ai/dsh'

/**
 * Fetch the official catalog, filtered to the 0.1.0-rc train the shell tracks.
 * Returns `{ latest, versions: [{ version, publishedAt }] }`.
 */
export async function fetchDshCatalog({ fetcher = fetch, timeoutMs = 15_000 } = {}) {
  const response = await fetcher(REGISTRY_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`无法查询官方 DSH 版本（HTTP ${response.status}）`)
  const data = await response.json()
  const versions = Object.keys(data.versions ?? {})
    .filter((version) => DSH_ANY_VERSION_PATTERN.test(version))
    .map((version) => ({ version, publishedAt: data.time?.[version] ?? null }))
  const latest = data['dist-tags']?.latest ?? ''
  if (!DSH_ANY_VERSION_PATTERN.test(latest) || !versions.some((item) => item.version === latest)) {
    throw new Error('npm registry 未返回有效的 latest 版本')
  }
  return { latest, versions }
}
