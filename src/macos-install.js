// Self-install fallback for macOS. electron-updater delegates the actual
// installation to Squirrel.Mac, which silently refuses to install updates for
// ad-hoc-signed builds (the certificates required for signature verification
// are absent). For this shell, the downloaded update.zip is extracted and the
// app bundle is swapped by a detached helper script, then relaunched.
import { app } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { constants, existsSync, mkdtempSync, readdirSync, writeFileSync, accessSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function currentAppBundlePath() {
  const executable = app.getPath('exe')
  const bundle = path.dirname(path.dirname(path.dirname(executable)))
  if (!bundle.endsWith('.app')) {
    throw new Error(`unexpected app bundle path: ${bundle}`)
  }
  return bundle
}

function findUpdateZip() {
  const cacheRoot = app.getPath('cache')
  const candidates = existsSync(cacheRoot)
    ? readdirSync(cacheRoot).filter((name) => name.endsWith('-updater'))
    : []
  for (const dir of candidates) {
    const zipPath = path.join(cacheRoot, dir, 'update.zip')
    if (existsSync(zipPath)) return zipPath
  }
  throw new Error('downloaded update.zip was not found in the updater cache')
}

function findAppBundle(stagingRoot) {
  const candidates = readdirSync(stagingRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
  if (candidates.length === 0) {
    throw new Error(`no .app bundle found inside ${stagingRoot}`)
  }
  return path.join(stagingRoot, candidates[0].name)
}

function assertReplaceableBundle(bundlePath) {
  try {
    accessSync(bundlePath, constants.W_OK)
  } catch {
    throw new Error(`the app bundle is not writable (running from a read-only volume?): ${bundlePath}`)
  }
}

function scheduleSwap({ stagingRoot, extractedApp, bundlePath }) {
  const scriptPath = path.join(stagingRoot, 'install.sh')
  const logPath = path.join(stagingRoot, 'install.log')
  const escapedBundle = bundlePath.replaceAll('"', '\\"')
  const escapedApp = extractedApp.replaceAll('"', '\\"')
  const script = `#!/bin/sh
exec >> "${logPath}" 2>&1
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done
rm -rf "${escapedBundle}"
mv "${escapedApp}" "${escapedBundle}"
open "${escapedBundle}"
`
  writeFileSync(scriptPath, script, { mode: 0o755 })
  spawn('sh', [scriptPath], { detached: true, stdio: 'ignore' }).unref()
  return logPath
}

/**
 * Swap the running app bundle with the downloaded update and relaunch.
 * Returns once the replacement script has been scheduled.
 */
export async function installDownloadedUpdate() {
  const zipPath = findUpdateZip()
  const bundlePath = currentAppBundlePath()
  assertReplaceableBundle(bundlePath)
  const stagingRoot = mkdtempSync(path.join(os.tmpdir(), 'dsh-update-'))

  await new Promise((resolve, reject) => {
    execFile('ditto', ['-x', '-k', zipPath, stagingRoot], (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
  const extractedApp = findAppBundle(stagingRoot)
  const logPath = scheduleSwap({ stagingRoot, extractedApp, bundlePath })
  return { stagingRoot, logPath, bundlePath }
}
