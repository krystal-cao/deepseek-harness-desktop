export const MAC_TITLEBAR_HEIGHT = 38

// Immersive layout: the web UI runs edge-to-edge underneath the macOS traffic
// lights. A small drag region behind the lights keeps the window draggable
// without covering the sidebar's interactive controls.
export const MAC_TITLEBAR_CSS = `
  html {
    background-color: Canvas;
  }

  html::after {
    content: "";
    position: fixed;
    z-index: 2147483647;
    top: 0;
    left: 0;
    width: 130px;
    height: ${MAC_TITLEBAR_HEIGHT}px;
    -webkit-app-region: drag;
    app-region: drag;
  }

  body {
    box-sizing: border-box !important;
    height: 100vh !important;
    overflow: hidden !important;
  }
`

export async function applyMacTitleBarStyle(webContents) {
  await webContents.insertCSS(MAC_TITLEBAR_CSS)
}
