#!/usr/bin/env node
// Compare the pinned @deepseek-ai/dsh version against the npm registry.
//
//   node scripts/check-upstream.mjs            # print a JSON status report
//   node scripts/check-upstream.mjs --write    # prepare the dependency bump
//   node scripts/check-upstream.mjs --github-output  # emit workflow outputs
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_VERSION_PATTERN, isNewerVersion } from '../src/updater-config.js'
import { rewriteDshPins } from './dsh-version.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = path.join(root, 'package.json')

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
const current = pkg.dependencies?.['@deepseek-ai/dsh']
if (!current) {
  console.error('@deepseek-ai/dsh is not pinned in dependencies')
  process.exit(1)
}

let rawDistTags
try {
  rawDistTags = JSON.parse(
    execFileSync('npm', ['view', '@deepseek-ai/dsh', 'dist-tags', '--json'], {
      encoding: 'utf8',
      timeout: 60_000,
    }),
  )
} catch (error) {
  console.error(`npm view failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

// npm view --json wraps single-package output in an array.
const distTags = Array.isArray(rawDistTags) ? (rawDistTags[0] ?? {}) : rawDistTags
const latest = distTags?.latest ?? ''
// Follow the `latest` dist-tag only: that is the npm "recommended" version,
// while `next` carries canary RCs the desktop app deliberately does not
// bundle until upstream promotes them.
const target = DSH_VERSION_PATTERN.test(latest) ? latest : ''
const update = Boolean(target) && target !== current && isNewerVersion(target, current)

console.log(JSON.stringify({ current, latest, target, update }, null, 2))

if (process.argv.includes('--github-output')) {
  const lines = [`current=${current}`, `target=${target}`, `update=${update}`]
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, { flag: 'a' })
  } else {
    console.log(lines.join('\n'))
  }
}

if (process.argv.includes('--write') && update) {
  const changed = rewriteDshPins(pkg, target)
  writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`wrote ${changed.length} pins to ${target}`)
  const npmMajor = Number(execFileSync('npm', ['-v'], { encoding: 'utf8' }).trim().split('.')[0])
  const installArgs = ['install', '--package-lock-only', '--ignore-scripts']
  if (npmMajor >= 12) installArgs.push('--allow-git=all')
  execFileSync('npm', installArgs, { cwd: root, stdio: 'inherit' })
}
