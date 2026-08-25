import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const manifestPaths = [
  'node_modules/@vscode/ripgrep/package.json',
  'node_modules/sharp/package.json',
  'node_modules/koffi/package.json',
  'node_modules/node-addon-require-builtin/package.json',
]

const darwinPackagePattern = /darwin-(?:arm64|x64)$/

export function collectDarwinOptionalDependencySpecs(manifests) {
  return [...new Set(manifests.flatMap((manifest) => (
    Object.entries(manifest.optionalDependencies ?? {})
      .filter(([name]) => darwinPackagePattern.test(name))
      .map(([name, version]) => `${name}@${version}`)
  )))].sort()
}

export function loadPackagingDependencyManifests(projectRoot = root) {
  return manifestPaths.map((relativePath) => (
    JSON.parse(readFileSync(path.join(projectRoot, relativePath), 'utf8'))
  ))
}

export function parsePackageSpec(spec) {
  const separator = spec.lastIndexOf('@')
  if (separator <= 0 || separator === spec.length - 1) {
    throw new Error(`Invalid package spec: ${spec}`)
  }
  return { name: spec.slice(0, separator), version: spec.slice(separator + 1) }
}

function installedPackageMatches(projectRoot, spec) {
  const { name, version } = parsePackageSpec(spec)
  const manifestPath = path.join(projectRoot, 'node_modules', name, 'package.json')
  if (!existsSync(manifestPath)) return false
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    return manifest.name === name && manifest.version === version
  } catch {
    return false
  }
}

export function prepareMacosPackageDependencies(projectRoot = root) {
  if (process.platform !== 'darwin') {
    throw new Error('macOS package dependencies can only be prepared on macOS')
  }

  const specs = collectDarwinOptionalDependencySpecs(loadPackagingDependencyManifests(projectRoot))
  if (specs.length === 0) {
    throw new Error('No Darwin optional dependencies were found for packaging')
  }

  const missingSpecs = specs.filter((spec) => !installedPackageMatches(projectRoot, spec))
  if (missingSpecs.length === 0) {
    console.log(`All ${specs.length} Darwin optional dependencies are already installed.`)
    return
  }

  console.log(`Fetching ${missingSpecs.length} missing Darwin optional dependencies...`)
  const stagingDirectory = mkdtempSync(path.join(os.tmpdir(), 'dsh-macos-packaging-'))
  try {
    const packOutput = execFileSync('npm', [
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination', stagingDirectory,
      ...missingSpecs,
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, npm_config_update_notifier: 'false' },
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    const archives = JSON.parse(packOutput)
    const archiveBySpec = new Map(archives.map((archive) => [
      `${archive.name}@${archive.version}`,
      archive.filename,
    ]))

    for (const [index, spec] of missingSpecs.entries()) {
      const { name, version } = parsePackageSpec(spec)
      const filename = archiveBySpec.get(spec)
      if (!filename) throw new Error(`npm pack did not return an archive for ${spec}`)

      const extractionDirectory = path.join(stagingDirectory, `unpacked-${index}`)
      mkdirSync(extractionDirectory)
      execFileSync('tar', [
        '-xzf', path.join(stagingDirectory, filename),
        '-C', extractionDirectory,
        '--strip-components=1',
      ])

      const extractedManifest = JSON.parse(
        readFileSync(path.join(extractionDirectory, 'package.json'), 'utf8'),
      )
      if (extractedManifest.name !== name || extractedManifest.version !== version) {
        throw new Error(`Downloaded archive identity mismatch for ${spec}`)
      }

      const destination = path.join(projectRoot, 'node_modules', name)
      mkdirSync(path.dirname(destination), { recursive: true })
      rmSync(destination, { recursive: true, force: true })
      renameSync(extractionDirectory, destination)
      console.log(`Installed ${spec}`)
    }
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true })
  }
}

const invokedDirectly = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false

if (invokedDirectly) {
  prepareMacosPackageDependencies()
}
