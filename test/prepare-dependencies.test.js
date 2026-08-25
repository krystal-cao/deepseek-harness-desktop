import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { prepareBundledBin } from '../scripts/prepare-dependencies.mjs'

test('bundled pnpm shim prefers the standalone Node runtime supplied by Swift', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dsh-bundled-bin-'))
  try {
    const pnpmCli = path.join(root, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
    mkdirSync(path.dirname(pnpmCli), { recursive: true })
    writeFileSync(pnpmCli, '')

    prepareBundledBin({ platform: 'darwin', root })

    const shim = path.join(root, 'assets', 'bin', 'dsh-node')
    chmodSync(shim, 0o755)
    const content = readFileSync(shim, 'utf8')
    assert.match(content, /DSH_NODE_BIN/)
    assert.match(content, /\.\.\/\.\.\/\.\.\/\.\.\/MacOS\/DSH/)

    const result = spawnSync(shim, ['standalone-node'], {
      encoding: 'utf8',
      env: { ...process.env, DSH_NODE_BIN: '/bin/echo' },
    })
    assert.equal(result.status, 0)
    assert.equal(result.stdout.trim(), 'standalone-node')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
