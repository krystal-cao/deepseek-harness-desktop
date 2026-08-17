import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildDshPluginArgs,
  ensureProfileNpmrc,
  ensurePnpmShimDir,
  parsePnpmListJson,
  resolveLocalPluginVersions,
  resolvePluginPnpmEnv,
  validatePluginSpec,
} from '../src/dsh-plugins.js'

test('buildDshPluginArgs follows the dsh plugin subcommand grammar', () => {
  assert.deepEqual(
    buildDshPluginArgs('/entry/bin.js', ['list', '--json'], 'web'),
    ['--expose-internals', '/entry/bin.js', 'plugin', '--profile', 'web', 'list', '--json'],
  )
  assert.deepEqual(
    buildDshPluginArgs('/entry/bin.js', ['add', 'dshmarket']),
    ['--expose-internals', '/entry/bin.js', 'plugin', '--profile', 'web', 'add', 'dshmarket'],
  )
})

test('validatePluginSpec accepts npm names, scoped names and github specs', () => {
  assert.equal(validatePluginSpec('dshmarket'), true)
  assert.equal(validatePluginSpec('@scope/name'), true)
  assert.equal(validatePluginSpec('@scope/name@1.2.3'), true)
  assert.equal(validatePluginSpec('github:owner/repo'), true)
  assert.equal(validatePluginSpec('-rf /'), false)
  assert.equal(validatePluginSpec('../../etc'), false)
  assert.equal(validatePluginSpec('a b'), false)
  assert.equal(validatePluginSpec(''), false)
  assert.equal(validatePluginSpec(undefined), false)
})

test('parsePnpmListJson extracts direct dependencies only', () => {
  const { plugins, path: profilePath } = parsePnpmListJson(JSON.stringify([
    {
      name: 'web',
      path: '/x',
      dependencies: {
        dshmarket: { version: '1.2.3', from: 'dshmarket@^1' },
        '@deepseek-ai/dsh-base': { version: '0.1.0-rc.6', from: '...' },
      },
    },
  ]))
  assert.deepEqual(plugins, [{ name: 'dshmarket', version: '1.2.3' }])
  assert.equal(profilePath, '/x')
})

test('parsePnpmListJson tolerates non-JSON output', () => {
  const { plugins, raw, path: profilePath } = parsePnpmListJson('not json at all')
  assert.deepEqual(plugins, [])
  assert.equal(raw, 'not json at all')
  assert.equal(profilePath, null)
})

test('resolveLocalPluginVersions resolves file: specs to real versions', () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-'))
  const localPkg = path.join(profileDir, 'node_modules', 'dsh-desktop-host')
  try {
    mkdirSync(localPkg, { recursive: true })
    writeFileSync(
      path.join(localPkg, 'package.json'),
      `${JSON.stringify({ name: 'dsh-desktop-host', version: '0.1.0' })}\n`,
    )
    const resolved = resolveLocalPluginVersions({
      path: profileDir,
      plugins: [
        { name: 'dsh-desktop-host', version: `file:${localPkg}` },
        { name: 'dshmarket', version: '1.8.0' },
        { name: 'broken-local', version: 'file:./missing' },
      ],
    })
    assert.deepEqual(resolved.plugins, [
      { name: 'dsh-desktop-host', version: '0.1.0', local: true },
      { name: 'dshmarket', version: '1.8.0' },
      { name: 'broken-local', version: null, local: true },
    ])
  } finally {
    rmSync(profileDir, { recursive: true, force: true })
  }
})

test('ensurePnpmShimDir writes an executable pnpm shim', () => {
  const dir = ensurePnpmShimDir({ electronExecutable: '/x/Electron', pnpmCli: '/x/pnpm.cjs' })
  const shim = path.join(dir, 'pnpm')
  assert.ok(existsSync(shim))
  assert.ok(statSync(shim).mode & 0o111)
  const content = readFileSync(shim, 'utf8')
  assert.match(content, /\/x\/Electron/)
  assert.match(content, /\/x\/pnpm\.cjs/)
})

test('resolvePluginPnpmEnv prepends a pnpm bin dir in dev builds', () => {
  const env = resolvePluginPnpmEnv({
    env: { PATH: '/usr/bin' },
    electronExecutable: '/x/Electron',
    isPackaged: false,
    pnpmCli: '/x/pnpm.cjs',
  })
  assert.ok(env.PATH.startsWith(os.tmpdir()))
  assert.ok(env.PATH.endsWith(path.delimiter + '/usr/bin'))
})

test('resolvePluginPnpmEnv leaves env untouched without a bundled bin', () => {
  const env = resolvePluginPnpmEnv({
    env: { PATH: '/usr/bin' },
    electronExecutable: '/x/Electron',
    isPackaged: true,
  })
  assert.equal(env.PATH, '/usr/bin')
})

test('ensureProfileNpmrc writes the configured registry into the profile dir', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-'))
  try {
    ensureProfileNpmrc(dir, 'https://registry.npmmirror.com/')
    const npmrc = readFileSync(path.join(dir, '.npmrc'), 'utf8')
    assert.match(npmrc, /registry=https:\/\/registry\.npmmirror\.com\//)
    assert.match(npmrc, /prefer-offline=true/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
