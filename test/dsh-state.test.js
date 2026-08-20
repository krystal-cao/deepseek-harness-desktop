import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DSH_STATE_SCHEMA_VERSION,
  migrateDshState,
  readDshState,
  writeDshState,
} from '../src/dsh-state.js'

test('migrateDshState upgrades legacy files and keeps future files intact', () => {
  assert.deepEqual(migrateDshState({ selectedVersion: '0.1.0-rc.6' }), {
    selectedVersion: '0.1.0-rc.6',
    schemaVersion: DSH_STATE_SCHEMA_VERSION,
  })
  const future = { schemaVersion: 99, selectedVersion: '0.1.0-rc.9' }
  assert.equal(migrateDshState(future), future)
})

test('dsh state round-trips through userData', () => {
  const userData = mkdtempSync(path.join(os.tmpdir(), 'dsh-state-'))
  try {
    assert.deepEqual(readDshState(userData), {
      schemaVersion: 1,
      selectedVersion: null,
      dismissedLatest: null,
      autoFollowLatest: true,
      npmRegistry: null,
      dshPort: null,
    })
    writeDshState(userData, {
      selectedVersion: '0.1.0-rc.6',
      dismissedLatest: '0.1.0-rc.7',
      autoFollowLatest: false,
      npmRegistry: 'https://registry.example.com/',
    })
    assert.deepEqual(readDshState(userData), {
      schemaVersion: 1,
      selectedVersion: '0.1.0-rc.6',
      dismissedLatest: '0.1.0-rc.7',
      autoFollowLatest: false,
      npmRegistry: 'https://registry.example.com/',
      dshPort: null,
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
      autoFollowLatest: true,
      npmRegistry: null,
      dshPort: null,
    })
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})
