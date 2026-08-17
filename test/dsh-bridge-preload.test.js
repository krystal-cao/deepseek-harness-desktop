import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PRELOAD = readFileSync(fileURLToPath(new URL('../src/dsh-bridge-preload.cjs', import.meta.url)), 'utf8')

test('preload exposes the dshDesktop bridge surface', () => {
  assert.match(PRELOAD, /contextBridge\.exposeInMainWorld\('dshDesktop'/)
  assert.match(PRELOAD, /ready: \(\) =>/)
  assert.match(PRELOAD, /theme: \(snapshot\) =>/)
  assert.match(PRELOAD, /state: \(\) =>/)
})

test('preload injects the macOS drag region as a real DOM node', () => {
  assert.match(PRELOAD, /dsh-drag-region/)
  assert.match(PRELOAD, /position: fixed/)
  assert.match(PRELOAD, /height: \$\{DRAG_REGION_HEIGHT\}px/)
  assert.match(PRELOAD, /DRAG_REGION_HEIGHT = 40/)
  assert.match(PRELOAD, /-webkit-app-region: drag/)
  assert.match(PRELOAD, /app-region: drag/)
  assert.match(PRELOAD, /document\.body\.prepend/)
  assert.match(PRELOAD, /DOMContentLoaded/)
})

test('mac-titlebar CSS no longer owns the drag region', () => {
  const css = readFileSync(fileURLToPath(new URL('../src/mac-titlebar.js', import.meta.url)), 'utf8')
  assert.doesNotMatch(css, /body::before/)
})
