// Desktop wrapper around `dsh plugin --profile <name> <pnpm args>`: list, add
// and remove out-of-tree plugins in the web profile, plus a PATH shim so the
// CLI can always find pnpm (Finder/Dock launches have no shell PATH, and the
// bundled assets/bin shim only exists in packaged builds).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { bundledBinDir, withBundledBinPath } from './dsh-service.js'
import { resolvePnpmCli } from './dsh-versions.js'
import { resolveNpmRegistry } from './updater-config.js'

/**
 * Strip an optional @version range from a plugin spec, leaving the bare
 * package name (scoped names keep their @scope/). Used for registry
 * existence checks before a pnpm add.
 */
export function packageNameFromSpec(spec) {
  if (typeof spec !== 'string' || spec.length === 0) return null
  const at = spec.indexOf('@', spec.startsWith('@') ? 1 : 0)
  return at === -1 ? spec : spec.slice(0, at)
}

/**
 * Query the registry for a package name. Returns true when it exists, false
 * on an explicit 404, and null when the registry is unreachable (so callers
 * can skip the precheck and let pnpm produce the authoritative error).
 */
export async function npmPackageExists({
  name,
  registry = resolveNpmRegistry(),
  fetcher = fetch,
  timeoutMs = 8_000,
} = {}) {
  if (typeof name !== 'string' || name === '') return null
  const base = registry.replace(/\/+$/, '')
  try {
    const response = await fetcher(`${base}/${encodeURIComponent(name)}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status === 404) return false
    return response.ok
  } catch {
    return null
  }
}

export const DEFAULT_PROFILE = 'web'

// npm names (optionally scoped, optionally @version) and github:owner/repo
// specs. Conservative on purpose: anything a UI user types ends up as a pnpm
// argument, so flags, paths and shell metacharacters are rejected outright.
const NPM_SPEC = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[^\s/@]+)?$/
export const GITHUB_SPEC = /^github:[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/

/** The launcher args that run `dsh plugin --profile <name> <pnpm args>`. */
export function buildDshPluginArgs(entry, args, profile = DEFAULT_PROFILE) {
  return ['--expose-internals', entry, 'plugin', '--profile', profile, ...args]
}

/** Accept plugin specs typed into the desktop UI. */
export function validatePluginSpec(spec) {
  if (typeof spec !== 'string' || spec.length === 0 || spec.length > 200) return false
  if (spec.startsWith('-')) return false
  return NPM_SPEC.test(spec) || GITHUB_SPEC.test(spec)
}

/**
 * Parse `pnpm list --json` output into the profile's direct dependencies.
 * In-box @deepseek-ai/* bundles come from the dsh installation, not from the
 * profile, so they are filtered out of the user-facing plugin list.
 */
export function parsePnpmListJson(stdout) {
  let data
  try {
    data = JSON.parse(stdout)
  } catch {
    return { plugins: [], raw: stdout, path: null }
  }
  const projects = Array.isArray(data) ? data : [data]
  const root = projects[0]
  if (!root || typeof root !== 'object') return { plugins: [], raw: stdout, path: null }
  const plugins = Object.entries(root.dependencies ?? {})
    .filter(([name]) => !name.startsWith('@deepseek-ai/'))
    .map(([name, dep]) => ({
      name,
      version: typeof dep === 'string' ? dep : (dep?.version ?? null),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { plugins, raw: stdout, path: typeof root.path === 'string' ? root.path : null }
}

const LOCAL_SPEC_PATTERN = /^(file:|link:|workspace:|\.\.?\/)/

/**
 * Resolve the on-disk path a local (file:/link:/workspace:) spec for
 * `pluginName` points at, or null when the profile has no local spec for it.
 * Both the installed flag and the "move/upgrade the app" repoint decision
 * derive from this single source of truth.
 */
export function localSpecTarget(profileDir, pluginName) {
  if (!profileDir) return null
  let manifest
  try {
    manifest = JSON.parse(readFileSync(path.join(profileDir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
  const spec = manifest?.dependencies?.[pluginName]
  if (typeof spec !== 'string' || !LOCAL_SPEC_PATTERN.test(spec)) return null
  const target = spec.replace(/^(file:|link:|workspace:)/, '')
  return path.isAbsolute(target) ? path.resolve(target) : path.resolve(profileDir, target)
}

/**
 * True when the profile manifest pins `pluginName` to a file:/link: spec
 * whose target no longer exists (typically a dist build that was cleaned).
 * pnpm aborts any add/remove/update in the profile while such a dead local
 * spec is present, so the bundled bridge plugin must be repointed to a live
 * bundle path before plugin management can work again.
 */
export function profileLocalSpecIsMissing(profileDir, pluginName) {
  const target = localSpecTarget(profileDir, pluginName)
  return target !== null && !existsSync(target)
}

/**
 * Rewrite the profile manifest's dependency spec for `pluginName` to
 * `file:<targetDir>`. Returns true when the manifest was updated. Used to
 * repair stale bundled-bridge specs that point at deleted build output.
 */
export function repointLocalSpec(profileDir, pluginName, targetDir) {
  if (!profileDir || typeof targetDir !== 'string' || targetDir.length === 0) return false
  const manifestPath = path.join(profileDir, 'package.json')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return false
  }
  const deps = manifest?.dependencies
  if (!deps || typeof deps[pluginName] !== 'string') return false
  deps[pluginName] = 'file:' + targetDir
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  return true
}

/**
 * pnpm reports file:/link: dependencies with the spec path as their
 * "version". Resolve those against the profile directory and read the linked
 * package's real version, so the UI shows "v0.1.0" instead of a long path.
 */
export function resolveLocalPluginVersions(parsed) {
  if (!parsed?.path) return parsed
  const plugins = (parsed.plugins ?? []).map((plugin) => {
    if (typeof plugin.version !== 'string' || !LOCAL_SPEC_PATTERN.test(plugin.version)) return plugin
    const spec = plugin.version.replace(/^(file:|link:|workspace:)/, '')
    try {
      const manifest = JSON.parse(readFileSync(path.join(path.resolve(parsed.path, spec), 'package.json'), 'utf8'))
      return { ...plugin, version: typeof manifest.version === 'string' ? manifest.version : null, local: true }
    } catch {
      return { ...plugin, version: null, local: true }
    }
  })
  return { ...parsed, plugins }
}

/**
 * Attach each plugin's package description, read from the installed tree in
 * the profile (`<profile>/node_modules/<name>/package.json`). Best-effort
 * metadata only: missing or unreadable manifests yield a null description.
 */
export function enrichPluginMetadata(parsed) {
  if (!parsed?.path) return parsed
  const plugins = (parsed.plugins ?? []).map((plugin) => {
    let description = null
    try {
      const manifest = JSON.parse(
        readFileSync(path.join(parsed.path, 'node_modules', plugin.name, 'package.json'), 'utf8'),
      )
      description =
        typeof manifest.description === 'string' && manifest.description !== '' ? manifest.description : null
    } catch {
      // Descriptions are optional display metadata.
    }
    return { ...plugin, description }
  })
  return { ...parsed, plugins }
}

/** Run a dsh plugin subcommand (pnpm passthrough) and capture its output. */
export function runDshPluginCommand({
  electronExecutable,
  entry,
  args,
  env = process.env,
  timeoutMs = 120_000,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(electronExecutable, buildDshPluginArgs(entry, args), {
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`dsh plugin 命令超时（${timeoutMs}ms）`))
    }, timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stdout, stderr })
    })
  })
}

export function formatPnpmResultError(result, { maxLength = 800 } = {}) {
  const stderr = String(result?.stderr ?? '').trim()
  const stdout = String(result?.stdout ?? '').trim()
  const combined = [stdout, stderr].filter((part) => part !== '').join('\n')
  if (combined === '') return 'pnpm 退出码 ' + String(result?.code ?? 'unknown')
  return combined.slice(-maxLength)
}

let cachedShimDir = null

/**
 * In dev builds the packaged assets/bin is absent, so create a tiny `pnpm`
 * shim that runs the bundled pnpm CLI through Electron-as-Node. Cached for
 * the lifetime of the process.
 */
export function ensurePnpmShimDir({
  electronExecutable = process.execPath,
  pnpmCli,
} = {}) {
  if (cachedShimDir) return cachedShimDir
  const cli = pnpmCli ?? resolvePnpmCli()
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-pnpm-'))
  const escape = (value) => String(value).replaceAll('"', '\\"')
  writeFileSync(
    path.join(dir, 'pnpm'),
    `#!/bin/sh\nexec env ELECTRON_RUN_AS_NODE=1 "${escape(electronExecutable)}" "${escape(cli)}" "$@"\n`,
    { mode: 0o755 },
  )
  cachedShimDir = dir
  return dir
}

/**
 * Build the environment for plugin commands: prepend a directory with a
 * working `pnpm` (packaged assets/bin, or the dev shim) to PATH, so the dsh
 * plugin subcommand's pnpm passthrough always resolves.
 */
export function resolvePluginPnpmEnv({
  env = process.env,
  electronExecutable = process.execPath,
  isPackaged = typeof process.resourcesPath === 'string',
  pnpmCli,
} = {}) {
  const binDir = isPackaged ? bundledBinDir() : ensurePnpmShimDir({ electronExecutable, pnpmCli })
  return withBundledBinPath(env, binDir)
}

/**
 * dsh runs pnpm with the profile directory as cwd, so the registry must come
 * from that directory's .npmrc (pnpm ignores npm_config_registry env vars).
 * `dsh plugin ... list --json` reports the profile path; write the .npmrc
 * there so every later add/remove resolves against the configured registry.
 */
export function ensureProfileNpmrc(profileDir, registry = resolveNpmRegistry()) {
  if (!profileDir) return
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(
    path.join(profileDir, '.npmrc'),
    `registry=${registry}\nprefer-offline=true\naudit=false\n`,
  )
}

const MINIMUM_RELEASE_AGE_LINE = 'minimumReleaseAge: 0'

/**
 * The web profile is a pnpm workspace whose supply-chain policy uses a
 * built-in minimumReleaseAge default. That gate rejects freshly published
 * packages, so any pnpm add/remove in the profile fails when the lockfile
 * contains a young plugin (this is why the bundled desktop-host bridge could
 * never be installed). Relax only the release-age gate for the profile;
 * everything else in pnpm-workspace.yaml (excludes, allowBuilds, nodeLinker,
 * ...) is preserved verbatim.
 */
export function ensureProfilePnpmWorkspaceConfig(profileDir) {
  if (!profileDir) return
  mkdirSync(profileDir, { recursive: true })
  const file = path.join(profileDir, 'pnpm-workspace.yaml')
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    // Profile not initialized yet; `dsh plugin` creates it on first use.
    return
  }
  if (/^minimumReleaseAge:/m.test(content)) {
    const updated = content.replace(/^minimumReleaseAge:.*$/m, MINIMUM_RELEASE_AGE_LINE)
    if (updated !== content) writeFileSync(file, updated)
    return
  }
  writeFileSync(file, `${content.trimEnd()}\n\n${MINIMUM_RELEASE_AGE_LINE}\n`)
}

