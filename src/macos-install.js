// Self-install fallback for macOS. electron-updater delegates the actual
// installation to Squirrel.Mac, which silently refuses to install updates for
// ad-hoc-signed builds (the certificates required for signature verification
// are absent). For this shell, the downloaded update.zip is extracted and the
// app bundle is swapped by a detached helper script, then relaunched.
import { app } from 'electron'
import { execFile, execFileSync, spawn } from 'node:child_process'
import { constants, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, accessSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DESKTOP_BUNDLE_ID, resolveUpdaterCacheDirName } from './updater-config.js'

function currentAppBundlePath() {
  const executable = app.getPath('exe')
  const bundle = path.dirname(path.dirname(path.dirname(executable)))
  if (!bundle.endsWith('.app')) {
    throw new Error(`unexpected app bundle path: ${bundle}`)
  }
  return bundle
}

/**
 * The packaged app embeds `updaterCacheDirName` in app-update.yml (the same
 * file electron-updater reads). Fall back to the electron-builder convention
 * (package name + "-updater") for dev runs where the file is absent.
 */
function readUpdaterCacheDirName() {
  try {
    const configPath = path.join(process.resourcesPath, 'app-update.yml')
    const match = /^updaterCacheDirName:\s*(\S+)/m.exec(readFileSync(configPath, 'utf8'))
    if (match) return match[1]
  } catch {
    // fall through to the naming convention
  }
  return resolveUpdaterCacheDirName()
}

/**
 * Only ever look at OUR updater cache directory. Scanning `~/Library/Caches`
 * for any `*-updater/update.zip` can pick up another app's downloaded update
 * (e.g. opencode's) and install it over this app.
 */
function findUpdateZip() {
  const zipPath = path.join(app.getPath('cache'), readUpdaterCacheDirName(), 'update.zip')
  if (existsSync(zipPath)) return zipPath
  throw new Error('downloaded update.zip was not found in the updater cache')
}

function readBundleIdentifier(bundlePath) {
  const plistPath = path.join(bundlePath, 'Contents', 'Info.plist')
  try {
    return execFileSync('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', plistPath], {
      encoding: 'utf8',
    }).trim()
  } catch {
    return null
  }
}

/**
 * Pick the extracted bundle that is actually ours. Never install a bundle
 * whose identifier does not match, even if the zip came from the right cache
 * directory: a wrong bundle (e.g. another app's update) must abort the install.
 */
function findAppBundle(stagingRoot) {
  const candidates = readdirSync(stagingRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
  if (candidates.length === 0) {
    throw new Error(`no .app bundle found inside ${stagingRoot}`)
  }
  const match = candidates.find((entry) => readBundleIdentifier(path.join(stagingRoot, entry.name)) === DESKTOP_BUNDLE_ID)
  if (!match) {
    const found = candidates
      .map((entry) => readBundleIdentifier(path.join(stagingRoot, entry.name)))
      .map((identifier) => identifier ?? '<unreadable>')
      .join(', ')
    throw new Error(`update bundle identity check failed: expected ${DESKTOP_BUNDLE_ID}, found ${found}`)
  }
  return path.join(stagingRoot, match.name)
}

function assertReplaceableBundle(bundlePath) {
  try {
    accessSync(bundlePath, constants.W_OK)
    accessSync(path.dirname(bundlePath), constants.W_OK)
  } catch {
    throw new Error(`the app bundle is not writable (running from a read-only volume?): ${bundlePath}`)
  }
}

function scheduleSwap({ stagingRoot, extractedApp, bundlePath }) {
  const scriptPath = path.join(stagingRoot, 'install.sh')
  const logPath = path.join(stagingRoot, 'install.log')
  const targetBundlePath = path.join(path.dirname(bundlePath), path.basename(extractedApp))
  const escapedBundle = bundlePath.replaceAll('"', '\\"')
  const escapedTarget = targetBundlePath.replaceAll('"', '\\"')
  const escapedApp = extractedApp.replaceAll('"', '\\"')
  const backupPath = `${bundlePath}.dsh-old`
  const escapedBackup = backupPath.replaceAll('"', '\\"')
  const script = `#!/bin/sh
exec >> "${logPath}" 2>&1
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done
rm -rf "${escapedBackup}"
if ! mv "${escapedBundle}" "${escapedBackup}"; then
  echo "failed to move current app aside: ${bundlePath}" >&2
  exit 1
fi
if [ "${escapedBundle}" != "${escapedTarget}" ]; then
  rm -rf "${escapedTarget}"
fi
if ! mv "${escapedApp}" "${escapedTarget}"; then
  mv "${escapedBackup}" "${escapedBundle}"
  echo "failed to install update; previous app restored: ${bundlePath}" >&2
  exit 1
fi
rm -rf "${escapedBackup}"
open "${escapedTarget}"
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
