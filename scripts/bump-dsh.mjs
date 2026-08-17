#!/usr/bin/env node
// Bump every pinned @deepseek-ai/dsh* dependency to one version, refresh the
// lockfile, and run the baseline tests so the desktop wrapper tracks upstream.
//
// usage: node scripts/bump-dsh.mjs <version>
// example: node scripts/bump-dsh.mjs 0.1.0-rc.7
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_VERSION_PATTERN } from '../src/updater-config.js'
import { rewriteDshPins, syncAllowScriptsVersions } from './dsh-version.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = path.join(root, 'package.json')

const requested = process.argv[2]
if (!requested) {
  console.error('usage: node scripts/bump-dsh.mjs <version>')
  console.error('example: node scripts/bump-dsh.mjs 0.1.0-rc.7')
  process.exit(1)
}
if (!DSH_VERSION_PATTERN.test(requested)) {
  console.error(`refusing to bump: "${requested}" is not on the 0.1.0-rc.* train`)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
const changed = rewriteDshPins(pkg, requested)
if (changed.length === 0) {
  console.log(`all @deepseek-ai/dsh* pins are already at ${requested}; nothing to do`)
  process.exit(0)
}

writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)

const npmMajor = Number(execFileSync('npm', ['-v'], { encoding: 'utf8' }).trim().split('.')[0])
const installArgs = ['install']
if (npmMajor >= 12) installArgs.push('--allow-git=all')
execFileSync('npm', installArgs, { cwd: root, stdio: 'inherit' })
const synced = syncAllowScriptsVersions(pkg, root)
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)
if (synced > 0) {
  console.log(`synced ${synced} allowScripts entries to installed versions`)
  // Re-install so the newly allowed native build scripts actually run.
  execFileSync('npm', installArgs, { cwd: root, stdio: 'inherit' })
}
execFileSync('npm', ['test'], { cwd: root, stdio: 'inherit' })

console.log(`\nbumped ${changed.length} packages to ${requested}`)
console.log('next: verify with "npm run dist:mac:arm64" and "npm run smoke:packaged", then bump the app version and tag a release')