/** List the out-of-tree plugins installed in the profile. */
export async function listInstalledPlugins({
  electronExecutable,
  entry,
  env = process.env,
  timeoutMs = 60_000,
  registry,
} = {}) {
  const result = await runDshPluginCommand({
    electronExecutable,
    entry,
    args: ['list', '--json'],
    env,
    timeoutMs,
  })
  if (result.code !== 0) {
    throw new Error(`读取插件列表失败（退出码 ${result.code}）：${formatPnpmResultError(result, { maxLength: 500 })}`)
  }
  const parsed = parsePnpmListJson(result.stdout)
  ensureProfileNpmrc(parsed.path, registry)
  return enrichPluginMetadata(resolveLocalPluginVersions(parsed))
}

/**
 * Parse `pnpm outdated --json` output into a name → update-info map. Entries
 * of other dependency types (devDependencies, ...) are ignored; malformed
 * output degrades to an empty map so the UI can still show the plugin list.
 */
export function parsePnpmOutdatedJson(stdout) {
  let data
  try {
    data = JSON.parse(stdout)
  } catch {
    return { outdated: {}, raw: stdout }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { outdated: {}, raw: stdout }
  }
  const outdated = {}
  for (const [name, info] of Object.entries(data)) {
    if (!info || typeof info !== 'object') continue
    if (info.dependencyType && info.dependencyType !== 'dependencies') continue
    outdated[name] = {
      current: typeof info.current === 'string' ? info.current : null,
      latest: typeof info.latest === 'string' ? info.latest : null,
      wanted: typeof info.wanted === 'string' ? info.wanted : null,
      deprecated: Boolean(info.isDeprecated),
    }
  }
  return { outdated, raw: stdout }
}

