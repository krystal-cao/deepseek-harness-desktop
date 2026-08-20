import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildDshCommand,
  buildDshArgs,
  extractReadyUrl,
  resolveDshEntry,
  resolveDshEntrySource,
  supportsNoOpen,
  unpackedPath,
  withBundledBinPath,
} from '../src/dsh-service.js'

test('extractReadyUrl reads the canonical loopback readiness URL', () => {
  assert.equal(
    extractReadyUrl('booting\ndsh web: http://127.0.0.1:60882\n'),
    'http://127.0.0.1:60882',
  )
})

test('withBundledBinPath prepends the bundled bin directory to PATH', () => {
  assert.deepEqual(withBundledBinPath({ PATH: '/usr/bin:/bin' }, '/opt/app/assets/bin'), {
    PATH: `/opt/app/assets/bin${path.delimiter}/usr/bin:/bin`,
  })
  assert.deepEqual(withBundledBinPath({ PATH: '/usr/bin' }, undefined), { PATH: '/usr/bin' })
  assert.deepEqual(withBundledBinPath({}, '/opt/app/assets/bin'), { PATH: '/opt/app/assets/bin' })
})

test('extractReadyUrl ignores non-loopback output', () => {
  assert.equal(extractReadyUrl('dsh web: http://192.168.1.10:3080'), undefined)
})

test('resolveDshEntry finds the pinned CLI package', () => {
  assert.equal(
    resolveDshEntry().endsWith(path.join('@deepseek-ai', 'dsh', 'lib', 'bin.js')),
    true,
  )
})

test('resolveDshEntry prefers an installed version when present', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-entry-'))
  try {
    const entry = path.join(dir, '0.1.0-rc.6', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    mkdirSync(path.dirname(entry), { recursive: true })
    writeFileSync(entry, '')
    assert.equal(resolveDshEntry('0.1.0-rc.6', dir), entry)
    const older = path.join(dir, '0.0.1-rc.5', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    mkdirSync(path.dirname(older), { recursive: true })
    writeFileSync(older, '')
    assert.equal(resolveDshEntry('0.0.1-rc.5', dir), older)
    assert.equal(
      resolveDshEntry('0.1.0-rc.5', dir).endsWith(path.join('@deepseek-ai', 'dsh', 'lib', 'bin.js')),
      true,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resolveDshEntry ignores unsafe version paths', () => {
  assert.equal(
    resolveDshEntry('../../etc', '/tmp').endsWith(path.join('@deepseek-ai', 'dsh', 'lib', 'bin.js')),
    true,
  )
})

test('resolveDshEntrySource reports a user tree only when its entry exists', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-source-'))
  try {
    const entry = path.join(dir, '0.1.0-rc.6', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    mkdirSync(path.dirname(entry), { recursive: true })
    writeFileSync(entry, '')
    assert.equal(resolveDshEntrySource('0.1.0-rc.6', dir), 'user')
    // Not installed, unsafe version strings, missing arguments → bundled.
    assert.equal(resolveDshEntrySource('0.1.0-rc.7', dir), 'bundled')
    assert.equal(resolveDshEntrySource('../../etc', dir), 'bundled')
    assert.equal(resolveDshEntrySource('0.1.0-rc.6', undefined), 'bundled')
    assert.equal(resolveDshEntrySource(undefined, dir), 'bundled')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resolveDshEntrySource and resolveDshEntry agree on the same candidate', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-source-'))
  try {
    const entry = path.join(dir, '0.1.0-rc.6', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    mkdirSync(path.dirname(entry), { recursive: true })
    writeFileSync(entry, '')
    assert.equal(resolveDshEntrySource('0.1.0-rc.6', dir), 'user')
    assert.equal(resolveDshEntry('0.1.0-rc.6', dir), entry)
    assert.equal(resolveDshEntrySource('0.0.1-rc.5', dir), 'bundled')
    assert.equal(
      resolveDshEntry('0.0.1-rc.5', dir).endsWith(path.join('@deepseek-ai', 'dsh', 'lib', 'bin.js')),
      true,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('unpackedPath maps packaged dependencies to Electron unpacked resources', () => {
  assert.equal(
    unpackedPath('/Applications/DSH.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js'),
    '/Applications/DSH.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/bin.js',
  )
  assert.equal(unpackedPath('/workspace/node_modules/@deepseek-ai/dsh/lib/bin.js'), '/workspace/node_modules/@deepseek-ai/dsh/lib/bin.js')
})

test('buildDshArgs includes the runtime flag required by upstream HMR', () => {
  assert.deepEqual(buildDshArgs('/app/dsh.js'), [
    '--expose-internals',
    '/app/dsh.js',
    '--profile',
    'web',
    '--host',
    '127.0.0.1',
    '--port',
    '3080',
  ])
})

test('buildDshCommand starts Electron directly with the dsh args', () => {
  assert.deepEqual(buildDshCommand({
    electronExecutable: 'C:\\app\\DSH.exe',
    entry: 'C:\\app\\dsh.js',
  }), {
    command: 'C:\\app\\DSH.exe',
    args: [
      '--expose-internals',
      'C:\\app\\dsh.js',
      '--profile',
      'web',
      '--host',
      '127.0.0.1',
      '--port',
      '3080',
    ],
  })
})

test('supportsNoOpen only for dsh 0.1.0-rc.8 and later', () => {
  assert.equal(supportsNoOpen('0.1.0-rc.7'), false)
  assert.equal(supportsNoOpen('0.1.0-rc.8'), true)
  assert.equal(supportsNoOpen('0.1.0-rc.9'), true)
  // Unrecognized/stable versions are assumed newer-capable.
  assert.equal(supportsNoOpen('0.2.0'), true)
  assert.equal(supportsNoOpen(undefined), false)
})

test('buildDshArgs appends --no-open only when requested', () => {
  const base = [
    '--expose-internals',
    '/app/dsh.js',
    '--profile',
    'web',
    '--host',
    '127.0.0.1',
    '--port',
    '3080',
  ]
  assert.deepEqual(buildDshArgs('/app/dsh.js'), base)
  assert.deepEqual(buildDshArgs('/app/dsh.js', { noOpen: false }), base)
  assert.deepEqual(buildDshArgs('/app/dsh.js', { noOpen: true }), [...base, '--no-open'])
})

