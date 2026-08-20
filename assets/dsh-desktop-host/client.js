// Browser half of the desktop host bridge. This file is served verbatim as a
// classic script (/plugins/dsh-desktop-host/client.js); it only REGISTERS the
// factory, which the client module system materializes when the plugin entry
// activates. Kept dependency-free on purpose.
window.__ModuleLoader__.load({
  id: "dsh-desktop-host",
  factory: function (require) {
    var module = { exports: {} }
    module.exports = {
      inject: ["theme", "sessions"],
      apply: function (ctx) {
        var host = window.dshDesktop
        if (!host) return undefined
        host.ready()

        // --- Theme bridge (unchanged) ---
        var send = function (snapshot) {
          host.theme({
            colorScheme: snapshot && snapshot.active ? snapshot.active.colorScheme : "system",
            preference: snapshot ? snapshot.preference : "system",
          })
        }
        var offTheme = null
        try {
          offTheme = ctx.on("theme/change", send)
          var theme = ctx.theme
          if (theme && typeof theme.getTheme === "function") send(theme.getTheme())
        } catch (error) {
          // Best-effort bridge: the UI keeps working without theme sync.
        }

        // --- Task-completion bridge ---
        // The dsh client exposes `ctx.sessions.list` (an observable snapshot
        // store, getSnapshot()+subscribe). We track each session's `running`
        // bit and detect the running→idle edge: that is exactly "an agent task
        // finished". The desktop shell turns this into a system notification
        // when the window is unfocused/hidden.
        var prevRunning = Object.create(null) // sessionId -> running (last seen)
        var offSessions = null
        try {
          var list = ctx.sessions && ctx.sessions.list
          var hasApi = !!(list && typeof list.subscribe === "function" && typeof list.getSnapshot === "function")
          if (hasApi) {
            function onSnapshot() {
              var state = list.getSnapshot() || {}
              var byId = state.byId || {}
              var convo = state.conversations || {}
              var changed = false
              for (var id in byId) {
                if (!Object.prototype.hasOwnProperty.call(byId, id)) continue
                var summary = byId[id]
                var running = summary ? summary.running === true : false
                var prev = prevRunning[id] === true
                if (prev && !running) {
                  // A session that was running just went idle → notify.
                  var title = summary && summary.displayTitle ? summary.displayTitle : null
                  var cwd = summary && summary.cwd ? summary.cwd : null
                  host.notify({ sessionId: id, title: title, cwd: cwd, completedAt: Date.now() })
                  changed = true
                }
                prevRunning[id] = running
              }
              // Prune sessions that disappeared to avoid unbounded growth.
              for (var gone in prevRunning) {
                if (Object.prototype.hasOwnProperty.call(prevRunning, gone) && !byId[gone]) {
                  delete prevRunning[gone]
                }
              }
              return changed
            }
            onSnapshot()
            offSessions = list.subscribe(onSnapshot)
          }
        } catch (error) {
          if (host.debug) host.debug("sessions-subscribe-error " + (error && error.message ? error.message : String(error)))
          // Task-completion reporting is optional; the rest of the bridge keeps
          // working even if the sessions store is unreachable.
        }

        return function dispose() {
          if (offTheme) {
            try {
              offTheme()
            } catch (error) {
              // The fiber may already be tearing down; nothing to clean up.
            }
          }
          if (offSessions) {
            try {
              offSessions()
            } catch (error) {
              // Best-effort unsubscribe.
            }
          }
        }
      },
    }
    return module.exports
  },
})
