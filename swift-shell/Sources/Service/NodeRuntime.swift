import Foundation

/// Discovers and manages the Node.js runtime, bundled pnpm, and user shell environment.
public final class NodeRuntime {
    public static let shared = NodeRuntime()

    private let lock = NSLock()
    private var resolvedPath: String?

    private init() {
        // Initialize with cached PATH if available
        if let cached = DshStateManager.shared.current.cachedUserPath, !cached.isEmpty {
            self.resolvedPath = cached
        }
    }

    /// Resolve the standalone node executable path.
    public func resolveNodeBinary() -> String? {
        // 1. Inside .app bundle
        if let resourcePath = Bundle.main.resourcePath {
            let bundled = (resourcePath as NSString).appendingPathComponent("node/bin/node")
            if FileManager.default.isExecutableFile(atPath: bundled) {
                return bundled
            }
        }

        // 2. Relative to executable or development root
        let execUrl = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
        var searchDir = execUrl.deletingLastPathComponent()
        for _ in 0..<8 {
            let devNode = searchDir.appendingPathComponent("assets/node/bin/node").path
            if FileManager.default.isExecutableFile(atPath: devNode) {
                return devNode
            }
            searchDir.deleteLastPathComponent()
        }

        // 3. Well-known global paths
        for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
            if FileManager.default.isExecutableFile(atPath: candidate) {
                return candidate
            }
        }

        // 4. Fallback search via which in login environment
        if let shellNode = resolveBinaryFromShell("node") {
            return shellNode
        }

        return nil
    }

    /// Resolve the bundled pnpm executable path.
    public func resolvePnpmBinary() -> String? {
        if let resourcePath = Bundle.main.resourcePath {
            let bundled = (resourcePath as NSString).appendingPathComponent("assets/bin/pnpm")
            if FileManager.default.isExecutableFile(atPath: bundled) {
                return bundled
            }
        }

        let execUrl = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
        var searchDir = execUrl.deletingLastPathComponent()
        for _ in 0..<8 {
            let devPnpm = searchDir.appendingPathComponent("assets/bin/pnpm").path
            if FileManager.default.isExecutableFile(atPath: devPnpm) {
                return devPnpm
            }
            searchDir.deleteLastPathComponent()
        }

        return nil
    }

    /// Resolve bundled assets directory.
    public func resolveAssetsDirectory() -> String? {
        if let resourcePath = Bundle.main.resourcePath {
            let dir = (resourcePath as NSString).appendingPathComponent("assets")
            if FileManager.default.fileExists(atPath: dir) {
                return dir
            }
        }

        let execUrl = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
        var searchDir = execUrl.deletingLastPathComponent()
        for _ in 0..<8 {
            let devAssets = searchDir.appendingPathComponent("assets").path
            if FileManager.default.fileExists(atPath: devAssets) {
                return devAssets
            }
            searchDir.deleteLastPathComponent()
        }

        return nil
    }

    /// Resolve bundled dsh-desktop-host plugin directory.
    public func resolveDesktopHostBundlePath() -> String? {
        guard let assets = resolveAssetsDirectory() else { return nil }
        let hostDir = (assets as NSString).appendingPathComponent("dsh-desktop-host")
        return FileManager.default.fileExists(atPath: hostDir) ? hostDir : nil
    }

    /// Resolve the full PATH environment variable from the user's interactive login shell.
    public func resolveUserPath() -> String {
        lock.lock()
        if let cached = resolvedPath {
            lock.unlock()
            // Refresh in background for next launch
            DispatchQueue.global(qos: .utility).async { [weak self] in
                self?.refreshUserPathFromShell()
            }
            return cached
        }
        lock.unlock()

        let fresh = fetchUserPathFromShell()
        lock.lock()
        self.resolvedPath = fresh
        lock.unlock()

        DshStateManager.shared.update { state in
            state.cachedUserPath = fresh
        }
        return fresh
    }

    private func refreshUserPathFromShell() {
        let fresh = fetchUserPathFromShell()
        lock.lock()
        self.resolvedPath = fresh
        lock.unlock()
        DshStateManager.shared.update { state in
            state.cachedUserPath = fresh
        }
    }

    private func fetchUserPathFromShell() -> String {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        proc.arguments = ["-ilc", "print -r -- \"$PATH\""]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = FileHandle.nullDevice

        var resultPath = ""
        do {
            try proc.run()
            let group = DispatchGroup()
            group.enter()
            DispatchQueue.global().async {
                proc.waitUntilExit()
                group.leave()
            }
            if group.wait(timeout: .now() + 3.0) == .success {
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                resultPath = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            } else {
                proc.terminate()
            }
        } catch {
            print("[NodeRuntime] Shell PATH resolution failed:", error)
        }

        var parts = resultPath.split(separator: ":").map(String.init)
        if parts.isEmpty {
            let envPath = ProcessInfo.processInfo.environment["PATH"] ?? ""
            parts = envPath.split(separator: ":").map(String.init)
        }

        let standardDirs = [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            (NSHomeDirectory() as NSString).appendingPathComponent(".local/bin"),
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin"
        ]
        for dir in standardDirs {
            if !parts.contains(dir) && FileManager.default.fileExists(atPath: dir) {
                parts.append(dir)
            }
        }

        // Add bundled bin directory if present
        if let assets = resolveAssetsDirectory() {
            let binDir = (assets as NSString).appendingPathComponent("bin")
            if !parts.contains(binDir) && FileManager.default.fileExists(atPath: binDir) {
                parts.insert(binDir, at: 0)
            }
        }

        return parts.joined(separator: ":")
    }

    private func resolveBinaryFromShell(_ name: String) -> String? {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        proc.arguments = ["-ilc", "which \(name)"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = FileHandle.nullDevice

        guard (try? proc.run()) != nil else { return nil }
        proc.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return (!path.isEmpty && FileManager.default.isExecutableFile(atPath: path)) ? path : nil
    }

    /// Build clean child process environment dictionary.
    public func buildEnvironment(customPort: Int? = nil) -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = resolveUserPath()
        env["NODE_OPTIONS"] = ""
        env["DSH_DESKTOP"] = "1"
        if let nodeBin = resolveNodeBinary() {
            env["DSH_NODE_BIN"] = nodeBin
        }
        return env
    }
}
