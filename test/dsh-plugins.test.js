import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  bridgePluginInstalled,
  buildDshPluginArgs,
  detectExternalThemeInProfile,
  enrichPluginMetadata,
  ensureProfileNpmrc,
  ensureProfilePnpmWorkspaceConfig,
  ensurePnpmShimDir,
  formatPnpmResultError,
  isLocalSpec,
  localSpecTarget,
  npmPackageExists,
  packageNameFromSpec,
  parsePnpmListJson,
  parsePnpmOutdatedJson,
 profileLocalSpecIsMissing,
  resolveLocalPluginVersions,
  resolvePluginPnpmEnv,
  resolveWebProfileDir,
  repointLocalSpec,
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
  assert.deepEqual(
    buildDshPluginArgs('/entry/bin.js', ['update', 'dshmarket', '--latest']),
    ['--expose-internals', '/entry/bin.js', 'plugin', '--profile', 'web', 'update', 'dshmarket', '--latest'],
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

test('parsePnpmOutdatedJson extracts registry update info and ignores other dependency types', () => {
  const { outdated } = parsePnpmOutdatedJson(
    JSON.stringify({
      '@anionex/dsh-vision-toolkit': {
        current: '0.1.26',
        latest: '0.1.28',
        wanted: '0.1.26',
        isDeprecated: false,
        dependencyType: 'dependencies',
      },
      'some-dev-dep': {
        current: '2.0.0',
        latest: '3.0.0',
        wanted: '2.0.0',
        isDeprecated: true,
        dependencyType: 'devDependencies',
      },
      junk: 'not-an-object',
    }),
  )
  assert.deepEqual(outdated, {
    '@anionex/dsh-vision-toolkit': {
      current: '0.1.26',
      latest: '0.1.28',
      wanted: '0.1.26',
      deprecated: false,
    },
  })
})

test('parsePnpmOutdatedJson tolerates empty and malformed output', () => {
  assert.deepEqual(parsePnpmOutdatedJson('{}').outdated, {})
  assert.deepEqual(parsePnpmOutdatedJson('[]').outdated, {})
  assert.deepEqual(parsePnpmOutdatedJson('not json at all').outdated, {})
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

test('enrichPluginMetadata reads descriptions from the profile tree', () => {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-'))
  try {
    mkdirSync(path.join(profileDir, 'node_modules', 'dshmarket'), { recursive: true })
    writeFileSync(
      path.join(profileDir, 'node_modules', 'dshmarket', 'package.json'),
      `${JSON.stringify({ name: 'dshmarket', version: '1.8.0', description: '插件市场' })}\n`,
    )
    const enriched = enrichPluginMetadata({
      path: profileDir,
      plugins: [
        { name: 'dshmarket', version: '1.8.0' },
        { name: 'no-description', version: '1.0.0' },
      ],
    })
    assert.deepEqual(enriched.plugins, [
      { name: 'dshmarket', version: '1.8.0', description: '插件市场' },
      { name: 'no-description', version: '1.0.0', description: null },
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

test('ensureProfilePnpmWorkspaceConfig relaxes the release-age gate without touching the rest of the file', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-workspace-'))
  try {
    writeFileSync(
      path.join(dir, 'pnpm-workspace.yaml'),
      [
        'packages:',
        '  - .',
        'nodeLinker: hoisted',
        'minimumReleaseAgeExclude:',
        '  - dshmarket@1.4.0',
        'allowBuilds:',
        '  node-pty: true',
        '',
      ].join('\n'),
    )
    ensureProfilePnpmWorkspaceConfig(dir)
    const content = readFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'utf8')
    assert.match(content, /^minimumReleaseAge: 0$/m)
    assert.match(content, /nodeLinker: hoisted/)
    assert.match(content, /dshmarket@1\.4\.0/)
    assert.match(content, /node-pty: true/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('ensureProfilePnpmWorkspaceConfig replaces an existing release-age value instead of duplicating it', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-workspace-'))
  try {
    writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 720\nnodeLinker: hoisted\n')
    ensureProfilePnpmWorkspaceConfig(dir)
    const content = readFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'utf8')
    assert.equal((content.match(/^minimumReleaseAge:/gm) ?? []).length, 1)
    assert.match(content, /^minimumReleaseAge: 0$/m)
    assert.match(content, /nodeLinker: hoisted/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('localSpecTarget resolves the file: spec to an on-disk path', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-'))
  try {
    const abs = path.join(dir, 'abs-bundle')
    mkdirSync(abs)
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-desktop-host': `file:${abs}` },
    }))
    assert.equal(localSpecTarget(dir, 'dsh-desktop-host'), abs)

    // Relative file: specs resolve against the profile directory.
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-desktop-host': 'file:rel/bundle' },
    }))
    assert.equal(localSpecTarget(dir, 'dsh-desktop-host'), path.join(dir, 'rel', 'bundle'))

    // Registry specs and unknown plugins have no local target.
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-desktop-host': '^1.0.0' },
    }))
    assert.equal(localSpecTarget(dir, 'dsh-desktop-host'), null)
    assert.equal(localSpecTarget(dir, 'missing-plugin'), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('bridgePluginInstalled reports presence by file spec and bundle existence', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-'))
  try {
    // No local spec at all → not installed (third-party removal clears it).
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: {} }))
    assert.equal(bridgePluginInstalled(dir, 'dsh-desktop-host'), false)

    // Local spec present and target exists → installed.
    const live = path.join(dir, 'bundle')
    mkdirSync(live)
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-desktop-host': `file:${live}` },
    }))
    assert.equal(bridgePluginInstalled(dir, 'dsh-desktop-host'), true)

    // Local spec present but target gone (dead spec) → not installed.
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-desktop-host': 'file:/gone/bundle' },
    }))
    assert.equal(bridgePluginInstalled(dir, 'dsh-desktop-host'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resolveWebProfileDir honors DSH_HOME and the default home', () => {
  assert.match(resolveWebProfileDir({ DSH_HOME: '/tmp/custom-dsh' }), /^\/tmp\/custom-dsh\/profiles\/web$/)
  assert.match(resolveWebProfileDir({}), /\/\.dsh\/profiles\/web$/)
  assert.match(resolveWebProfileDir(), /\/\.dsh\/profiles\/web$/)
})

