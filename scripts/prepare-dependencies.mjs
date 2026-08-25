import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
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
  // Drop the old "node" shim from previous builds: it must never sit on the
  // dsh host PATH under a bare "node" name again.
  rmSync(path.join(binDir, 'node'), { force: true })

  // Swift builds provide their standalone runtime through DSH_NODE_BIN.
  // Electron builds fall back to running their main binary in Node mode.
  // Named "dsh-node" (not "node") so prepending this directory to PATH never
  // shadows the user's real node.
  const nodeShimPath = path.join(binDir, 'dsh-node')
  const nodeShim = `#!/bin/sh
SELF="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ -n "\${DSH_NODE_BIN:-}" ]; then
  if [ -x "$DSH_NODE_BIN" ]; then
    exec "$DSH_NODE_BIN" "$@"
  fi
  echo "dsh-node: DSH_NODE_BIN is not executable: $DSH_NODE_BIN" >&2
  exit 127
fi

ELECTRON_NODE="$SELF/../../../../MacOS/DSH"
if [ -x "$ELECTRON_NODE" ]; then
  exec env ELECTRON_RUN_AS_NODE=1 "$ELECTRON_NODE" "$@"
fi

echo "dsh-node: no bundled Node.js runtime found" >&2
exit 127
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
exec "$SELF/dsh-node" "$SELF/pnpm-pkg/bin/pnpm.cjs" "$@"
`
  writeFileSync(pnpmWrapperPath, pnpmWrapper)
  chmodSync(pnpmWrapperPath, 0o755)
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isMainModule()) {
  prepareBundledBin()
}
