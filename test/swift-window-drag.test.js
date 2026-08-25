import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const MAIN_WINDOW_SOURCE = fs.readFileSync(
  new URL('../swift-shell/Sources/MainWindow/MainWindowController.swift', import.meta.url),
  'utf8',
)
const BRIDGE_SOURCE = fs.readFileSync(
  new URL('../swift-shell/Sources/Bridge/DshBridgeHandler.swift', import.meta.url),
  'utf8',
)
const BUILD_SOURCE = fs.readFileSync(
  new URL('../swift-shell/build-app.sh', import.meta.url),
  'utf8',
)
const WINDOW_DRAG_SCRIPT_MATCH = MAIN_WINDOW_SOURCE.match(
  /private static let windowDragScript = """\n([\s\S]*?)\n    """/,
)
assert.ok(WINDOW_DRAG_SCRIPT_MATCH)
const WINDOW_DRAG_SCRIPT = WINDOW_DRAG_SCRIPT_MATCH[1]

function installWindowDragScript() {
  const documentListeners = new Map()
  const windowListeners = new Map()
  const messages = []

  class FakeElement {
    constructor({ interactive = false, cursor = 'default' } = {}) {
      this.interactive = interactive
      this.cursor = cursor
      this.parentElement = null
      this.classes = new Set()
      this.classList = {
        add: (name) => this.classes.add(name),
        remove: (name) => this.classes.delete(name),
        toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name),
      }
    }

    closest() {
      return this.interactive ? this : null
    }
  }

  const documentElement = new FakeElement()
  const document = {
    documentElement,
    addEventListener(type, listener) {
      documentListeners.set(type, listener)
    },
  }
  const window = {
    webkit: {
      messageHandlers: {
        dshDesktop: {
          postMessage(message) {
            messages.push(message.type)
          },
        },
      },
    },
    getComputedStyle(element) {
      return { cursor: element.cursor }
    },
    addEventListener(type, listener) {
      windowListeners.set(type, listener)
    },
  }

  vm.runInNewContext(WINDOW_DRAG_SCRIPT, { document, Element: FakeElement, Math, window })

  return { documentListeners, FakeElement, messages, windowListeners }
}

function mouseEvent(target, overrides = {}) {
  return {
    button: 0,
    clientY: 30,
    screenX: 100,
    screenY: 100,
    target,
    preventDefault() {},
    stopImmediatePropagation() {},
    ...overrides,
  }
}

test('Swift titlebar leaves WebKit in charge of every click', () => {
  assert.doesNotMatch(MAIN_WINDOW_SOURCE, /dragOverlay|CustomDragView/)
  assert.doesNotMatch(BUILD_SOURCE, /CustomDragView/)
  assert.match(MAIN_WINDOW_SOURCE, /event\.clientY > titlebarHeight/)
  assert.match(MAIN_WINDOW_SOURCE, /isInteractive\(event\.target\)/)
  assert.match(MAIN_WINDOW_SOURCE, /Math\.hypot/)
  assert.match(MAIN_WINDOW_SOURCE, /if \(distance < dragThreshold\) return/)
  assert.match(MAIN_WINDOW_SOURCE, /event\.preventDefault\(\);\n        candidate =/)
  assert.match(MAIN_WINDOW_SOURCE, /html\.dsh-native-window-drag/)
  assert.match(MAIN_WINDOW_SOURCE, /\.dsh-native-window-drag-hover/)
  assert.match(MAIN_WINDOW_SOURCE, /cursor: default !important/)
  assert.match(MAIN_WINDOW_SOURCE, /user-select: none !important/)
  assert.match(MAIN_WINDOW_SOURCE, /forMainFrameOnly: true/)
})

test('Swift bridge carries the complete native window drag lifecycle', () => {
  for (const type of ['windowDragPrepare', 'windowDragStart', 'windowDragMove', 'windowDragEnd']) {
    assert.match(MAIN_WINDOW_SOURCE, new RegExp(`post\\('${type}'\\)`))
    assert.match(BRIDGE_SOURCE, new RegExp(`case "${type}"`))
  }
  assert.match(MAIN_WINDOW_SOURCE, /window\.performDrag\(with: mouseDownEvent\)/)
  assert.match(MAIN_WINDOW_SOURCE, /__DSH_NATIVE_WINDOW_DRAG_CLEANUP__/)
  assert.match(MAIN_WINDOW_SOURCE, /NSEvent\.mouseLocation/)
  assert.match(MAIN_WINDOW_SOURCE, /window\.setFrameOrigin/)
})

