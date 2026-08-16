import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import {
  buildDshCommand,
  buildDshArgs,
  extractReadyUrl,
  resolveDshEntry,
  resolveWindowsHiddenConsoleLauncher,
  resolveWindowsNodeExecutable,
  resolveWindowsPickerPatch,
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
    PATH: '/opt/app/assets/bin:/usr/bin:/bin',
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

test('unpackedPath maps packaged dependencies to Electron unpacked resources', () => {
  assert.equal(
    unpackedPath('/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js'),
    '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/bin.js',
  )
  assert.equal(unpackedPath('/workspace/node_modules/@deepseek-ai/dsh/lib/bin.js'), '/workspace/node_modules/@deepseek-ai/dsh/lib/bin.js')
})

test('buildDshArgs includes the runtime flag required by upstream HMR', () => {
  assert.deepEqual(buildDshArgs('/app/dsh.js', { platform: 'darwin' }), [
    '--expose-internals',
    '/app/dsh.js',
    '--profile',
    'web',
    '--host',
    '127.0.0.1',
    '--port',
    '0',
  ])
})

test('buildDshArgs pins the browse directory picker on Windows', () => {
  assert.deepEqual(buildDshArgs('C:\\app\\dsh.js', {
    platform: 'win32',
    windowsPickerPatch: 'C:\\app\\windows-picker.yml',
  }), [
    '--expose-internals',
    'C:\\app\\dsh.js',
    '--profile',
    'web',
    '--patch',
    'C:\\app\\windows-picker.yml',
    '--host',
    '127.0.0.1',
    '--port',
    '0',
  ])
  assert.equal(resolveWindowsPickerPatch().endsWith('windows-directory-picker.patch.yml'), true)
})

test('buildDshCommand uses the hidden-console launcher on Windows', () => {
  assert.deepEqual(buildDshCommand({
    electronExecutable: 'C:\\app\\DeepSeek Harness.exe',
    entry: 'C:\\app\\dsh.js',
    platform: 'win32',
    windowsLauncher: 'C:\\app\\windows-hidden-console.exe',
    windowsNodeExecutable: 'C:\\app\\dsh-node.exe',
  }), {
    command: 'C:\\app\\windows-hidden-console.exe',
    args: [
      'C:\\app\\dsh-node.exe',
      '--expose-internals',
      'C:\\app\\dsh.js',
      '--profile',
      'web',
      '--patch',
      resolveWindowsPickerPatch(),
      '--host',
      '127.0.0.1',
      '--port',
      '0',
    ],
  })
})

test('buildDshCommand starts Electron directly on other platforms', () => {
  assert.deepEqual(buildDshCommand({
    electronExecutable: '/app/electron',
    entry: '/app/dsh.js',
    platform: 'linux',
  }), {
    command: '/app/electron',
    args: [
      '--expose-internals',
      '/app/dsh.js',
      '--profile',
      'web',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
    ],
  })
})

test('resolveWindowsHiddenConsoleLauncher points to the packaged launcher', () => {
  assert.equal(
    resolveWindowsHiddenConsoleLauncher().endsWith(path.join('assets', 'windows-hidden-console.exe')),
    true,
  )
})

test('resolveWindowsNodeExecutable points to the packaged console-subsystem Node runtime', () => {
  assert.equal(
    resolveWindowsNodeExecutable().endsWith(path.join('assets', 'dsh-node.exe')),
    true,
  )
})
