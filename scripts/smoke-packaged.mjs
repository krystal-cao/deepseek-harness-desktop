// Packaged-app smoke test (macOS only): boot the built .app, wait for the dsh
// host, and confirm the Web UI responds.
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
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
const packagedResourcesRoot = path.join(appPath, 'Contents', 'Resources', 'app')
const temporaryRoot =
  process.env.PACKAGED_APP_PATH === undefined
    ? mkdtempSync(path.join(os.tmpdir(), 'dsh-packaged-smoke-'))
    : undefined
const resourcesRoot =
  temporaryRoot === undefined ? packagedResourcesRoot : path.join(temporaryRoot, 'app')

if (temporaryRoot !== undefined) {
  cpSync(packagedResourcesRoot, resourcesRoot, { recursive: true })
}

const service = startDshService({
  electronExecutable,
  entry: path.join(resourcesRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
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
