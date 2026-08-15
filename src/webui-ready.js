// Readiness detection for the dsh web UI. The loading screen is considered
// finished once its "Loading plugins" text leaves the DOM and the interface
// has rendered enough content. Returns after the timeout regardless, so the
// caller can always reveal the window.

const READY_CHECK = `(() => {
  const text = document.body ? document.body.textContent : ''
  return { loading: text.includes('Loading plugins'), length: text.trim().length }
})()`

export async function waitForWebUiReady(webContents, { timeoutMs = 30_000, pollMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const state = await webContents.executeJavaScript(READY_CHECK)
      if (!state.loading && state.length > 120) return true
    } catch {
      // The page may still be navigating; keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  return false
}
