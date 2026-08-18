import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  bundledDshVersion,
  cleanupStaleInstallDirs,
  collectBuildScripts,
  dshFamilyPins,
  listInstalledVersions,
  readInstalledFamily,
  resolveAlignedFamily,
  versionEntryFor,
  versionsDirFor,
  writePnpmWorkspace,
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

test('cleanupStaleInstallDirs removes only interrupted install staging dirs', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-stale-'))
  try {
    makeFakeVersion(dir, '0.1.0-rc.5')
    mkdirSync(path.join(dir, '.install-0.1.0-rc.6-1234'))
    mkdirSync(path.join(dir, '.install-0.1.0-rc.7-5678'))
    cleanupStaleInstallDirs(dir)
    assert.deepEqual(listInstalledVersions(dir), [{ version: '0.1.0-rc.5', source: 'installed' }])
    assert.ok(!existsSync(path.join(dir, '.install-0.1.0-rc.6-1234')))
    assert.ok(!existsSync(path.join(dir, '.install-0.1.0-rc.7-5678')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cleanupStaleInstallDirs tolerates a missing versions dir', () => {
  const dir = path.join(os.tmpdir(), 'does-not-exist-stale')
  cleanupStaleInstallDirs(dir)
  assert.ok(true)
})

test('bundledDshVersion reads the pinned package version', () => {
  const version = bundledDshVersion()
  assert.match(version ?? '', /^0\.1\.0-rc\.\d+$/)
})

test('writeStagingProject writes a minimal installable project', () => {
  const staging = mkdtempSync(path.join(os.tmpdir(), 'dsh-staging-'))
  try {
    writeStagingProject(staging, '0.1.0-rc.6')
    const manifest = JSON.parse(readFileSync(path.join(staging, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies['@deepseek-ai/dsh'], '0.1.0-rc.6')
    assert.equal(manifest.pnpm, undefined)
    const npmrc = readFileSync(path.join(staging, '.npmrc'), 'utf8')
    assert.match(npmrc, /registry=https:\/\/registry\.npmmirror\.com\//)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
})

test('writePnpmWorkspace writes the pnpm 11 build-script allowlist', () => {
  const staging = mkdtempSync(path.join(os.tmpdir(), 'dsh-staging-'))
  try {
    writePnpmWorkspace(staging, ['@deepseek-ai/dsh-subprocess-local', 'koffi', 'node-pty'])
    const workspace = readFileSync(path.join(staging, 'pnpm-workspace.yaml'), 'utf8')
    assert.match(workspace, /allowBuilds:/)
    assert.match(workspace, /"@deepseek-ai\/dsh-subprocess-local": true/)
    assert.match(workspace, /"node-pty": true/)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
})

test('collectBuildScripts finds packages with build scripts in the tree', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dsh-scripts-'))
  const makeManifest = (dir, name, scripts) => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name, scripts })}\n`)
  }
  try {
    makeManifest(path.join(root, 'node_modules', 'esbuild'), 'esbuild', { postinstall: 'node install.js' })
    makeManifest(path.join(root, 'node_modules', '@deepseek-ai', 'dsh-fs'), '@deepseek-ai/dsh-fs', {})
    makeManifest(path.join(root, 'node_modules', '@deepseek-ai', 'dsh-shell'), '@deepseek-ai/dsh-shell', { install: 'node-gyp rebuild' })
    makeManifest(
      path.join(root, 'node_modules', '.pnpm', 'node-pty@1.1.0', 'node_modules', 'node-pty'),
      'node-pty',
      { install: 'node-gyp rebuild' },
    )
    mkdirSync(path.join(root, 'node_modules', '.bin'))
    assert.deepEqual(collectBuildScripts(root), ['@deepseek-ai/dsh-shell', 'esbuild', 'node-pty'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('collectBuildScripts tolerates a missing node_modules', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dsh-scripts-'))
  try {
    assert.deepEqual(collectBuildScripts(root), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('writeStagingProject merges the version-aligned plugin family', () => {
  const staging = mkdtempSync(path.join(os.tmpdir(), 'dsh-staging-'))
  try {
    writeStagingProject(staging, '0.1.0-rc.6', {
      '@deepseek-ai/dsh-fs': '0.1.0-rc.6',
      '@deepseek-ai/dsh-sandbox': '0.1.0-rc.6',
    })
    const manifest = JSON.parse(readFileSync(path.join(staging, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies['@deepseek-ai/dsh'], '0.1.0-rc.6')
    assert.equal(manifest.dependencies['@deepseek-ai/dsh-fs'], '0.1.0-rc.6')
    assert.equal(manifest.dependencies['@deepseek-ai/dsh-sandbox'], '0.1.0-rc.6')
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
})

test('writeStagingProject honours a configured registry', () => {
  const staging = mkdtempSync(path.join(os.tmpdir(), 'dsh-staging-'))
  try {
    writeStagingProject(staging, '0.1.0-rc.6', {}, 'https://registry.example.com/')
    const npmrc = readFileSync(path.join(staging, '.npmrc'), 'utf8')
    assert.match(npmrc, /registry=https:\/\/registry\.example\.com\//)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
})

test('dshFamilyPins covers every pinned @deepseek-ai/dsh-* package', () => {
  const pins = dshFamilyPins()
  assert.ok(pins.length > 0)
  assert.ok(pins.includes('@deepseek-ai/dsh-fs'))
  assert.ok(!pins.includes('@deepseek-ai/dsh'))
})

test('resolveAlignedFamily keeps only versions the registry published', async () => {
  const family = await resolveAlignedFamily({
    version: '0.1.0-rc.6',
    names: ['@deepseek-ai/dsh-fs', '@deepseek-ai/dsh-sandbox'],
    registry: 'https://registry.example.com/',
    fetcher: async (url) => {
      const name = url.split('/@deepseek-ai/').pop()
      return {
        ok: true,
        json: async () => ({
          versions: name === 'dsh-fs' ? { '0.1.0-rc.6': {} } : { '0.1.0-rc.5': {} },
        }),
      }
    },
  })
  assert.deepEqual(family, {
    available: ['@deepseek-ai/dsh-fs'],
    missing: ['@deepseek-ai/dsh-sandbox'],
  })
})

test('resolveAlignedFamily tolerates registry failures', async () => {
  const family = await resolveAlignedFamily({
    version: '0.1.0-rc.6',
    names: ['@deepseek-ai/dsh-fs'],
    fetcher: async () => {
      throw new Error('offline')
    },
  })
  assert.deepEqual(family, { available: [], missing: ['@deepseek-ai/dsh-fs'] })
})

test('readInstalledFamily reports aligned and missing family packages', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dsh-family-'))
  try {
    mkdirSync(path.join(root, 'node_modules', '@deepseek-ai', 'dsh-fs'), { recursive: true })
    writeFileSync(
      path.join(root, 'node_modules', '@deepseek-ai', 'dsh-fs', 'package.json'),
      `${JSON.stringify({ name: '@deepseek-ai/dsh-fs', version: '0.1.0-rc.6' })}\n`,
    )
    const family = readInstalledFamily(root, '0.1.0-rc.6')
    const fsEntry = family.find((item) => item.name === '@deepseek-ai/dsh-fs')
    const sandboxEntry = family.find((item) => item.name === '@deepseek-ai/dsh-sandbox')
    assert.deepEqual(fsEntry, { name: '@deepseek-ai/dsh-fs', version: '0.1.0-rc.6', aligned: true })
    assert.deepEqual(sandboxEntry, { name: '@deepseek-ai/dsh-sandbox', version: null, aligned: false })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
