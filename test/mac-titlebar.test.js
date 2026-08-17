import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyMacTitleBarStyle,
  MAC_TITLEBAR_CSS,
  MAC_TITLEBAR_HEIGHT,
} from '../src/mac-titlebar.js'

test('macOS title bar reserves the traffic-light strip inside the sidebar', () => {
  assert.match(MAC_TITLEBAR_CSS, /\[class\*="sidebarCol"\]/)
  assert.match(MAC_TITLEBAR_CSS, new RegExp(`padding-top:\\s*${MAC_TITLEBAR_HEIGHT}px`))
  // The collapsed sidebar (56px) is narrower than the traffic-light strip;
  // force a minimum width so the lights never float over the workspace content.
  assert.match(MAC_TITLEBAR_CSS, /min-width:\s*88px/)
  // The app's grid frame keeps its content at 56px when collapsed; widen the
  // first grid track too, keyed off the stable data attribute the frame emits.
  assert.match(MAC_TITLEBAR_CSS, /\[data-sidebar-collapsed\]/)
  assert.match(MAC_TITLEBAR_CSS, /grid-template-columns:\s*88px/)
  // The collapsed rail centers its icon buttons in the widened strip.
  assert.match(MAC_TITLEBAR_CSS, /\[class\*="railIn"\] \[class\*="iconButton"\]/)
  assert.match(MAC_TITLEBAR_CSS, /margin-left:\s*auto/)
})

test('macOS title bar keeps interactive controls clickable above the drag strip', () => {
  assert.match(MAC_TITLEBAR_CSS, /-webkit-app-region:\s*no-drag/)
})

test('macOS title bar makes the sidebar stack translucent for the vibrancy material', () => {
  // Every layer above the native 'sidebar' material must lose its opaque fill,
  // otherwise the glass only shows in the top padding strip (0.0.8 regression).
  assert.match(MAC_TITLEBAR_CSS, /html,\s*body/)
  assert.match(MAC_TITLEBAR_CSS, /background:\s*transparent\s*!important/)
  assert.match(MAC_TITLEBAR_CSS, /\[class\*="frame"\]:has\(> \[class\*="sidebarCol"\]\)/)
  assert.match(MAC_TITLEBAR_CSS, /color-mix\(in srgb, var\(--dsw-specific-sidebar-fill\) 70%, transparent\)/)
  assert.match(MAC_TITLEBAR_CSS, /\[class\*="centerCol"\]/)
  assert.match(MAC_TITLEBAR_CSS, /\[class\*="sidebarCol"\] \[class\*="_root"\]/)
  assert.match(MAC_TITLEBAR_CSS, /\[class\*="sidebarCol"\] \[class\*="settingsArea"\]/)
  assert.match(MAC_TITLEBAR_CSS, /\[class\*="sidebarCol"\] \[class\*="fade"\]/)
})

test('macOS title bar marks every interactive element no-drag (verify-inset invariants)', () => {
  // Mirrors the live CDP checks in scripts/verify-inset.mjs so regressions are
  // caught by the unit suite before a packaged-app run is needed.
  for (const selector of [
    'a',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[contenteditable]:not([contenteditable="false"])',
  ]) {
    assert.match(MAC_TITLEBAR_CSS, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(MAC_TITLEBAR_CSS, /app-region:\s*no-drag/)
  assert.match(MAC_TITLEBAR_CSS, /-webkit-app-region:\s*no-drag/)
})

test('macOS title bar styling is inserted into each loaded page', async () => {
  let insertedCSS

  await applyMacTitleBarStyle({
    insertCSS(css) {
      insertedCSS = css
      return Promise.resolve('stylesheet-key')
    },
  })

  assert.equal(insertedCSS, MAC_TITLEBAR_CSS)
})
