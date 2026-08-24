import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectDarwinOptionalDependencySpecs,
  loadPackagingDependencyManifests,
  parsePackageSpec,
} from '../scripts/prepare-macos-package-dependencies.mjs'

test('collectDarwinOptionalDependencySpecs keeps both macOS architectures only', () => {
  const specs = collectDarwinOptionalDependencySpecs([
    {
      optionalDependencies: {
        '@example/native-darwin-arm64': '1.0.0',
        '@example/native-darwin-x64': '1.0.0',
        '@example/native-linux-x64': '1.0.0',
      },
    },
    {
      optionalDependencies: {
        '@example/native-darwin-arm64': '1.0.0',
        'other-darwin-x64': '2.0.0',
      },
    },
  ])

  assert.deepEqual(specs, [
    '@example/native-darwin-arm64@1.0.0',
    '@example/native-darwin-x64@1.0.0',
    'other-darwin-x64@2.0.0',
  ])
})

test('parsePackageSpec handles scoped and unscoped exact versions', () => {
  assert.deepEqual(parsePackageSpec('@img/sharp-darwin-x64@0.35.3'), {
    name: '@img/sharp-darwin-x64',
    version: '0.35.3',
  })
  assert.deepEqual(parsePackageSpec('node-addon-require-builtin-darwin-x64@0.1.5'), {
    name: 'node-addon-require-builtin-darwin-x64',
    version: '0.1.5',
  })
  assert.throws(() => parsePackageSpec('missing-version'), /Invalid package spec/)
})

test('packaging dependency manifests cover arm64 and x64 for every native family', () => {
  const specs = collectDarwinOptionalDependencySpecs(loadPackagingDependencyManifests())
  for (const family of [
    '@img/sharp-darwin',
    '@img/sharp-libvips-darwin',
    '@koromix/koffi-darwin',
    '@vscode/ripgrep-darwin',
    'node-addon-require-builtin-darwin',
  ]) {
    assert.equal(specs.some((spec) => spec.startsWith(`${family}-arm64@`)), true)
    assert.equal(specs.some((spec) => spec.startsWith(`${family}-x64@`)), true)
  }
})
