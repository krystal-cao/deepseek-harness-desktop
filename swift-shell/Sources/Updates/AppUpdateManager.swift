import Combine
import Sparkle

/// The single Sparkle updater owned by the native app.
///
/// The Swift shell uses one updater instance for automatic checks, the app
/// menu, and the About settings page. DSH service versions and plugin versions
/// remain managed by their existing version managers.
public final class AppUpdateManager: ObservableObject {
    public static let shared = AppUpdateManager()

    public let updaterController: SPUStandardUpdaterController

    private init() {
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
    }

    public var updater: SPUUpdater {
        updaterController.updater
    }
}

/// Publishes Sparkle's KVO-backed check availability for SwiftUI controls.
public final class CheckForUpdatesViewModel: ObservableObject {
    @Published public private(set) var canCheckForUpdates = false

    public init(updater: SPUUpdater) {
        updater.publisher(for: \.canCheckForUpdates)
            .receive(on: RunLoop.main)
            .assign(to: &$canCheckForUpdates)
    }
}
