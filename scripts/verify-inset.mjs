#!/usr/bin/env node
// CDP verification for the macOS traffic-light inset: connects to a running
// packaged app started with --remote-debugging-port and checks the applied
// geometry of the sidebar against the traffic-light strip.
const DEBUG_PORT = process.env.DSH_MAC_DEBUG_PORT ?? '9333'

let page
for (let attempt = 0; attempt < 60; attempt++) {
  const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)
    .then((res) => res.json())
    .catch(() => [])
  page = targets.find((target) => target.type === 'page' && target.url.startsWith('http://127.0.0.1'))
  if (page) break
  await new Promise((resolve) => setTimeout(resolve, 1000))
}
if (!page) {
  console.error(`no localhost page target on :${DEBUG_PORT} after 60s (app may still be booting)`)
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

const expression = `(() => {
  const sidebar = document.querySelector('[class*="sidebarCol"]')
  if (!sidebar) return { error: 'sidebarCol not found' }
  const cs = getComputedStyle(sidebar)
  const dragRegion = getComputedStyle(document.body, '::before')
  const rect = sidebar.getBoundingClientRect()
  const logoRow = sidebar.querySelector('[class*="logoRow"]')
  const logoRect = logoRow?.getBoundingClientRect()
  const interactiveControl = document.querySelector('button, a, input, textarea, select, [role="button"], [contenteditable]')
  const interactiveControlStyle = interactiveControl === null ? undefined : getComputedStyle(interactiveControl)
  return {
    paddingTop: cs.paddingTop,
    sidebarWidth: Math.round(rect.width),
    dragRegion: dragRegion.getPropertyValue('-webkit-app-region') || dragRegion.getPropertyValue('app-region'),
    dragRegionHeight: dragRegion.height,
    dragRegionWidth: Math.round(Number.parseFloat(dragRegion.width)),
    interactiveControlRegion: interactiveControlStyle?.getPropertyValue('-webkit-app-region') || interactiveControlStyle?.getPropertyValue('app-region'),
    logoRowTop: logoRect === undefined ? undefined : Math.round(logoRect.top),
    windowInnerWidth: window.innerWidth,
  }
})()`

const evaluateOnce = (id, expression) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Runtime.evaluate timed out')), 15_000)
  const onMessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id !== id) return
    clearTimeout(timer)
    ws.removeEventListener('message', onMessage)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result?.result?.value)
  }
  ws.addEventListener('message', onMessage)
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
})

// The page target exists as soon as navigation starts, but the layout (and
// sidebarCol) only mounts after the client plugins finish loading. Retry the
// geometry read until the sidebar exists.
let result
for (let attempt = 0; attempt < 60; attempt++) {
  result = await evaluateOnce(1, expression)
  if (result && !result.error) break
  await new Promise((resolve) => setTimeout(resolve, 1000))
}

// The collapsed sidebar must stay wide enough to cover the macOS traffic
// lights (measured via the accessibility API: three 16px lights span
// x 15..77 with trafficLightPosition {16,18}); otherwise the lights float over
// the workspace content. Best effort: the aria-labels differ by locale, so a
// missed toggle is not a failure on its own.
let collapsedSidebarWidth = null
if (result && !result.error) {
  await evaluateOnce(2, `(() => {
    const toggle = [...document.querySelectorAll('button')].find((b) =>
      ['收起', 'Collapse'].some((word) => (b.getAttribute('aria-label') ?? '').includes(word)))
    toggle?.click()
    return true
  })()`)
  await new Promise((resolve) => setTimeout(resolve, 800))
  collapsedSidebarWidth = await evaluateOnce(3, `(() => {
    const sidebar = document.querySelector('[class*="sidebarCol"]')
    return sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null
  })()`)
  await evaluateOnce(4, `(() => {
    const toggle = [...document.querySelectorAll('button')].find((b) =>
      ['打开侧边栏', 'Open sidebar'].includes((b.getAttribute('aria-label') ?? '').trim()))
    toggle?.click()
    return true
  })()`)
}
ws.close()

const trafficLightBottom = 18 + 14
const failures = []
if (result?.error) failures.push(result.error)
if (result.paddingTop !== '40px') failures.push(`padding-top is ${result.paddingTop}, expected 40px`)
if (result.dragRegion !== 'drag') failures.push(`drag region is ${result.dragRegion}, expected drag`)
if (result.dragRegionHeight !== '40px') failures.push(`drag height is ${result.dragRegionHeight}, expected 40px`)
if (result.dragRegionWidth !== result.windowInnerWidth) failures.push(`drag width ${result.dragRegionWidth} != window ${result.windowInnerWidth}`)
if (result.interactiveControlRegion !== undefined && result.interactiveControlRegion !== 'no-drag') {
  failures.push(`interactive control region is ${result.interactiveControlRegion}, expected no-drag`)
}
if (result.logoRowTop === undefined) failures.push('logoRow not found inside sidebar')
if (result.logoRowTop !== undefined && result.logoRowTop < trafficLightBottom) {
  failures.push(`logo row top ${result.logoRowTop} overlaps traffic lights (bottom ${trafficLightBottom})`)
}
if (collapsedSidebarWidth !== null && (typeof collapsedSidebarWidth !== 'number' || collapsedSidebarWidth < 88)) {
  failures.push(`collapsed sidebar width ${collapsedSidebarWidth} < 88px (traffic-light strip)`)
}

if (failures.length > 0) {
  console.error('VERIFY FAILED:', failures.join(' | '))
  process.exit(1)
}
console.log(`VERIFY PASSED: ${result.dragRegionWidth}x${result.dragRegionHeight} draggable inset, logo row starts at y=${result.logoRowTop} (traffic lights end at y=${trafficLightBottom})`)
