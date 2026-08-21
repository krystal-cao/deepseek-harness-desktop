// Install, retain and switch official @deepseek-ai/dsh versions at runtime.
// Mirrors the design of qufei1993/dsh-desktop (MIT): versions live under
// <userData>/dsh-versions/<version>/node_modules/@deepseek-ai/dsh, are installed
// into a staging directory with the bundled pnpm CLI, validated for identity
// and entry, then atomically renamed into place.
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unpackedPath } from './dsh-service.js'
import { DSH_ANY_VERSION_PATTERN, resolveNpmRegistry } from './updater-config.js'

const OFFICIAL_PACKAGE = '@deepseek-ai/dsh'

export function versionsDirFor(userData) {
  return path.join(userData, 'dsh-versions')
}

export function versionEntryFor(versionsDir, version) {
  return path.join(versionsDir, version, 'node_modules', OFFICIAL_PACKAGE, 'lib', 'bin.js')
}

function readPackageJson() {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  } catch {
    return { dependencies: {} }
  }
}

/** The dsh version bundled with the shell at build time (package.json pin). */
export function bundledDshVersion(pkg = readPackageJson()) {
  const pinned = pkg.dependencies?.[OFFICIAL_PACKAGE]
  return typeof pinned === 'string' && DSH_ANY_VERSION_PATTERN.test(pinned) ? pinned : null
}

/**
 * The DSH plugin packages that must be hoisted into the app's runtime tree.
 * The aggregate package declares these as runtime imports, but packaged
 * Electron resolution still requires them at the top-level node_modules path.
 */
export function dshFamilyPins(pkg = readPackageJson()) {
  return Object.keys(pkg.dependencies ?? {})
    .filter((name) => name.startsWith('@deepseek-ai/dsh-'))
    .sort()
}

/**
 * Query the registry for family packages published at a DSH version. Older
 * releases may not publish every package, so only available packages are
 * added to the managed install.
 */
export async function resolveAlignedFamily({
  version,
  names = dshFamilyPins(),
  registry = resolveNpmRegistry(),
  fetcher = fetch,
  timeoutMs = 10_000,
} = {}) {
  const base = registry.replace(/\/+$/, '')
  const results = await Promise.all(
    names.map(async (name) => {
      try {
        const response = await fetcher(`${base}/${name}`, {
          headers: { accept: 'application/vnd.npm.install-v1+json' },
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!response.ok) return { name, available: false }
        const data = await response.json()
        return { name, available: Boolean(data.versions?.[version]) }
      } catch {
        return { name, available: false }
      }
    }),
  )
  return {
    available: results.filter((item) => item.available).map((item) => item.name).sort(),
    missing: results.filter((item) => !item.available).map((item) => item.name).sort(),
  }
}

/** Report the managed install's family package versions for diagnostics. */
export function readInstalledFamily(root, version) {
  return dshFamilyPins().map((name) => {
    const manifestPath = path.join(root, 'node_modules', name, 'package.json')
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      return { name, version: manifest.version ?? null, aligned: manifest.version === version }
    } catch {
      return { name, version: null, aligned: false }
    }
  })
}

function resolvePackageRoot(root) {
  return path.join(root, 'node_modules', OFFICIAL_PACKAGE)
}

/** Validate an installed @deepseek-ai/dsh tree; returns its CLI entry or null. */
function readResolvedEntry(root, version) {
  const packageRoot = resolvePackageRoot(root)
  const manifestPath = path.join(packageRoot, 'package.json')
  if (!existsSync(manifestPath)) return null
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.name !== OFFICIAL_PACKAGE || manifest.version !== version) return null
    const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.dsh
    if (!bin) return null
    const entry = path.resolve(packageRoot, bin)
    if (!entry.startsWith(`${packageRoot}${path.sep}`) || !existsSync(entry)) return null
    return entry
  } catch {
    return null
  }
}

/** List complete, validated user-installed versions (newest first). */
export function listInstalledVersions(versionsDir) {
  if (!existsSync(versionsDir)) return []
  const entries = []
  for (const name of readdirSync(versionsDir)) {
    if (!DSH_ANY_VERSION_PATTERN.test(name)) continue
    const root = path.join(versionsDir, name)
    if (!readResolvedEntry(root, name)) continue
    entries.push({ version: name, source: 'installed' })
  }
  return entries
}

/**
 * Remove staging directories left behind when an install was interrupted
 * (process killed, crash, power loss). They use a `.install-` prefix that can
 * never collide with a real version name, so they are safe to delete on every
 * startup.
 */
export function cleanupStaleInstallDirs(versionsDir) {
  if (!existsSync(versionsDir)) return
  for (const name of readdirSync(versionsDir)) {
    if (name.startsWith('.install-')) {
      rmSync(path.join(versionsDir, name), { recursive: true, force: true })
    }
  }
}

/** Locate the bundled pnpm CLI (packaged assets first, dev node_modules next). */
export function resolvePnpmCli() {
  const candidates = [
    new URL('../assets/bin/pnpm-pkg/bin/pnpm.cjs', import.meta.url),
    new URL('../node_modules/pnpm/bin/pnpm.cjs', import.meta.url),
  ]
  for (const candidate of candidates) {
    const file = unpackedPath(fileURLToPath(candidate))
    if (existsSync(file)) return file
  }
  throw new Error('找不到内置 pnpm CLI')
}

function runPnpmCommand(staging, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [resolvePnpmCli(), ...args], {
      cwd: staging,
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`pnpm 命令失败（退出码 ${code ?? 'unknown'}）：${stderr.slice(-500)}`))
    })
  })
}

