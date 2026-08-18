// Packaged-app smoke test (macOS only): boot the built .app, wait for the dsh
// host, and confirm the Web UI responds.
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { once } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startDshService } from '../src/dsh-service.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultAppPath = path.join(
  root,
  'dist',
  process.arch === 'x64' ? 'mac' : 'mac-arm64',
  'DeepSeek Harness.app',
)
const appPath = process.env.PACKAGED_APP_PATH ?? defaultAppPath
const electronExecutable = path.join(appPath, 'Contents', 'MacOS', 'DeepSeek Harness')
const resourcesDir = path.join(appPath, 'Contents', 'Resources')
const temporaryRoot =
  process.env.PACKAGED_APP_PATH === undefined
    ? mkdtempSync(path.join(os.tmpdir(), 'dsh-packaged-smoke-'))
    : undefined
const resourcesRoot = temporaryRoot === undefined ? resourcesDir : temporaryRoot

// Resolve the dsh entry inside the packaged payload. The full node_modules
// tree is unpacked (dsh's profile-healing symlinks need a real file system),
// so the entry lives under app.asar.unpacked; pre-asar builds keep a flat
// app/ directory. Both are real directories, so plain node can probe them.
const ENTRY_IN_UNPACKED = path.join('app.asar.unpacked', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const ENTRY_IN_FLAT_APP = path.join('app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
function resolveEntry() {
  for (const candidate of [ENTRY_IN_UNPACKED, ENTRY_IN_FLAT_APP]) {
    const entry = path.join(resourcesRoot, candidate)
    if (existsSync(entry)) return entry
  }
  throw new Error(`dsh entry not found under ${resourcesRoot}`)
}

if (temporaryRoot !== undefined) {
  // Replicate the Resources layout inside the temp root so the spawn stays
  // isolated from the live app: copy app.asar (or app/) plus the unpacked
  // tree when present.
  const asarFile = path.join(resourcesDir, 'app.asar')
  const flatApp = path.join(resourcesDir, 'app')
  if (existsSync(asarFile)) {
    const { copyFileSync } = await import('node:fs')
    copyFileSync(asarFile, path.join(temporaryRoot, 'app.asar'))
  } else if (existsSync(flatApp)) {
    cpSync(flatApp, path.join(temporaryRoot, 'app'), { recursive: true })
  } else {
    throw new Error(`no app payload found under ${resourcesDir}`)
  }
  const unpacked = path.join(resourcesDir, 'app.asar.unpacked')
  if (existsSync(unpacked)) {
    cpSync(unpacked, path.join(temporaryRoot, 'app.asar.unpacked'), { recursive: true })
  }
}

const service = startDshService({
  electronExecutable,
  entry: resolveEntry(),
  environment: {
    ...process.env,
    NODE_OPTIONS: '',
    NODE_PATH: '',
  },
})

try {
  const url = await service.ready
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Packaged DeepSeek Harness returned HTTP ${response.status}`)
  }
  const html = await response.text()
  if (!html.includes('__DSH_BOOT__')) {
    throw new Error('Packaged DeepSeek Harness did not return its Web UI')
  }
  console.log(`packaged smoke: ${response.status} ${url}`)
} finally {
  service.stop()
  if (service.child.exitCode === null) {
    await once(service.child, 'exit')
  }
  if (temporaryRoot !== undefined) {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}
