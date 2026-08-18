import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readUserPathCache, userPathCacheFile, writeUserPathCache } from '../src/user-path-cache.js'

test('readUserPathCache returns null when no cache exists', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'upc-none-'))
  try {
    assert.equal(readUserPathCache(dir), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeUserPathCache then readUserPathCache round-trips the path', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'upc-round-'))
  try {
    writeUserPathCache(dir, '/usr/bin:/opt/homebrew/bin:/Users/test/.nvm/versions/node/v22/bin')
    assert.equal(
      readUserPathCache(dir),
      '/usr/bin:/opt/homebrew/bin:/Users/test/.nvm/versions/node/v22/bin',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeUserPathCache writes atomically via a temp file', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'upc-tmp-'))
  try {
    writeUserPathCache(dir, '/bin')
    const file = userPathCacheFile(dir)
    assert.ok(existsSync(file))
    assert.ok(!existsSync(`${file}.tmp`))
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { path: '/bin' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeUserPathCache ignores empty or non-string values', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'upc-empty-'))
  try {
    writeUserPathCache(dir, '')
    writeUserPathCache(dir, undefined)
    assert.equal(readUserPathCache(dir), null)
    assert.ok(!existsSync(userPathCacheFile(dir)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readUserPathCache tolerates a corrupt cache file', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'upc-corrupt-'))
  try {
    const file = userPathCacheFile(dir)
    writeFileSync(file, 'not json at all')
    assert.equal(readUserPathCache(dir), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})