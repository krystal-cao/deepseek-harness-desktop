// Hide the web UI's own "Loading plugins" boot screen so the window appears
// to go straight to the main interface. The loading overlay is found by its
// text at runtime (the bundled class names are hashed), then kept hidden by a
// MutationObserver while the plugins load.

const HIDE_SCRIPT = `(() => {
  const hideLoadingText = () => {
    for (const element of document.querySelectorAll('body *')) {
      if (element.children.length === 0 && element.textContent.trim().includes('Loading plugins')) {
        element.style.display = 'none'
      }
    }
  }
  hideLoadingText()
  const observer = new MutationObserver(hideLoadingText)
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