/**
 * Query which installed plugins have newer registry versions. pnpm exits 0
 * when everything is current and 1 when outdated entries exist, so both are
 * valid; anything above 1 (or unparseable stdout) is an error.
 */
export async function listPluginUpdates({
  electronExecutable,
  entry,
  env = process.env,
  timeoutMs = 60_000,
} = {}) {
  const result = await runDshPluginCommand({
    electronExecutable,
    entry,
    args: ['outdated', '--json'],
    env,
    timeoutMs,
  })
  if (result.code > 1) {
    throw new Error(`检测插件更新失败（退出码 ${result.code}）：${formatPnpmResultError(result, { maxLength: 500 })}`)
  }
  return parsePnpmOutdatedJson(result.stdout).outdated
}

/** Add an out-of-tree plugin to the profile (`dsh plugin ... add <spec>`). */
export async function addPlugin({
  electronExecutable,
  entry,
  spec,
  env = process.env,
  timeoutMs = 120_000,
  registry,
} = {}) {
  // Fail fast for npm-registry plugins that do not exist: pnpm's 404 is
  // only visible in a wall of progress output, so a cheap existence check
  // gives the UI a clear, immediate message. GitHub and file:/link: specs
  // are skipped (no registry name to check); an unreachable registry is
  // skipped too and left for pnpm to report.
  const bareName = packageNameFromSpec(spec)
  if (bareName && !GITHUB_SPEC.test(spec)) {
    const exists = await npmPackageExists({ name: bareName, registry })
    if (exists === false) {
      throw new Error(`未找到 npm 包 ${bareName}（HTTP 404），请检查拼写或确认该包已发布到当前镜像`)
    }
  }
  const listed = await listInstalledPlugins({ electronExecutable, entry, env, timeoutMs, registry })
  ensureProfileNpmrc(listed.path, registry)
  ensureProfilePnpmWorkspaceConfig(listed.path)
  return runDshPluginCommand({ electronExecutable, entry, args: ['add', spec], env, timeoutMs })
}

