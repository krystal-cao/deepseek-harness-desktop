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
import { DSH_ANY_VERSION_PATTERN, DSH_VERSION_PATTERN } from './updater-config.js'

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

function resolvePnpmCli() {
  const candidates = [
    new URL('../assets/bin/pnpm-pkg/bin/pnpm.cjs', import.meta.url),
    new URL('../node_modules/pnpm/bin/pnpm.cjs', import.meta.url),
  ]
  for (const candidate of candidates) {
    const file = fileURLToPath(candidate)
    if (existsSync(file)) return file
  }
  throw new Error('找不到内置 pnpm CLI')
}

function runPnpmInstall(staging, version, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [resolvePnpmCli(), 'add', `${OFFICIAL_PACKAGE}@${version}`], {
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
      else reject(new Error(`pnpm 安装失败（退出码 ${code ?? 'unknown'}）：${stderr.slice(-500)}`))
    })
  })
}

/** Write the staging project files pnpm needs for an official dsh install. */
export function writeStagingProject(staging, version) {
  writeFileSync(
    path.join(staging, 'package.json'),
    `${JSON.stringify(
      {
        name: 'deepseek-harness-desktop-managed-dsh',
        version: '0.0.0',
        private: true,
        dependencies: { [OFFICIAL_PACKAGE]: version },
      },
      null,
      2,
    )}\n`,
  )
  writeFileSync(
    path.join(staging, '.npmrc'),
    'registry=https://registry.npmjs.org/\nprefer-offline=true\naudit=false\n',
  )
  // pnpm 11 no longer reads the "pnpm" field in package.json; build-script
  // approvals live in pnpm-workspace.yaml under allowBuilds. dsh needs these
  // native/optional deps built (node-pty, koffi) to run.
  writeFileSync(
    path.join(staging, 'pnpm-workspace.yaml'),
    `allowBuilds:\n` +
      `  "@deepseek-ai/dsh-subprocess-local": true\n` +
      `  "@google/genai": true\n` +
      `  koffi: true\n` +
      `  node-pty: true\n` +
      `  protobufjs: true\n`,
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
    writeStagingProject(staging, version)
    onProgress({ version, phase: 'downloading', message: `正在安装官方 DSH ${version}` })
    await runPnpmInstall(staging, version, env)
    onProgress({ version, phase: 'validating', message: '正在校验官方包版本和入口' })
    if (!readResolvedEntry(staging, version)) throw new Error('官方 DSH 包身份或入口校验失败')
    renameSync(staging, destination)
    onProgress({ version, phase: 'complete', message: `DSH ${version} 已安装` })
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    onProgress({ version, phase: 'failed', message: error instanceof Error ? error.message : '安装失败' })
    throw error
  }
}