function readManifestScripts(dir) {
  try {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const scripts = manifest.scripts ?? {}
    if (['preinstall', 'install', 'postinstall'].some((key) => scripts[key])) return manifest
    return null
  } catch {
    return null
  }
}

function collectFromDir(names, dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const full = path.join(dir, entry.name)
    const manifest = readManifestScripts(full)
    if (manifest) names.add(manifest.name ?? entry.name)
    if (entry.name.startsWith('@')) {
      let subs
      try {
        subs = readdirSync(full, { withFileTypes: true })
      } catch {
        continue
      }
      for (const sub of subs) {
        if (!sub.isDirectory()) continue
        const subFull = path.join(full, sub.name)
        const subManifest = readManifestScripts(subFull)
        if (subManifest) names.add(subManifest.name ?? sub.name)
      }
    }
  }
}

/**
 * Scan an installed tree for packages with build scripts (preinstall/install/
 * postinstall). pnpm 11 blocks those scripts by default, so the staging
 * install runs twice: once to fetch, then again with an allowlist derived from
 * this scan. Deriving it from the tree keeps the allowlist correct when
 * upstream changes native dependencies between RCs.
 */
export function collectBuildScripts(root) {
  const names = new Set()
  const top = path.join(root, 'node_modules')
  collectFromDir(names, top)
  const store = path.join(top, '.pnpm')
  let storeEntries
  try {
    storeEntries = readdirSync(store, { withFileTypes: true })
  } catch {
    return []
  }
  for (const pkgDir of storeEntries) {
    if (!pkgDir.isDirectory()) continue
    collectFromDir(names, path.join(store, pkgDir.name, 'node_modules'))
  }
  return [...names].sort()
}

/** Write the pnpm 11 build-script allowlist for a staging project. */
export function writePnpmWorkspace(staging, buildScriptNames) {
  const lines = ['allowBuilds:']
  for (const name of buildScriptNames) lines.push(`  "${name}": true`)
  writeFileSync(path.join(staging, 'pnpm-workspace.yaml'), `${lines.join('\n')}\n`)
}

/**
 * Write the staging project files pnpm needs for an official dsh install.
 * `extraDeps` carries the version-aligned plugin family required by the
 * packaged runtime's top-level module resolution.
 */
export function writeStagingProject(
  staging,
  version,
  extraDeps = {},
  registry = resolveNpmRegistry(),
) {
  writeFileSync(
    path.join(staging, 'package.json'),
    `${JSON.stringify(
      {
        name: 'deepseek-harness-desktop-managed-dsh',
        version: '0.0.0',
        private: true,
        dependencies: { [OFFICIAL_PACKAGE]: version, ...extraDeps },
      },
      null,
      2,
    )}\n`,
  )
  writeFileSync(
    path.join(staging, '.npmrc'),
    `registry=${registry}\nprefer-offline=true\naudit=false\n`,
  )
}

/**
 * Install an official version into <versionsDir>/<version>.
 * `availableVersions` must come from the npm catalog; the package is installed
 * into a staging dir, validated, then renamed into place atomically.
 */
export async function installDshVersion({
  versionsDir,
  version,
  availableVersions,
  onProgress = () => {},
  env = process.env,
  family,
  registry,
}) {
  if (!DSH_ANY_VERSION_PATTERN.test(version)) throw new Error(`无效的 DSH 版本号：${version}`)
  if (!availableVersions.includes(version)) throw new Error('该版本不在官方 npm 版本目录中')
  mkdirSync(versionsDir, { recursive: true })
  const destination = path.join(versionsDir, version)
  if (existsSync(destination)) {
    if (!readResolvedEntry(destination, version)) throw new Error(`已安装的 DSH ${version} 校验失败`)
    return
  }
  const staging = path.join(versionsDir, `.install-${version}-${Date.now()}`)
  mkdirSync(staging, { recursive: true })
  try {
    const aligned = family ?? (await resolveAlignedFamily({ version, registry }))
    const extraDeps = Object.fromEntries(aligned.available.map((name) => [name, version]))
    const familyTotal = aligned.available.length + aligned.missing.length
    writeStagingProject(staging, version, extraDeps, registry)
    onProgress({
      version,
      phase: 'downloading',
      message: `正在安装官方 DSH ${version}（插件族 ${aligned.available.length}/${familyTotal} 对齐）`,
    })
    // pnpm 11 exits nonzero when build scripts are blocked, so fetch with
    // --ignore-scripts first, approve exactly what the tree needs, then run
    // the builds so native deps (node-pty, koffi, ...) are ready regardless of
    // upstream version changes.
    await runPnpmCommand(staging, ['add', `${OFFICIAL_PACKAGE}@${version}`, '--ignore-scripts'], env)
    // pnpm 11 blocks build scripts unless approved; approve exactly what the
    // installed tree needs and run the builds.
    const buildScripts = collectBuildScripts(staging)
    if (buildScripts.length > 0) {
      writePnpmWorkspace(staging, buildScripts)
      await runPnpmCommand(staging, ['rebuild'], env)
    }
    onProgress({ version, phase: 'validating', message: '正在校验官方包版本和入口' })
    if (!readResolvedEntry(staging, version)) throw new Error('官方 DSH 包身份或入口校验失败')
    renameSync(staging, destination)
    onProgress({
      version,
      phase: 'complete',
      message: `DSH ${version} 已安装（插件族 ${aligned.available.length} 个对齐，${aligned.missing.length} 个暂未发布）`,
    })
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    onProgress({ version, phase: 'failed', message: error instanceof Error ? error.message : '安装失败' })
    throw error
  }
}