/**
 * Update an installed npm-registry plugin to its latest version
 * (`dsh plugin ... update <name> --latest`). The dedicated update path avoids
 * re-adding the spec, so registry ranges are resolved by pnpm instead of
 * force-installing a literal `@latest` tag. GitHub-source plugins cannot be
 * updated this way and must be rejected by the caller (validatePluginSpec
 * accepts them for add/remove, but there is no tag to resolve).
 */
export async function updatePlugin({
  electronExecutable,
  entry,
  name,
  env = process.env,
  timeoutMs = 120_000,
  registry,
} = {}) {
  const listed = await listInstalledPlugins({ electronExecutable, entry, env, timeoutMs, registry })
  ensureProfileNpmrc(listed.path, registry)
  ensureProfilePnpmWorkspaceConfig(listed.path)
  return runDshPluginCommand({ electronExecutable, entry, args: ['update', name, '--latest'], env, timeoutMs })
}

/** Remove an out-of-tree plugin from the profile. */
export async function removePlugin({
  electronExecutable,
  entry,
  spec,
  env = process.env,
  timeoutMs = 120_000,
  registry,
} = {}) {
  const listed = await listInstalledPlugins({ electronExecutable, entry, env, timeoutMs, registry })
  ensureProfileNpmrc(listed.path, registry)
  ensureProfilePnpmWorkspaceConfig(listed.path)
  return runDshPluginCommand({ electronExecutable, entry, args: ['remove', spec], env, timeoutMs })
}
