import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyMacTitleBarStyle,
  MAC_TITLEBAR_CSS,
  MAC_TITLEBAR_HEIGHT,
} from '../src/mac-titlebar.js'

test('macOS title bar is immersive with no reserved strip', () => {
  assert.doesNotMatch(MAC_TITLEBAR_CSS, /padding-top/)
  assert.doesNotMatch(MAC_TITLEBAR_CSS, /env\(titlebar-area-(?:x|width|height)/)
})

test('macOS title bar drag region sits behind the traffic lights only', () => {
  assert.match(MAC_TITLEBAR_CSS, /html::after/)
  assert.match(MAC_TITLEBAR_CSS, /-webkit-app-region:\s*drag/)
  assert.match(MAC_TITLEBAR_CSS, /left:\s*0/)
  assert.match(MAC_TITLEBAR_CSS, new RegExp(`width:\\s*130px`))
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