test('Swift titlebar double-click follows native zoom or minimize behavior', () => {
  assert.match(MAIN_WINDOW_SOURCE, /post\('windowTitlebarDoubleClick'\)/)
  assert.match(BRIDGE_SOURCE, /case "windowTitlebarDoubleClick"/)
  assert.match(MAIN_WINDOW_SOURCE, /AppleActionOnDoubleClick/)
  assert.match(MAIN_WINDOW_SOURCE, /window\.performMiniaturize\(nil\)/)
  assert.match(MAIN_WINDOW_SOURCE, /window\.performZoom\(nil\)/)
})

test('Swift titlebar script preserves clicks and starts only intentional blank-area drags', () => {
  const { documentListeners, FakeElement, messages } = installWindowDragScript()
  const blank = new FakeElement()
  const interactive = new FakeElement({ interactive: true })

  documentListeners.get('mousedown')(mouseEvent(interactive))
  documentListeners.get('mousemove')(mouseEvent(interactive, { screenX: 120 }))
  documentListeners.get('mouseup')(mouseEvent(interactive, { screenX: 120 }))
  assert.deepEqual(messages, [])

  documentListeners.get('mousedown')(mouseEvent(blank))
  documentListeners.get('mouseup')(mouseEvent(blank))
  documentListeners.get('click')(mouseEvent(blank))
  assert.deepEqual(messages, ['windowDragPrepare'])

  documentListeners.get('mousedown')(mouseEvent(blank))
  documentListeners.get('mousemove')(mouseEvent(blank, { screenX: 105 }))
  documentListeners.get('mouseup')(mouseEvent(blank, { screenX: 105 }))
  assert.deepEqual(messages, [
    'windowDragPrepare',
    'windowDragPrepare',
    'windowDragStart',
    'windowDragMove',
    'windowDragEnd',
  ])
})

test('Swift titlebar script reserves double-click for blank titlebar content', () => {
  const { documentListeners, FakeElement, messages } = installWindowDragScript()
  const blank = new FakeElement()
  const interactive = new FakeElement({ interactive: true })

  documentListeners.get('dblclick')(mouseEvent(interactive))
  assert.deepEqual(messages, [])

  documentListeners.get('dblclick')(mouseEvent(blank))
  assert.deepEqual(messages, ['windowTitlebarDoubleClick'])
})

test('Swift titlebar blocks WebKit text selection only for a titlebar gesture', () => {
  const { documentListeners, FakeElement } = installWindowDragScript()
  const blank = new FakeElement()
  let prevented = false
  const selectionEvent = { preventDefault() { prevented = true } }

  documentListeners.get('mousedown')(mouseEvent(blank))
  documentListeners.get('selectstart')(selectionEvent)
  assert.equal(prevented, true)

  prevented = false
  documentListeners.get('mouseup')(mouseEvent(blank))
  documentListeners.get('selectstart')(selectionEvent)
  assert.equal(prevented, false)
})

test('Swift titlebar shows an arrow cursor while hovering only draggable content', () => {
  const { documentListeners, FakeElement } = installWindowDragScript()
  const blank = new FakeElement()
  const interactive = new FakeElement({ interactive: true, cursor: 'pointer' })

  documentListeners.get('mousemove')(mouseEvent(blank))
  assert.equal(blank.classes.has('dsh-native-window-drag-hover'), true)

  documentListeners.get('mousemove')(mouseEvent(interactive))
  assert.equal(blank.classes.has('dsh-native-window-drag-hover'), false)
  assert.equal(interactive.classes.has('dsh-native-window-drag-hover'), false)

  documentListeners.get('mousemove')(mouseEvent(blank, { clientY: 120 }))
  assert.equal(blank.classes.has('dsh-native-window-drag-hover'), false)
})
