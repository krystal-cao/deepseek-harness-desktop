import assert from 'node:assert/strict'
import test from 'node:test'
import {
  UPDATER_STATES,
  canStartCheck,
  createUpdaterState,
  reduceUpdaterState,
} from '../src/updater-state.js'

const run = (events) =>
  events.reduce((state, event) => reduceUpdaterState(state, event), createUpdaterState())

test('initial state is idle and allows a check', () => {
  const state = createUpdaterState()
  assert.equal(state.state, 'idle')
  assert.equal(state.manual, false)
  assert.equal(state.lastError, null)
  assert.equal(state.info, null)
  assert.ok(canStartCheck(state))
})

test('check sets checking and the manual flag, blocking a second check', () => {
  const state = run([{ type: 'check', manual: true }])
  assert.equal(state.state, 'checking')
  assert.equal(state.manual, true)
  assert.equal(canStartCheck(state), false)
})

test('a new check is blocked while any flow is in flight', () => {
  for (const state of ['checking', 'downloading', 'downloaded', 'installing']) {
    assert.equal(
      canStartCheck({ ...createUpdaterState(), state }),
      false,
      `expected ${state} to block a new check`,
    )
  }
})

test('a check is allowed again after an error and clears the last error', () => {
  const state = run([
    { type: 'check', manual: false },
    { type: 'error', error: new Error('boom') },
  ])
  assert.equal(state.state, 'error')
  assert.match(state.lastError.message, /boom/)
  assert.equal(state.info, null)
  assert.ok(canStartCheck(state))
  const retried = reduceUpdaterState(state, { type: 'check', manual: false })
  assert.equal(retried.state, 'checking')
  assert.equal(retried.lastError, null)
})

test('available starts a download and records the update info', () => {
  const state = run([
    { type: 'check', manual: false },
    { type: 'available', info: { version: '0.3.0' } },
  ])
  assert.equal(state.state, 'downloading')
  assert.deepEqual(state.info, { version: '0.3.0' })
})

test('downloaded keeps the flow busy until the user decides', () => {
  const state = run([{ type: 'downloaded', info: { version: '0.3.0' } }])
  assert.equal(state.state, 'downloaded')
  assert.equal(canStartCheck(state), false)
})

test('defers the restart, checks resume in the same session', () => {
  // Regression: after "稍后" the periodic check must not be suppressed for
  // the rest of the session (the checker used to stay stuck on 'downloaded').
  const state = run([
    { type: 'check', manual: false },
    { type: 'available', info: { version: '0.3.0' } },
    { type: 'downloaded', info: { version: '0.3.0' } },
    { type: 'defer' },
  ])
  assert.equal(state.state, 'idle')
  assert.ok(canStartCheck(state))
  const next = reduceUpdaterState(state, { type: 'check', manual: false })
  assert.equal(next.state, 'checking')
})

test('a closed decision dialog behaves like a defer', () => {
  const state = run([
    { type: 'downloaded', info: { version: '0.3.0' } },
    { type: 'defer' },
  ])
  assert.equal(state.state, 'idle')
  assert.ok(canStartCheck(state))
})

test('installing stays busy', () => {
  const state = run([{ type: 'install' }])
  assert.equal(state.state, 'installing')
  assert.equal(canStartCheck(state), false)
})

test('not-available returns to idle', () => {
  const state = run([
    { type: 'check', manual: true },
    { type: 'not-available' },
  ])
  assert.equal(state.state, 'idle')
  assert.ok(canStartCheck(state))
})

test('error records the failure and clears stale update info', () => {
  const state = run([
    { type: 'available', info: { version: '0.3.0' } },
    { type: 'error', error: new Error('download failed') },
  ])
  assert.equal(state.state, 'error')
  assert.equal(state.info, null)
  assert.match(state.lastError.message, /download failed/)
})

test('unknown events leave the state untouched (same object)', () => {
  const state = createUpdaterState()
  assert.equal(reduceUpdaterState(state, { type: 'nope' }), state)
})

test('every transition lands on a known state', () => {
  const events = [
    { type: 'check', manual: true },
    { type: 'checking' },
    { type: 'available', info: {} },
    { type: 'downloaded', info: {} },
    { type: 'defer' },
    { type: 'check', manual: false },
    { type: 'not-available' },
    { type: 'check', manual: true },
    { type: 'error', error: new Error('x') },
    { type: 'check', manual: false },
    { type: 'available', info: {} },
    { type: 'downloaded', info: {} },
    { type: 'install' },
  ]
  const state = events.reduce((s, e) => reduceUpdaterState(s, e), createUpdaterState())
  assert.ok(UPDATER_STATES.includes(state.state))
})