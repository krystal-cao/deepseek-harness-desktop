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
})

test('macOS title bar provides a full-width drag region and keeps controls clickable', () => {
  assert.match(MAC_TITLEBAR_CSS, /body::before/)
  assert.match(MAC_TITLEBAR_CSS, /-webkit-app-region:\s*drag/)
  assert.match(MAC_TITLEBAR_CSS, /-webkit-app-region:\s*no-drag/)
  assert.match(MAC_TITLEBAR_CSS, new RegExp(`height:\\s*${MAC_TITLEBAR_HEIGHT}px`))
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
