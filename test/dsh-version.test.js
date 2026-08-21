import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  parseAllowScriptKey,
  rewriteDshLockfile,
  rewriteDshPins,
  syncAllowScriptsVersions,
} from '../scripts/dsh-version.mjs'

test('rewriteDshPins bumps every @deepseek-ai/dsh* pin together', () => {
  const pkg = {
    dependencies: {
      '@deepseek-ai/dsh': '0.1.0-rc.6',
      '@deepseek-ai/dsh-fs': '0.1.0-rc.6',
      electron: '43.4.0',
    },
  }
  const changed = rewriteDshPins(pkg, '0.1.0-rc.7')
  assert.deepEqual(changed, ['@deepseek-ai/dsh@0.1.0-rc.7', '@deepseek-ai/dsh-fs@0.1.0-rc.7'])
  assert.equal(pkg.dependencies['@deepseek-ai/dsh'], '0.1.0-rc.7')
  assert.equal(pkg.dependencies.electron, '43.4.0')
})

test('parseAllowScriptKey splits scoped, unscoped and unversioned keys', () => {
  assert.deepEqual(parseAllowScriptKey('@google/genai@1.52.0'), {
    name: '@google/genai',
    version: '1.52.0',
  })
  assert.deepEqual(parseAllowScriptKey('koffi@3.1.4'), { name: 'koffi', version: '3.1.4' })
  assert.deepEqual(parseAllowScriptKey('node-pty'), { name: 'node-pty', version: null })
  assert.equal(parseAllowScriptKey(42), null)
})

test('syncAllowScriptsVersions rewrites pins to installed versions', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dsh-allowscripts-'))
  const writeVersion = (name, version) => {
    mkdirSync(path.join(root, 'node_modules', name), { recursive: true })
    writeFileSync(
      path.join(root, 'node_modules', name, 'package.json'),
      `${JSON.stringify({ name, version })}\n`,
    )
  }
  try {
    writeVersion('@google/genai', '1.53.0')
    writeVersion('koffi', '3.2.0')
    const pkg = {
      allowScripts: {
        '@google/genai@1.52.0': true,
        'koffi@3.1.4': true,
        'node-pty@1.1.0': true,
      },
    }
    const changed = syncAllowScriptsVersions(pkg, root)
    assert.equal(changed, 2)
    assert.deepEqual(pkg.allowScripts, {
      '@google/genai@1.53.0': true,
      'koffi@3.2.0': true,
      'node-pty@1.1.0': true,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rewriteDshLockfile rewrites packages and dependency ranges', () => {
  const lock = {
    packages: {
      '': {
        dependencies: {
          '@deepseek-ai/dsh': '0.1.0-rc.6',
          electron: '43.4.0',
        },
      },
      'node_modules/@deepseek-ai/dsh': {
        version: '0.1.0-rc.6',
        resolved: 'https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.0-rc.6.tgz',
        integrity: 'sha512-abc',
        dependencies: {
          '@deepseek-ai/dsh-fs': '^0.1.0-rc.6',
          other: '1.0.0',
        },
      },
      'node_modules/@deepseek-ai/dsh-skill-filesystem/node_modules/chokidar': {
        version: '5.0.0',
        resolved: 'https://registry.npmjs.org/chokidar/-/chokidar-5.0.0.tgz',
        integrity: 'sha512-def',
      },
    },
  }
  const changed = rewriteDshLockfile(lock, '0.1.1-rc.1')
  assert.equal(changed, 3)
  assert.equal(lock.packages[''].dependencies['@deepseek-ai/dsh'], '0.1.1-rc.1')
  assert.equal(lock.packages['node_modules/@deepseek-ai/dsh'].version, '0.1.1-rc.1')
  assert.equal(
    lock.packages['node_modules/@deepseek-ai/dsh'].resolved,
    'https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.1-rc.1.tgz',
  )
  assert.equal(lock.packages['node_modules/@deepseek-ai/dsh'].integrity, undefined)
  assert.equal(
    lock.packages['node_modules/@deepseek-ai/dsh'].dependencies['@deepseek-ai/dsh-fs'],
    '^0.1.1-rc.1',
  )
  assert.equal(
    lock.packages['node_modules/@deepseek-ai/dsh-skill-filesystem/node_modules/chokidar'].version,
    '5.0.0',
  )
  assert.equal(
    lock.packages['node_modules/@deepseek-ai/dsh-skill-filesystem/node_modules/chokidar'].resolved,
    'https://registry.npmjs.org/chokidar/-/chokidar-5.0.0.tgz',
  )
})
