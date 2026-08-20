import fs from 'node:fs'
import path from 'node:path'

/**
 * On macOS, when upgrading from 0.3.1 (where the installed bundle was named
 * "DeepSeek Harness.app"), the legacy in-place updater extracted the update
 * inside the old directory. On startup, silently rename the bundle directory
 * from "DeepSeek Harness.app" to "DSH.app" so Finder and LaunchServices
 * reflect the new product name without requiring a fresh DMG install.
 */
export function migrateLegacyBundleName({
  isPackaged = false,
  platform = process.platform,
  exePath = '',
  renameSync = fs.renameSync,
  existsSync = fs.existsSync,
} = {}) {
  if (!isPackaged || platform !== 'darwin' || !exePath) return false
  try {
    const bundlePath = path.dirname(path.dirname(path.dirname(exePath)))
    if (!bundlePath.endsWith('/DeepSeek Harness.app')) return false
    const targetPath = path.join(path.dirname(bundlePath), 'DSH.app')
    if (existsSync(targetPath)) return false
    renameSync(bundlePath, targetPath)
    return true
  } catch {
    return false
  }
}