test('profileLocalSpecIsMissing detects dead local file: specs', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-'))
  try {
    const live = path.join(dir, 'live-bundle')
    mkdirSync(live)
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-desktop-host': `file:${live}` },
    }))
    assert.equal(profileLocalSpecIsMissing(dir, 'dsh-desktop-host'), false)

    const dead = path.join(dir, 'gone-bundle')
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-desktop-host': `file:${dead}` },
    }))
    assert.equal(profileLocalSpecIsMissing(dir, 'dsh-desktop-host'), true)

    // Registry specs are never "missing".
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-desktop-host': '^1.0.0' },
    }))
    assert.equal(profileLocalSpecIsMissing(dir, 'dsh-desktop-host'), false)
    assert.equal(profileLocalSpecIsMissing(dir, 'unknown-plugin'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('repointLocalSpec rewrites a file: dependency to the new target', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-'))
  try {
    const target = path.join(dir, 'with space', 'bundle')
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-desktop-host': 'file:/old/gone', other: '^2.0.0' },
    }))
    assert.equal(repointLocalSpec(dir, 'dsh-desktop-host', target), true)
    const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies['dsh-desktop-host'], `file:${target}`)
    assert.equal(manifest.dependencies.other, '^2.0.0')
    // Missing plugin or missing manifest are left untouched.
    assert.equal(repointLocalSpec(dir, 'missing-plugin', target), false)
    assert.equal(repointLocalSpec(path.join(dir, 'nope'), 'dsh-desktop-host', target), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('formatPnpmResultError surfaces pnpm diagnostics from stdout over the dsh banner', () => {
  const message = formatPnpmResultError({
    code: 1,
    stdout: '[ERR_PNPM_FETCH_404] GET https://registry.npmmirror.com/dsh-model-usage: Not Found - 404' + '\n' + 'dsh-model-usage is not in the npm registry',
    stderr: 'dsh: pnpm failed in profile directory /Users/x/.dsh/profiles/web',
  })
  assert.match(message, /ERR_PNPM_FETCH_404/)
  assert.match(message, /not in the npm registry/)
  assert.match(message, /pnpm failed in profile directory/)
})

test('formatPnpmResultError keeps the tail within maxLength', () => {
  const long = 'x'.repeat(2000)
  const message = formatPnpmResultError({ code: 1, stdout: long, stderr: '' }, { maxLength: 100 })
  assert.equal(message.length, 100)
})

test('formatPnpmResultError falls back to the exit code when both streams are empty', () => {
  assert.match(formatPnpmResultError({ code: 127 }), /pnpm 退出码 127/)
  assert.match(formatPnpmResultError({}), /pnpm 退出码 unknown/)
})

test('packageNameFromSpec strips optional version ranges', () => {
  assert.equal(packageNameFromSpec('dshmarket'), 'dshmarket')
  assert.equal(packageNameFromSpec('dshmarket@1.2.3'), 'dshmarket')
  assert.equal(packageNameFromSpec('@scope/name'), '@scope/name')
  assert.equal(packageNameFromSpec('@scope/name@1.2.3'), '@scope/name')
  assert.equal(packageNameFromSpec(''), null)
  assert.equal(packageNameFromSpec(undefined), null)
})

test('isLocalSpec distinguishes local filesystem specs from registry names', () => {
  assert.equal(isLocalSpec('file:/Users/x/bundle'), true)
  assert.equal(isLocalSpec('file:./rel'), true)
  assert.equal(isLocalSpec('link:/Users/x/bundle'), true)
  assert.equal(isLocalSpec('workspace:foo'), true)
  assert.equal(isLocalSpec('./rel/path'), true)
  assert.equal(isLocalSpec('../up'), true)
  assert.equal(isLocalSpec('dshmarket'), false)
  assert.equal(isLocalSpec('@scope/name'), false)
  assert.equal(isLocalSpec('@scope/name@1.2.3'), false)
  assert.equal(isLocalSpec(undefined), false)
})

test('npmPackageExists reports 404 as false, ok as true, errors as unknown', async () => {
  const fetcher = async (url) => ({ status: url.includes('missing') ? 404 : 200, ok: !url.includes('missing') })
  assert.equal(await npmPackageExists({ name: 'dshmarket', fetcher }), true)
  assert.equal(await npmPackageExists({ name: 'missing', fetcher }), false)
  const throwing = async () => {
    throw new Error('network down')
  }
  assert.equal(await npmPackageExists({ name: 'dshmarket', fetcher: throwing }), null)
})

test('detectExternalThemeInProfile finds third-party theme/skin packages in package.json', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-'))
  try {
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: {
        'dsh-better-sidebar': '^0.14.0',
        '@dsh-external/dsh-client-ui-skin-maid-whale-webui': 'github:yunxiiQwQ/dsh-maid-whale-webUI#path:/maid-whale-webui',
      },
    }))
    assert.equal(
      detectExternalThemeInProfile(dir),
      '@dsh-external/dsh-client-ui-skin-maid-whale-webui',
    )

    // Ignores core deepseek-ai packages and desktop host/claude
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: {
        '@deepseek-ai/dsh-client-ui-theme': '^0.1.0',
        'dsh-desktop-host': 'file:/tmp/host',
        'dshmarket': '^1.0.0',
      },
    }))
    assert.equal(detectExternalThemeInProfile(dir), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

