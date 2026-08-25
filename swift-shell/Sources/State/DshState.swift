import Foundation

/// Persistent configuration and state model for DSH Desktop.
public struct DshStateConfig: Codable, Equatable {
    public var selectedVersion: String?
    public var dismissedLatest: String?
    public var autoFollowLatest: Bool
    public var npmRegistry: String?
    public var dshPort: Int?
    public var uiTheme: String
    public var translateCommands: Bool
    public var cachedUserPath: String?

    public init(
        selectedVersion: String? = nil,
        dismissedLatest: String? = nil,
        autoFollowLatest: Bool = true,
        npmRegistry: String? = nil,
        dshPort: Int? = 3080,
        uiTheme: String = "default",
        translateCommands: Bool = true,
        cachedUserPath: String? = nil
    ) {
        self.selectedVersion = selectedVersion
        self.dismissedLatest = dismissedLatest
        self.autoFollowLatest = autoFollowLatest
        self.npmRegistry = npmRegistry
        self.dshPort = dshPort ?? 3080
        self.uiTheme = uiTheme
        self.translateCommands = translateCommands
        self.cachedUserPath = cachedUserPath
    }

    public static let `default` = DshStateConfig()
}

public final class DshStateManager {
    public static let shared = DshStateManager()

    private let lock = NSLock()
    private var config: DshStateConfig
    private let fileURL: URL

    public static var appSupportDirectory: URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dshDir = appSupport.appendingPathComponent("DSH", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dshDir.path) {
            try? FileManager.default.createDirectory(at: dshDir, withIntermediateDirectories: true)
        }
        return dshDir
    }

    public static var versionsDirectory: URL {
        let dir = appSupportDirectory.appendingPathComponent("dsh-versions", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    private init() {
        self.fileURL = Self.appSupportDirectory.appendingPathComponent("dsh-state.json")
        self.config = Self.load(from: fileURL)
    }

    private static func load(from url: URL) -> DshStateConfig {
        guard let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode(DshStateConfig.self, from: data) else {
            return .default
        }
        return decoded
    }

    public var current: DshStateConfig {
        lock.lock()
        defer { lock.unlock() }
        return config
    }

    public func update(_ mutate: (inout DshStateConfig) -> Void) {
        lock.lock()
        defer { lock.unlock() }
        mutate(&config)
        save()
    }

    private func save() {
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(config)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("[DshStateManager] Failed to save state:", error)
        }
    }
}
