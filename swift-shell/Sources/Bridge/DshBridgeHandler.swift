import Foundation
import WebKit
import AppKit

public protocol DshBridgeDelegate: AnyObject {
    func bridgeDidReceiveReady()
    func bridgeDidReceiveTheme(colorScheme: String?, externalTheme: String?)
    func bridgeDidReceiveLocale(language: String)
    func bridgeDidPrepareWindowDrag()
    func bridgeDidStartWindowDrag()
    func bridgeDidMoveWindowDrag()
    func bridgeDidEndWindowDrag()
    func bridgeDidDoubleClickWindowTitlebar()
}

public final class DshBridgeHandler: NSObject, WKScriptMessageHandler {
    public weak var delegate: DshBridgeDelegate?

    public static let scriptSource = """
    (function() {
        if (window.dshDesktop) return;
        window.dshDesktop = {
            ready: function() {
                window.webkit.messageHandlers.dshDesktop.postMessage({ type: 'ready' });
            },
            openSettings: function() {
                window.webkit.messageHandlers.dshDesktop.postMessage({ type: 'openSettings' });
            },
            theme: function(snapshot) {
                window.webkit.messageHandlers.dshDesktop.postMessage({ type: 'theme', payload: snapshot });
            },
            locale: function(payload) {
                window.webkit.messageHandlers.dshDesktop.postMessage({ type: 'locale', payload: payload });
            },
            notify: function(payload) {
                window.webkit.messageHandlers.dshDesktop.postMessage({ type: 'notify', payload: payload });
            },
            debug: function(message) {
                window.webkit.messageHandlers.dshDesktop.postMessage({ type: 'debug', payload: message });
            }
        };
    })();
    """

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "dshDesktop",
              let body = message.body as? [String: Any],
              let type = body["type"] as? String else {
            return
        }

        switch type {
        case "ready":
            delegate?.bridgeDidReceiveReady()

        case "openSettings":
            DispatchQueue.main.async {
                SettingsWindowController.shared.show()
            }

        case "theme":
            let payload = body["payload"] as? [String: Any]
            let colorScheme = payload?["colorScheme"] as? String
            let externalTheme = payload?["externalTheme"] as? String
            delegate?.bridgeDidReceiveTheme(colorScheme: colorScheme, externalTheme: externalTheme)

        case "locale":
            let payload = body["payload"] as? [String: Any]
            let lang = payload?["language"] as? String ?? "zh"
            delegate?.bridgeDidReceiveLocale(language: lang)

        case "notify":
            let payload = body["payload"] as? [String: Any]
            let title = payload?["title"] as? String
            let cwd = payload?["cwd"] as? String
            if !MainWindowController.shared.isFocusedForNotifications {
                NotificationManager.shared.showTaskDoneNotification(title: title, cwd: cwd)
            }

        case "windowDragPrepare":
            guard message.frameInfo.isMainFrame else { return }
            delegate?.bridgeDidPrepareWindowDrag()

        case "windowDragStart":
            guard message.frameInfo.isMainFrame else { return }
            delegate?.bridgeDidStartWindowDrag()

        case "windowDragMove":
            guard message.frameInfo.isMainFrame else { return }
            delegate?.bridgeDidMoveWindowDrag()

        case "windowDragEnd":
            guard message.frameInfo.isMainFrame else { return }
            delegate?.bridgeDidEndWindowDrag()

        case "windowTitlebarDoubleClick":
            guard message.frameInfo.isMainFrame else { return }
            delegate?.bridgeDidDoubleClickWindowTitlebar()

        case "debug":
            if let msg = body["payload"] {
                print("[DshBridge:debug]", msg)
            }

        default:
            break
        }
    }
}
