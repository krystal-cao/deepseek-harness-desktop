export const MAC_TITLEBAR_HEIGHT = 40

// Reserve the macOS traffic-light strip inside the sidebar and restore the
// native window drag affordance removed by the frameless hiddenInset shell.
// The shipped harness frontend is unaware of the desktop chrome, so its logo
// row would otherwise sit under the close/minimize/zoom buttons and the empty
// top edge would not move the window. The layout column uses css-module
// hashed class names; the substring attribute selector keeps working across
// hash changes (verified live: pI_x6G_sidebarCol).
export const MAC_TITLEBAR_CSS = `
[class*="sidebarCol"] {
  padding-top: ${MAC_TITLEBAR_HEIGHT}px !important;
}

body::before {
  content: "";
  position: fixed;
  inset: 0 0 auto;
  height: ${MAC_TITLEBAR_HEIGHT}px;
  -webkit-app-region: drag;
  app-region: drag;
}

a,
button,
input,
textarea,
select,
[role="button"],
[contenteditable]:not([contenteditable="false"]) {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
`

export async function applyMacTitleBarStyle(webContents) {
  await webContents.insertCSS(MAC_TITLEBAR_CSS)
}
