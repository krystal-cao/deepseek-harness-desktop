import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  bundledDshVersion,
  listInstalledVersions,
  versionEntryFor,
  versionsDirFor,
  writeStagingProject,
} from '../src/dsh-versions.js'
import { readFileSync } from 'node:fs'

function makeFakeVersion(root, version) {
  const packageRoot = path.join(root, version, 'node_modules', '@deepseek-ai', 'dsh')
  mkdirSync(path.join(packageRoot, 'lib'), { recursive: true })
  writeFileSync(
    path.join(packageRoot, 'package.json'),
    `${JSON.stringify({ name: '@deepseek-ai/dsh', version, bin: { dsh: 'lib/bin.js' } }, null, 2)}\n`,
  )
  writeFileSync(path.join(packageRoot, 'lib', 'bin.js'), '')
}

test('versionsDirFor places versions under userData', () => {
  assert.equal(versionsDirFor('/tmp/user-data'), path.join('/tmp/user-data', 'dsh-versions'))
})

test('versionEntryFor points at the dsh CLI entry', () => {
  const dir = path.join('/tmp/user-data', 'dsh-versions')
  assert.equal(
    versionEntryFor(dir, '0.1.0-rc.6'),
    path.join(dir, '0.1.0-rc.6', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  )
})

test('listInstalledVersions only returns valid, complete dsh installs', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-versions-'))
  try {
    makeFakeVersion(dir, '0.1.0-rc.5')
    makeFakeVersion(dir, '0.1.0-rc.6')
    makeFakeVersion(dir, '0.0.1-rc.5')
    // Incomplete install (no manifest) and non-train dirs must be ignored.
    mkdirSync(path.join(dir, '0.1.0-rc.7'))
    mkdirSync(path.join(dir, 'garbage'))
    assert.deepEqual(listInstalledVersions(dir), [
      { version: '0.0.1-rc.5', source: 'installed' },
      { version: '0.1.0-rc.5', source: 'installed' },
      { version: '0.1.0-rc.6', source: 'installed' },
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('listInstalledVersions tolerates a missing versions dir', () => {
  assert.deepEqual(listInstalledVersions(path.join(os.tmpdir(), 'does-not-exist')), [])
})

test('bundledDshVersion reads the pinned package version', () => {
  const version = bundledDshVersion()
  assert.match(version ?? '', /^0\.1\.0-rc\.\d+$/)
})

test('writeStagingProject uses pnpm 11 allowBuilds instead of the pnpm field', () => {
  const staging = mkdtempSync(path.join(os.tmpdir(), 'dsh-staging-'))
  try {
    writeStagingProject(staging, '0.1.0-rc.6')
    const manifest = JSON.parse(readFileSync(path.join(staging, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies['@deepseek-ai/dsh'], '0.1.0-rc.6')
    assert.equal(manifest.pnpm, undefined)
    const workspace = readFileSync(path.join(staging, 'pnpm-workspace.yaml'), 'utf8')
    assert.match(workspace, /allowBuilds:/)
    assert.match(workspace, /node-pty: true/)
    assert.match(workspace, /koffi: true/)
    const npmrc = readFileSync(path.join(staging, '.npmrc'), 'utf8')
    assert.match(npmrc, /registry=https:\/\/registry\.npmjs\.org\//)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
})
