// Hide the web UI's own "Loading plugins" boot screen so the window appears
// to go straight to the main interface. The loading overlay is found by its
// text at runtime (the bundled class names are hashed), then kept hidden by a
// MutationObserver while the plugins load. The observer is throttled to one
// pass per animation frame and disconnects itself once the boot screen is gone
// and the UI has rendered enough content, so it never runs for the lifetime of
// the page.

const HIDE_SCRIPT = `(() => {
  let rafId = 0
  const hideLoadingText = () => {
    rafId = 0
    let found = false
    for (const element of document.querySelectorAll('body *')) {
      if (element.children.length === 0 && element.textContent.trim().includes('Loading plugins')) {
        element.style.display = 'none'
        found = true
      }
    }
    // Boot screen gone and the interface has content: stop observing. The
    // overlay can no longer appear, so a permanent MutationObserver would only
    // burn cycles for the whole session.
    const body = document.body
    if (!found && body && body.textContent.trim().length > 120) {
      observer.disconnect()
      window.__dshHideLoadingObserver = null
    }
  }
  // Coalesce bursts of DOM mutations into a single traversal per frame instead
  // of walking the whole document on every mutation event.
  const schedule = () => {
    if (rafId !== 0) return
    rafId = requestAnimationFrame(hideLoadingText)
  }
  hideLoadingText()
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  window.__dshHideLoadingObserver = observer
})()`

export async function hidePluginLoadingScreen(webContents) {
  try {
    await webContents.executeJavaScript(HIDE_SCRIPT)
  } catch {
    // The page may not be ready; nothing to hide yet.
  }
}
