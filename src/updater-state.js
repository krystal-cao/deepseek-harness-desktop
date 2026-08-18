// Pure state machine for the desktop auto-updater flow. Kept free of Electron
// imports so the transition rules — especially the "defer" path that must
// resume periodic checks — can be unit-tested with plain `node --test`.

/**
 * States:
 *   idle        — no check in flight; a new check may start
 *   checking    — a check is running
 *   downloading — update found, download in progress
 *   downloaded  — update ready; waiting for the user's restart decision
 *   installing  — the user chose to restart and install now
 *   error       — last check/download failed
 */
export const UPDATER_STATES = ['idle', 'checking', 'downloading', 'downloaded', 'installing', 'error']

export function createUpdaterState() {
  return { state: 'idle', lastError: null, info: null, manual: false }
}

/** A new automatic or manual check may start unless a flow is in flight. */
export function canStartCheck(state) {
  return !['checking', 'downloading', 'downloaded', 'installing'].includes(state.state)
}

/**
 * Reduce an updater event into the next state snapshot. Events:
 *   { type: 'check', manual }        — user/engine wants to check now
 *   { type: 'checking' }             — electron-updater started the request
 *   { type: 'available', info }      — update found; download begun
 *   { type: 'downloaded', info }     — download finished
 *   { type: 'not-available' }        — no update
 *   { type: 'defer' }                — user postponed the restart
 *   { type: 'install' }              — user accepted; app will restart
 *   { type: 'error', error }         — check/download failed
 */
export function reduceUpdaterState(state, event) {
  switch (event.type) {
    case 'check':
      return { ...state, state: 'checking', manual: Boolean(event.manual), lastError: null }
    case 'checking':
      return { ...state, state: 'checking', lastError: null }
    case 'available':
      return { ...state, state: 'downloading', info: event.info ?? null }
    case 'downloaded':
      return { ...state, state: 'downloaded', info: event.info ?? null }
    case 'not-available':
      return { ...state, state: 'idle' }
    case 'defer':
      // The downloaded update stays on disk; reset to idle so periodic checks
      // resume instead of being suppressed for the rest of the session.
      return { ...state, state: 'idle' }
    case 'install':
      return { ...state, state: 'installing' }
    case 'error':
      return { ...state, state: 'error', lastError: event.error ?? null, info: null }
    default:
      return state
  }
}