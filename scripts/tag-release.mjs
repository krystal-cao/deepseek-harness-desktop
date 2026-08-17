#!/usr/bin/env node
// Create the annotated release tag whose message becomes the GitHub release
// notes (release.yml reads the tag message back and uses it as the body).
//
// usage: node scripts/tag-release.mjs <version> <notes-file>
// example: node scripts/tag-release.mjs v0.1.7 RELEASE_NOTES.md
//
// The notes file is usually the Markdown you would paste into GitHub; keep it
// outside the repo (or in a scratch file) so it does not become a commit.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requested = process.argv[2]
const notesPath = process.argv[3]

if (!requested || !notesPath) {
  console.error('usage: node scripts/tag-release.mjs <version> <notes-file>')
  console.error('example: node scripts/tag-release.mjs v0.1.7 RELEASE_NOTES.md')
  process.exit(1)
}

const version = requested.replace(/^v/, '')
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`refusing to tag: "${requested}" is not a vX.Y.Z version`)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
if (pkg.version !== version) {
  console.error(`package.json version is ${pkg.version}, but the tag wants ${version}`)
  process.exit(1)
}

const notesFile = path.resolve(notesPath)
if (!existsSync(notesFile)) {
  console.error(`notes file not found: ${notesFile}`)
  process.exit(1)
}

const tag = `v${version}`
try {
  execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}`], { stdio: 'ignore' })
  console.error(`tag ${tag} already exists; delete it first if you want to recreate it`)
  process.exit(1)
} catch {
  // Tag does not exist yet; proceed.
}

const message = readFileSync(notesFile, 'utf8').trim()
if (message === '') {
  console.error('notes file is empty; the release body would be blank')
  process.exit(1)
}

execFileSync('git', ['tag', '-a', tag, '-m', message], { cwd: root, stdio: 'inherit' })
console.log(`created annotated tag ${tag} from ${notesFile}`)
console.log(`push with: git push origin main && git push origin ${tag}`)
