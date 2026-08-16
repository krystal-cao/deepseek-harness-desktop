import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiProxyPath = path.join(
  root,
  'node_modules',
  '@deepseek-ai',
  'dsh-host-apiproxy',
  'lib',
  'index.js',
)
const windowsNodePath = path.join(root, 'assets', 'dsh-node.exe')
const nodeLicensePath = path.join(root, 'third-party-licenses', 'nodejs-LICENSE')

const ORIGINAL_WINDOWS_OPENER = `async function openWindowsPath(path, signal, run) {
\tawait run("powershell.exe", [
\t\t"-NoProfile",
\t\t"-Command",
\t\t\`Invoke-Item -LiteralPath \${powershellLiteral(path)}\`
\t], signal);
}`

const PATCHED_WINDOWS_OPENER = `async function openWindowsPath(path, signal, run) {
\tconst command = \`Invoke-Item -LiteralPath \${powershellLiteral(path)}\`;
\tconst encodedCommand = Buffer.from(command, "utf16le").toString("base64");
\tawait run("powershell.exe", [
\t\t"-NoLogo",
\t\t"-NoProfile",
\t\t"-NonInteractive",
\t\t"-EncodedCommand",
\t\tencodedCommand
\t], signal);
}`

export function encodeWindowsOpenCommand(targetPath) {
  const literal = `'${targetPath.replaceAll("'", "''")}'`
  const command = `Invoke-Item -LiteralPath ${literal}`
  return Buffer.from(command, 'utf16le').toString('base64')
}

export function patchWindowsPathOpener(source) {
  if (source.includes(PATCHED_WINDOWS_OPENER)) return source
  const matches = source.split(ORIGINAL_WINDOWS_OPENER).length - 1
  if (matches !== 1) {
    throw new Error(`Expected exactly one DeepSeek Harness Windows path opener, found ${matches}`)
  }
  return source.replace(ORIGINAL_WINDOWS_OPENER, PATCHED_WINDOWS_OPENER)
}

export function prepareApiProxy(target = apiProxyPath) {
  const source = readFileSync(target, 'utf8')
  const patched = patchWindowsPathOpener(source)
  if (patched !== source) writeFileSync(target, patched)
}

export function findNodeLicense(executablePath = process.execPath) {
  const executableDirectory = path.dirname(executablePath)
  const candidates = [
    path.join(executableDirectory, 'LICENSE'),
    path.join(executableDirectory, 'LICENSE.md'),
    path.join(executableDirectory, '..', 'LICENSE'),
  ]
  return candidates.find(existsSync)
}

export function prepareWindowsNode({
  platform = process.platform,
  executablePath = process.execPath,
  outputPath = windowsNodePath,
  licenseOutputPath = nodeLicensePath,
} = {}) {
  if (platform !== 'win32') return
  const licensePath = findNodeLicense(executablePath)
  if (!licensePath) {
    throw new Error(`Could not find the Node.js license next to ${executablePath}`)
  }

  mkdirSync(path.dirname(outputPath), { recursive: true })
  mkdirSync(path.dirname(licenseOutputPath), { recursive: true })
  copyFileSync(executablePath, outputPath)
  copyFileSync(licensePath, licenseOutputPath)
}

/**
 * Bundle a Node shim and pnpm so plugin installs work when the app is
 * launched from Finder/Dock (no shell PATH, no nvm/Homebrew binaries).
 * The node shim runs the packaged Electron binary in Node mode; the pnpm
 * wrapper calls that shim with the pnpm CLI bundled as a devDependency.
 */
export function prepareBundledBin({ platform = process.platform, root = process.cwd() } = {}) {
  if (platform !== 'darwin') return

  const binDir = path.join(root, 'assets', 'bin')
  mkdirSync(binDir, { recursive: true })
  rmSync(path.join(binDir, 'pnpm.cjs'), { force: true })

  // From <app>/Contents/Resources/app/assets/bin to the Electron binary at
  // <app>/Contents/MacOS/DeepSeek Harness.
  const nodeShimPath = path.join(binDir, 'node')
  const nodeShim = `#!/bin/sh
# Bundled Node shim: run the packaged Electron binary in Node mode so the
# dsh runtime and plugin installs find "node" without a shell PATH.
SELF="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec env ELECTRON_RUN_AS_NODE=1 "$SELF/../../../../MacOS/DeepSeek Harness" "$@"
`
  writeFileSync(nodeShimPath, nodeShim)
  chmodSync(nodeShimPath, 0o755)

  const pnpmSource = path.join(root, 'node_modules', 'pnpm')
  if (!existsSync(path.join(pnpmSource, 'bin', 'pnpm.cjs'))) {
    throw new Error(`pnpm CLI not found at ${pnpmSource}; add pnpm to devDependencies`)
  }
  const pnpmTarget = path.join(binDir, 'pnpm-pkg')
  rmSync(pnpmTarget, { recursive: true, force: true })
  cpSync(pnpmSource, pnpmTarget, { recursive: true })

  const pnpmWrapperPath = path.join(binDir, 'pnpm')
  rmSync(pnpmWrapperPath, { recursive: true, force: true })
  const pnpmWrapper = `#!/bin/sh
SELF="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$SELF/node" "$SELF/pnpm-pkg/bin/pnpm.cjs" "$@"
`
  writeFileSync(pnpmWrapperPath, pnpmWrapper)
  chmodSync(pnpmWrapperPath, 0o755)
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isMainModule()) {
  prepareApiProxy()
  prepareWindowsNode()
  prepareBundledBin()
}
