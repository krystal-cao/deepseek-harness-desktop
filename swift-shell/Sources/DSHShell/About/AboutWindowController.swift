import AppKit
import SwiftUI

@MainActor
public final class AboutWindowController: NSWindowController {
    public static let shared = AboutWindowController()

    private init() {
        let hostingController = NSHostingController(rootView: AboutWindowView())
        let win = NSWindow(contentViewController: hostingController)
        win.title = "关于 DSH"
        win.titleVisibility = .hidden
        win.titlebarAppearsTransparent = true
        win.styleMask = [.titled, .closable, .fullSizeContentView]
        // The reference about panel is 568x408 pixels on a 2x Retina display.
        // Keep the native window at the corresponding 284x204 points.
        win.setContentSize(NSSize(width: 284, height: 204))
        win.minSize = NSSize(width: 284, height: 204)
        win.maxSize = NSSize(width: 284, height: 204)
        win.center()
        win.isReleasedWhenClosed = false
        win.isOpaque = true
        win.backgroundColor = .windowBackgroundColor
        win.hasShadow = true

        super.init(window: win)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public func show() {
        window?.center()
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

private struct AboutWindowView: View {
    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.3.5"
    }

    private var appIcon: NSImage {
        NSApplication.shared.applicationIconImage
            ?? NSImage(systemSymbolName: "shippingbox.fill", accessibilityDescription: "DSH")!
    }

    var body: some View {
        VStack(spacing: 0) {
            Image(nsImage: appIcon)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: 64, height: 64)
                .padding(.top, 41)
                .padding(.bottom, 10)

            Text("DSH")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(.primary)

            Text("版本 \(appVersion)")
                .font(.system(size: 11, weight: .regular))
                .foregroundStyle(.primary)
                .padding(.top, 10)

            Text("Copyright © 2026 Krystal Cao")
                .font(.system(size: 10.5, weight: .regular))
                .foregroundStyle(.primary)
                .padding(.top, 10)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        .ignoresSafeArea()
    }
}
