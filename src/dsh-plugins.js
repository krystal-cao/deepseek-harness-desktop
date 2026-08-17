// Desktop wrapper around `dsh plugin --profile <name> <pnpm args>`: list, add
// and remove out-of-tree plugins in the web profile, plus a PATH shim so the
// CLI can always find pnpm (Finder/Dock launches have no shell PATH, and the
// bundled assets/bin shim only exists in packaged builds).
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { bundledBinDir, withBundledBinPath } from './dsh-service.js'
import { resolvePnpmCli } from './dsh-versions.js'
import { resolveNpmRegistry } from './updater-config.js'

export const DEFAULT_PROFILE = 'web'

// npm names (optionally scoped, optionally @version) and github:owner/repo
// specs. Conservative on purpose: anything a UI user types ends up as a pnpm
// argument, so flags, paths and shell metacharacters are rejected outright.
const NPM_SPEC = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[^\s/@]+)?$/
const GITHUB_SPEC = /^github:[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/

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
    throw new Error(`读取插件列表失败（退出码 ${result.code}）：${(result.stderr || result.stdout).trim().slice(-500)}`)
  }
  const parsed = parsePnpmListJson(result.stdout)
  ensureProfileNpmrc(parsed.path, registry)
  return enrichPluginMetadata(resolveLocalPluginVersions(parsed))
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
  const listed = await listInstalledPlugins({ electronExecutable, entry, env, timeoutMs, registry })
  ensureProfileNpmrc(listed.path, registry)
  return runDshPluginCommand({ electronExecutable, entry, args: ['add', spec], env, timeoutMs })
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
  return runDshPluginCommand({ electronExecutable, entry, args: ['remove', spec], env, timeoutMs })
}
