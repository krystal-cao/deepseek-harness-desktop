// Browser half of the desktop host bridge. This file is served verbatim as a
// classic script (/plugins/dsh-desktop-host/client.js); it only REGISTERS the
// factory, which the client module system materializes when the plugin entry
// activates. Kept dependency-free on purpose.
window.__ModuleLoader__.load({
  id: "dsh-desktop-host",
  factory: function (require) {
    var module = { exports: {} }
    module.exports = {
      inject: ["theme"],
      apply: function (ctx) {
        var host = window.dshDesktop
        if (!host) return undefined
        host.ready()
        var send = function (snapshot) {
          host.theme({
            colorScheme: snapshot && snapshot.active ? snapshot.active.colorScheme : "system",
            preference: snapshot ? snapshot.preference : "system",
          })
        }
        var off = null
        try {
          // Subscribe first, then read the current snapshot: the initial
          // theme/change may have been published before this plugin applied.
          off = ctx.on("theme/change", send)
          var theme = ctx.theme
          if (theme && typeof theme.getTheme === "function") send(theme.getTheme())
        } catch (error) {
          // Best-effort bridge: the UI keeps working without theme sync.
        }
        return function dispose() {
          if (off) {
            try {
              off()
            } catch (error) {
              // The fiber may already be tearing down; nothing to clean up.
            }
          }
        }
      },
    }
    return module.exports
  },
})
