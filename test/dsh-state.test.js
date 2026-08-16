import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readDshState, writeDshState } from '../src/dsh-state.js'

test('dsh state round-trips through userData', () => {
  const userData = mkdtempSync(path.join(os.tmpdir(), 'dsh-state-'))
  try {
    assert.deepEqual(readDshState(userData), {
      schemaVersion: 1,
      selectedVersion: null,
      dismissedLatest: null,
    })
    writeDshState(userData, {
      selectedVersion: '0.1.0-rc.6',
      dismissedLatest: '0.1.0-rc.7',
    })
    assert.deepEqual(readDshState(userData), {
      schemaVersion: 1,
      selectedVersion: '0.1.0-rc.6',
      dismissedLatest: '0.1.0-rc.7',
    })
    const raw = JSON.parse(readFileSync(path.join(userData, 'dsh-state.json'), 'utf8'))
    assert.equal(raw.selectedVersion, '0.1.0-rc.6')
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})

test('dsh state falls back to defaults for corrupted files', () => {
  const userData = mkdtempSync(path.join(os.tmpdir(), 'dsh-state-'))
  try {
    writeFileSync(path.join(userData, 'dsh-state.json'), 'not json')
    assert.deepEqual(readDshState(userData), {
      schemaVersion: 1,
      selectedVersion: null,
      dismissedLatest: null,
    })
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})
