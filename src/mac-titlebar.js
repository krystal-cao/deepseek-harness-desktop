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
  /* Collapsed (56px) is narrower than the traffic-light strip. Measured via
     the accessibility API: the three 16px lights span x 15..77 with position
     {16,18}, so 88px keeps the whole strip on the dark sidebar with margin. */
  min-width: 88px !important;
}

/* The app shell is a CSS grid whose first track is hardcoded to 56px when the
   sidebar is collapsed (inline style, upstream JS constant). The sidebar
   overflows that track and its right side gets covered by the content column,
   so the visible strip stays 56px and the traffic lights stick out. Widen the
   first track to match the min-width above while collapsed. The collapsed
   state is detected through the stable "data-sidebar-collapsed" attribute the
   frame emits (verified in dsh-client-ui-layout), not a hashed class. */
[data-sidebar-collapsed] {
  grid-template-columns: 88px minmax(0px, 1fr) 0px !important;
}

/* The collapsed rail keeps its icon buttons flush left inside an 88px strip;
   center the logo row and the nav icons so they line up with the lights. */
[class*="railIn"] [class*="iconButton"],
[class*="railIn"] [class*="newSession"],
[class*="railIn"] [class*="searchButton"],
[class*="railIn"] [class*="headerActions"],
[class*="railIn"] [class*="search"] {
  margin-left: auto !important;
  margin-right: auto !important;
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
