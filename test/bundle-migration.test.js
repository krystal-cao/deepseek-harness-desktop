import assert from 'node:assert/strict'
import test from 'node:test'
import { migrateLegacyBundleName } from '../src/bundle-migration.js'

test('migrates /Applications/DeepSeek Harness.app to DSH.app when packaged on darwin', () => {
  let renamedFrom = null
  let renamedTo = null

  const result = migrateLegacyBundleName({
    isPackaged: true,
    platform: 'darwin',
    exePath: '/Applications/DeepSeek Harness.app/Contents/MacOS/DSH',
    existsSync: () => false,
    renameSync: (from, to) => {
      renamedFrom = from
      renamedTo = to
    },
  })

  assert.equal(result, true)
  assert.equal(renamedFrom, '/Applications/DeepSeek Harness.app')
  assert.equal(renamedTo, '/Applications/DSH.app')
})

test('does nothing when not packaged or not darwin', () => {
  assert.equal(
    migrateLegacyBundleName({
      isPackaged: false,
      platform: 'darwin',
      exePath: '/Applications/DeepSeek Harness.app/Contents/MacOS/DSH',
    }),
    false
  )

  assert.equal(
    migrateLegacyBundleName({
      isPackaged: true,
      platform: 'linux',
      exePath: '/opt/DeepSeek Harness/DSH',
    }),
    false
  )
})

test('does nothing if target DSH.app already exists', () => {
  let renamed = false
  const result = migrateLegacyBundleName({
    isPackaged: true,
    platform: 'darwin',
    exePath: '/Applications/DeepSeek Harness.app/Contents/MacOS/DSH',
    existsSync: () => true,
    renameSync: () => {
      renamed = true
    },
  })

  assert.equal(result, false)
  assert.equal(renamed, false)
})

test('does nothing if already running as DSH.app', () => {
  let renamed = false
  const result = migrateLegacyBundleName({
    isPackaged: true,
    platform: 'darwin',
    exePath: '/Applications/DSH.app/Contents/MacOS/DSH',
    existsSync: () => false,
    renameSync: () => {
      renamed = true
    },
  })

  assert.equal(result, false)
  assert.equal(renamed, false)
})
