import AppKit

@MainActor
enum ApplicationIcon {
    static let image: NSImage = {
        if let bundledIcon = NSImage(named: NSImage.Name("app")),
           bundledIcon.isValid,
           bundledIcon.representations.contains(where: { $0.pixelsWide > 0 && $0.pixelsHigh > 0 }) {
            return bundledIcon
        }

        if let applicationIcon = NSApplication.shared.applicationIconImage,
           applicationIcon.isValid,
           applicationIcon.representations.contains(where: { $0.pixelsWide > 0 && $0.pixelsHigh > 0 }) {
            return applicationIcon
        }

        return NSImage(
            systemSymbolName: "shippingbox.fill",
            accessibilityDescription: "DSH"
        ) ?? NSImage(size: NSSize(width: 64, height: 64))
    }()
}
