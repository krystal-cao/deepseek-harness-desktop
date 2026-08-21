import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  DSH_ANY_VERSION_PATTERN,
  DESKTOP_BUNDLE_ID,
  DSH_VERSION_PATTERN,
  isNewerVersion,
  normalizeNpmRegistry,
  resolveAutoCheckIntervalMs,
  resolveNpmRegistry,
  resolveUpdaterCacheDirName,
  resolveUpdateFeed,
  sortDshVersions,
  shouldEnableAutoUpdate,
} from '../src/updater-config.js'

test('resolveUpdaterCacheDirName follows the electron-builder convention', () => {
  assert.equal(resolveUpdaterCacheDirName('deepseek-harness-desktop'), 'deepseek-harness-desktop-updater')
  assert.equal(resolveUpdaterCacheDirName(), 'deepseek-harness-desktop-updater')
})

test('sortDshVersions orders rc versions newest-first numerically', () => {
  assert.deepEqual(
    sortDshVersions(['0.1.0-rc.6', '0.1.0-rc.10', '0.1.0-rc.5']),
    ['0.1.0-rc.10', '0.1.0-rc.6', '0.1.0-rc.5'],
  )
  assert.deepEqual(sortDshVersions([]), [])
})

test('updater cache dir name and bundle id stay in sync with package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(resolveUpdaterCacheDirName(pkg.name), `${pkg.name}-updater`)
  assert.equal(DESKTOP_BUNDLE_ID, pkg.build.appId)
})

test('isNewerVersion compares rc and stable versions', () => {
  assert.equal(isNewerVersion('0.1.0-rc.7', '0.1.0-rc.6'), true)
  assert.equal(isNewerVersion('0.1.0-rc.6', '0.1.0-rc.6'), false)
  assert.equal(isNewerVersion('0.1.0-rc.5', '0.1.0-rc.6'), false)
  assert.equal(isNewerVersion('0.1.0', '0.1.0-rc.9'), true)
  assert.equal(isNewerVersion('0.2.0-rc.1', '0.1.0-rc.9'), true)
  assert.equal(isNewerVersion('0.1.0-rc.6', '0.2.0-rc.1'), false)
  assert.equal(isNewerVersion('not-a-version', '0.1.0-rc.6'), false)
  assert.equal(isNewerVersion('0.1.0-rc.6', undefined), false)
})

test('DSH_VERSION_PATTERN accepts official dsh semver and rc versions', () => {
  assert.match('0.1.0-rc.6', DSH_VERSION_PATTERN)
  assert.match('0.1.0-rc.10', DSH_VERSION_PATTERN)
  assert.match('0.1.1-rc.1', DSH_VERSION_PATTERN)
  assert.match('0.0.1-rc.5', DSH_VERSION_PATTERN)
  assert.match('0.1.0', DSH_VERSION_PATTERN)
  assert.match('1.0.0', DSH_VERSION_PATTERN)
  assert.doesNotMatch('0.1.0-rc', DSH_VERSION_PATTERN)
  assert.doesNotMatch('../../etc', DSH_VERSION_PATTERN)
  assert.doesNotMatch('latest', DSH_VERSION_PATTERN)
})

test('DSH_ANY_VERSION_PATTERN accepts every official dsh version', () => {
  for (const version of ['0.0.1-rc.1', '0.0.1-rc.2', '0.0.1-rc.5', '0.1.0-rc.2', '0.1.0-rc.3', '0.1.0-rc.6']) {
    assert.match(version, DSH_ANY_VERSION_PATTERN)
  }
  assert.doesNotMatch('0.1.0-rc', DSH_ANY_VERSION_PATTERN)
  assert.doesNotMatch('../../etc', DSH_ANY_VERSION_PATTERN)
  assert.doesNotMatch('latest', DSH_ANY_VERSION_PATTERN)
})

test('resolveUpdateFeed returns a generic feed only when configured', () => {
  assert.equal(resolveUpdateFeed({}), undefined)
  assert.deepEqual(resolveUpdateFeed({ DSH_UPDATE_URL: 'https://example.com/updates' }), {
    provider: 'generic',
    url: 'https://example.com/updates',
  })
})

test('resolveNpmRegistry defaults to the domestic mirror with an env override', () => {
  assert.equal(resolveNpmRegistry({}), 'https://registry.npmmirror.com/')
  assert.equal(
    resolveNpmRegistry({ DSH_NPM_REGISTRY: 'https://registry.npmjs.org/' }),
    'https://registry.npmjs.org/',
  )
  assert.equal(
    resolveNpmRegistry({ DSH_NPM_REGISTRY: 'https://registry.npmjs.org/' }, 'https://registry.example.com/'),
    'https://registry.example.com/',
  )
})

test('normalizeNpmRegistry normalizes URLs and rejects bad input', () => {
  assert.equal(normalizeNpmRegistry(' https://registry.example.com/ '), 'https://registry.example.com/')
  assert.equal(normalizeNpmRegistry('https://registry.example.com'), 'https://registry.example.com/')
  assert.equal(normalizeNpmRegistry(null), null)
  assert.equal(normalizeNpmRegistry(''), null)
  assert.throws(() => normalizeNpmRegistry('ftp://registry.example.com/'), /http/)
  assert.throws(() => normalizeNpmRegistry('not a url'), /URL/)
  assert.throws(() => normalizeNpmRegistry(42), /无效/)
})

test('resolveAutoCheckIntervalMs honours a valid override', () => {
  assert.equal(resolveAutoCheckIntervalMs({}), 4 * 60 * 60 * 1000)
  assert.equal(resolveAutoCheckIntervalMs({ DSH_UPDATE_CHECK_INTERVAL_MS: '15000' }), 15000)
  assert.equal(resolveAutoCheckIntervalMs({ DSH_UPDATE_CHECK_INTERVAL_MS: '0' }), 4 * 60 * 60 * 1000)
  assert.equal(resolveAutoCheckIntervalMs({ DSH_UPDATE_CHECK_INTERVAL_MS: 'abc' }), 4 * 60 * 60 * 1000)
})

test('shouldEnableAutoUpdate only runs in packaged builds unless disabled', () => {
  assert.equal(shouldEnableAutoUpdate({}, false), false)
  assert.equal(shouldEnableAutoUpdate({}, true), true)
  assert.equal(shouldEnableAutoUpdate({ DSH_DISABLE_AUTO_UPDATE: '1' }, true), false)
})
