import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DSH_ANY_VERSION_PATTERN } from './updater-config.js'

const READY_PATTERN = /^dsh web: (http:\/\/127\.0\.0\.1:\d+)\b/m

/**
 * Report which dsh tree a selection resolves to: 'user' when the installed
 * tree under <versionsDir>/<version> is present, 'bundled' otherwise. Mirrors
 * the candidate check in resolveDshEntry so the shell can surface a silent
 * fallback (e.g. a selected version that was corrupted after launch) to the
 * UI instead of pretending the user's version is still running.
 */
export function resolveDshEntrySource(version, versionsDir) {
  if (version && versionsDir && DSH_ANY_VERSION_PATTERN.test(version)) {
    const candidate = join(versionsDir, version, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (existsSync(candidate)) return 'user'
  }
  return 'bundled'
}

/**
 * Resolve the dsh CLI entry. When a user-installed version is selected, prefer
 * its tree under <versionsDir>/<version>; otherwise fall back to the bundled
 * @deepseek-ai/dsh that ships with the shell.
 */
export function resolveDshEntry(version, versionsDir) {
  if (resolveDshEntrySource(version, versionsDir) === 'user') {
    return join(versionsDir, version, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  }
  return unpackedPath(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js')))
}

export function unpackedPath(path) {
  return path.replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2')
}

/** Directory with the bundled pnpm and its dsh-node shim, when packaged. */
export function bundledBinDir() {
  const resources = typeof process.resourcesPath === 'string' ? process.resourcesPath : undefined
  if (!resources) return undefined
  const dir = join(resources, 'app', 'assets', 'bin')
  return existsSync(dir) ? dir : undefined
}

/**
 * Prepend the bundled bin directory so GUI launches find pnpm (dsh plugin
 * operations and profile healing). The directory deliberately contains no
 * bare `node`, so the dsh agent's shell tools resolve `node` to the user's
 * system node instead of the Electron-as-Node shim.
 */
export function withBundledBinPath(env, binDir = bundledBinDir()) {
  if (!binDir) return env
  const pathValue = env.PATH ?? ''
  return {
    ...env,
    PATH: pathValue === '' ? binDir : `${binDir}${delimiter}${pathValue}`,
  }
}

export function extractReadyUrl(output) {
  return READY_PATTERN.exec(output)?.[1]
}

export function buildDshArgs(entry) {
  return [
    '--expose-internals',
    entry,
    '--profile',
    'web',
    '--host',
    '127.0.0.1',
    '--port',
    '0',
  ]
}

export function buildDshCommand({
  electronExecutable,
  entry = resolveDshEntry(),
} = {}) {
  if (!electronExecutable) {
    throw new Error('electronExecutable is required')
  }

  return { command: electronExecutable, args: buildDshArgs(entry) }
}

export function startDshService({
  electronExecutable,
  entry = resolveDshEntry(),
  environment = process.env,
  timeoutMs = 60_000,
} = {}) {
  const { command, args } = buildDshCommand({
    electronExecutable,
    entry,
  })

  const finalEnv = withBundledBinPath({
    ...environment,
    ELECTRON_RUN_AS_NODE: '1',
  })
  if (process.env.DSH_DEBUG_HOST_PATH === '1') {
    console.error('[dsh-service] host PATH:', finalEnv.PATH)
  }
  const child = spawn(command, args, {
    env: finalEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  let settled = false

  const ready = new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback(value)
    }

    const inspect = (chunk) => {
      output += chunk.toString()
      const url = extractReadyUrl(output)
      if (url) finish(resolve, url)
    }

    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('error', (error) => finish(reject, error))
    child.once('exit', (code, signal) => {
      finish(
        reject,
        new Error(`DeepSeek Harness stopped before it was ready (code ${String(code)}, signal ${String(signal)}).\n${output}`),
      )
    })

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      finish(reject, new Error(`DeepSeek Harness did not become ready within ${timeoutMs}ms.\n${output}`))
    }, timeoutMs)
  })

  const stop = () => {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGTERM')
    }
  }

  return { child, ready, stop }
}

export function dshEntryUrl() {
  return pathToFileURL(resolveDshEntry()).href
}
