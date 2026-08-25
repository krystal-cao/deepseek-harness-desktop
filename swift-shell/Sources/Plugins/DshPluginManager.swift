import Foundation

public struct DshPluginItem: Identifiable, Equatable {
    public var id: String { name }
    public let name: String
    public let version: String?
    public let latestVersion: String?
    public let isManaged: Bool
    public let isLocal: Bool

    public var hasUpdate: Bool {
        guard let latest = latestVersion, let current = version else { return false }
        let cleanCurrent = current.replacingOccurrences(of: "^", with: "").replacingOccurrences(of: "~", with: "")
        return latest != cleanCurrent && !isLocal && !isManaged
    }

    public init(name: String, version: String? = nil, latestVersion: String? = nil, isManaged: Bool = false, isLocal: Bool = false) {
        self.name = name
        self.version = version
        self.latestVersion = latestVersion
        self.isManaged = isManaged
        self.isLocal = isLocal
    }
}

public final class DshPluginManager {
    public static let shared = DshPluginManager()

    public static let desktopHostPluginName = "dsh-desktop-host"
    private static let standardWebProfileBundles = [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app"
    ]

    public static var webProfileDirectory: URL {
        let dshHome = ProcessInfo.processInfo.environment["DSH_HOME"] ?? (NSHomeDirectory() as NSString).appendingPathComponent(".dsh")
        return URL(fileURLWithPath: dshHome).appendingPathComponent("profiles/web", isDirectory: true)
    }

    private init() {}

    /// List all installed plugins in the web profile.
    public func listPlugins(outdatedMap: [String: String] = [:]) -> [DshPluginItem] {
        let profileDir = Self.webProfileDirectory
        let pkgUrl = profileDir.appendingPathComponent("package.json")
        guard let data = try? Data(contentsOf: pkgUrl),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let deps = json["dependencies"] as? [String: String] else {
            return []
        }

        var list: [DshPluginItem] = []
        for (name, spec) in deps {
            let isManaged = (name == Self.desktopHostPluginName)
            let isLocal = spec.hasPrefix("file:") || spec.hasPrefix("link:")
            let latest = outdatedMap[name]
            list.append(DshPluginItem(name: name, version: spec, latestVersion: latest, isManaged: isManaged, isLocal: isLocal))
        }

        // Pinned managed plugin at bottom, others alphabetical
        return list.sorted { a, b in
            if a.isManaged != b.isManaged { return !a.isManaged }
            return a.name.localizedCompare(b.name) == .orderedAscending
        }
    }

    /// Match Electron's external-theme detection for the native settings UI.
    ///
    /// Themes are declared either as direct profile dependencies or as profile
    /// bundles. DSH's own packages and the shell bridge are deliberately
    /// excluded because they are part of the built-in profile, not user themes.
    public func detectExternalTheme() -> String? {
        let packageURL = Self.webProfileDirectory.appendingPathComponent("package.json")
        guard let data = try? Data(contentsOf: packageURL),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        var names: [String] = []
        if let dependencies = root["dependencies"] as? [String: Any] {
            names.append(contentsOf: dependencies.keys.sorted())
        }
        if let dsh = root["dsh"] as? [String: Any],
           let profile = dsh["profile"] as? [String: Any],
           let bundles = profile["bundles"] as? [String] {
            names.append(contentsOf: bundles)
        }

        var seen = Set<String>()
        for name in names where seen.insert(name).inserted {
            if name.hasPrefix("@deepseek-ai/") { continue }
            if name == Self.desktopHostPluginName || name == "dsh-desktop-claude" { continue }
            if name.range(of: "theme|skin", options: [.regularExpression, .caseInsensitive]) != nil {
                return name
            }
        }
        return nil
    }

    /// Check npm registry for outdated plugins using pnpm outdated --json.
    public func checkOutdatedPlugins() async throws -> [String: String] {
        guard let pnpm = NodeRuntime.shared.resolvePnpmBinary(),
              let node = NodeRuntime.shared.resolveNodeBinary() else {
            throw NSError(domain: "DshPluginManager", code: -1, userInfo: [NSLocalizedDescriptionKey: "缺少 Node 或 pnpm"])
        }

        if let hostBundle = NodeRuntime.shared.resolveDesktopHostBundlePath() {
            _ = repairDesktopHostDependency(hostBundle)
        }

        let profileDir = Self.webProfileDirectory
        guard FileManager.default.fileExists(atPath: profileDir.appendingPathComponent("package.json").path) else {
            return [:]
        }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: pnpm)
        proc.currentDirectoryURL = profileDir
        proc.arguments = ["outdated", "--json"]

        var env = NodeRuntime.shared.buildEnvironment()
        env["DSH_NODE_BIN"] = node
        proc.environment = env

        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = FileHandle.nullDevice

        try proc.run()
        proc.waitUntilExit()

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard !data.isEmpty,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }

        var outdated: [String: String] = [:]
        for (pkgName, info) in json {
            if let infoDict = info as? [String: Any],
               let latestVer = infoDict["latest"] as? String {
                outdated[pkgName] = latestVer
            }
        }
        return outdated
    }

    /// Add a plugin by name or npm specifier.
    public func addPlugin(spec: String) async throws {
        guard let pnpm = NodeRuntime.shared.resolvePnpmBinary(),
              let node = NodeRuntime.shared.resolveNodeBinary() else {
            throw NSError(domain: "DshPluginManager", code: -1, userInfo: [NSLocalizedDescriptionKey: "缺少 Node 或 pnpm"])
        }

        if let hostBundle = NodeRuntime.shared.resolveDesktopHostBundlePath() {
            _ = repairDesktopHostDependency(hostBundle)
        }

        let profileDir = Self.webProfileDirectory
        try FileManager.default.createDirectory(at: profileDir, withIntermediateDirectories: true)

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: pnpm)
        proc.currentDirectoryURL = profileDir
        proc.arguments = ["add", spec, "--reporter=append-only"]

        var env = NodeRuntime.shared.buildEnvironment()
        env["DSH_NODE_BIN"] = node
        proc.environment = env

        try proc.run()
        proc.waitUntilExit()

        guard proc.terminationStatus == 0 else {
            throw NSError(domain: "DshPluginManager", code: -2, userInfo: [NSLocalizedDescriptionKey: "安装插件 \(spec) 失败（退出码 \(proc.terminationStatus)）"])
        }
        if let packageName = packageName(from: spec) {
            try updateProfileBundle(packageName, removing: false)
        }
    }

    /// Update a specific plugin to its latest version.
    public func updatePlugin(name: String) async throws {
        guard let pnpm = NodeRuntime.shared.resolvePnpmBinary(),
              let node = NodeRuntime.shared.resolveNodeBinary() else {
            throw NSError(domain: "DshPluginManager", code: -1, userInfo: [NSLocalizedDescriptionKey: "缺少 Node 或 pnpm"])
        }

        // pnpm validates every direct dependency before updating one plugin.
        // Heal a stale Electron-era file: dependency first, otherwise any
        // plugin update is rejected before pnpm reaches the requested name.
        if let hostBundle = NodeRuntime.shared.resolveDesktopHostBundlePath() {
            _ = repairDesktopHostDependency(hostBundle)
        }

        let profileDir = Self.webProfileDirectory
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: pnpm)
        proc.currentDirectoryURL = profileDir
        proc.arguments = ["update", name, "--latest", "--reporter=append-only"]

        var env = NodeRuntime.shared.buildEnvironment()
        env["DSH_NODE_BIN"] = node
        proc.environment = env

        let stdout = Pipe()
        let stderr = Pipe()
        proc.standardOutput = stdout
        proc.standardError = stderr
        try proc.run()
        proc.waitUntilExit()

        guard proc.terminationStatus == 0 else {
            let detail = processOutput(stdout: stdout, stderr: stderr)
            throw NSError(domain: "DshPluginManager", code: -3, userInfo: [NSLocalizedDescriptionKey: "更新插件 \(name) 失败（退出码 \(proc.terminationStatus)）\(detail)"])
        }
    }

    /// Update all installed plugins to their latest versions.
    public func updateAllPlugins() async throws {
        guard let pnpm = NodeRuntime.shared.resolvePnpmBinary(),
              let node = NodeRuntime.shared.resolveNodeBinary() else {
            throw NSError(domain: "DshPluginManager", code: -1, userInfo: [NSLocalizedDescriptionKey: "缺少 Node 或 pnpm"])
        }

        if let hostBundle = NodeRuntime.shared.resolveDesktopHostBundlePath() {
            _ = repairDesktopHostDependency(hostBundle)
        }

        let profileDir = Self.webProfileDirectory
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: pnpm)
        proc.currentDirectoryURL = profileDir
        proc.arguments = ["update", "--latest", "--reporter=append-only"]

        var env = NodeRuntime.shared.buildEnvironment()
        env["DSH_NODE_BIN"] = node
        proc.environment = env

        try proc.run()
        proc.waitUntilExit()

        guard proc.terminationStatus == 0 else {
            throw NSError(domain: "DshPluginManager", code: -4, userInfo: [NSLocalizedDescriptionKey: "批量更新插件失败"])
        }
    }

    /// Remove a plugin by name.
    public func removePlugin(name: String) async throws {
        guard name != Self.desktopHostPluginName else {
            throw NSError(domain: "DshPluginManager", code: -5, userInfo: [NSLocalizedDescriptionKey: "不能删除系统内置桥接插件"])
        }
        guard let pnpm = NodeRuntime.shared.resolvePnpmBinary(),
              let node = NodeRuntime.shared.resolveNodeBinary() else {
            throw NSError(domain: "DshPluginManager", code: -1, userInfo: [NSLocalizedDescriptionKey: "缺少 Node 或 pnpm"])
        }

        if let hostBundle = NodeRuntime.shared.resolveDesktopHostBundlePath() {
            _ = repairDesktopHostDependency(hostBundle)
        }

        let profileDir = Self.webProfileDirectory
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: pnpm)
        proc.currentDirectoryURL = profileDir
        proc.arguments = ["remove", name, "--reporter=append-only"]

        var env = NodeRuntime.shared.buildEnvironment()
        env["DSH_NODE_BIN"] = node
        proc.environment = env

        try proc.run()
        proc.waitUntilExit()

        guard proc.terminationStatus == 0 else {
            throw NSError(domain: "DshPluginManager", code: -6, userInfo: [NSLocalizedDescriptionKey: "卸载插件 \(name) 失败"])
        }
        try updateProfileBundle(name, removing: true)
    }

    private func updateProfileBundle(_ name: String, removing: Bool) throws {
        let packageURL = Self.webProfileDirectory.appendingPathComponent("package.json")
        guard let data = try? Data(contentsOf: packageURL),
              var root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              var dsh = root["dsh"] as? [String: Any],
              var profile = dsh["profile"] as? [String: Any],
              var bundles = profile["bundles"] as? [String] else {
            return
        }

        if removing {
            bundles.removeAll { $0 == name }
        } else if !bundles.contains(name) {
            bundles.append(name)
        }

        profile["bundles"] = bundles
        dsh["profile"] = profile
        root["dsh"] = dsh
        let updated = try JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys])
        try updated.write(to: packageURL, options: .atomic)
    }

    private func packageName(from spec: String) -> String? {
        let value = spec.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty,
              !value.hasPrefix("github:"),
              !value.hasPrefix("file:"),
              !value.hasPrefix("link:"),
              !value.hasPrefix("./"),
              !value.hasPrefix("../") else {
            return nil
        }

        if value.hasPrefix("@"), let slash = value.firstIndex(of: "/") {
            let suffix = value.index(after: slash)
            let end = value[suffix...].firstIndex(of: "@") ?? value.endIndex
            return String(value[..<end])
        }

        let end = value.firstIndex(of: "@") ?? value.endIndex
        return String(value[..<end])
    }

    /// Keep the local bridge dependency and pnpm lockfile aligned with the
    /// currently running shell. Older Electron builds stored the bridge under
    /// app.asar.unpacked; Swift packages store it directly under Resources.
    @discardableResult
    private func repairDesktopHostDependency(_ hostBundle: String) -> Bool {
        let profileDir = Self.webProfileDirectory
        let packageURL = profileDir.appendingPathComponent("package.json")
        let lockURL = profileDir.appendingPathComponent("pnpm-lock.yaml")
        let hostSpec = "file:\(hostBundle)"
        let relativeHostPath = relativePath(from: profileDir, to: URL(fileURLWithPath: hostBundle))
        var changed = false

        if let data = try? Data(contentsOf: packageURL),
           var root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           var dependencies = root["dependencies"] as? [String: String],
           dependencies[Self.desktopHostPluginName] != hostSpec {
            dependencies[Self.desktopHostPluginName] = hostSpec
            root["dependencies"] = dependencies
            if let updated = try? JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys]) {
                try? updated.write(to: packageURL, options: .atomic)
                changed = true
            }
        }

        // Keep the lockfile in sync as well. It stores the absolute importer
        // specifier but relative package/snapshot references, and an old
        // Electron lockfile can otherwise keep pnpm resolving the dead path.
        if let lockData = try? Data(contentsOf: lockURL),
           var lock = String(data: lockData, encoding: .utf8) {
            var lines = lock.components(separatedBy: "\n")
            for index in lines.indices where lines[index].contains("dsh-desktop-host") {
                let line = lines[index]
                if let marker = line.range(of: "specifier:") {
                    let updatedLine = String(line[..<marker.upperBound]) + " " + hostSpec
                    if updatedLine != line {
                        lines[index] = updatedLine
                        changed = true
                    }
                } else if let marker = line.range(of: "version: file:") ?? line.range(of: "version: link:") {
                    let updatedLine = String(line[..<marker.upperBound]) + relativeHostPath
                    if updatedLine != line {
                        lines[index] = updatedLine
                        changed = true
                    }
                } else if let marker = line.range(of: "resolution: {directory: "),
                          let end = line.range(of: ", type: directory}", range: marker.upperBound..<line.endIndex) {
                    let updatedLine = String(line[..<marker.upperBound]) + relativeHostPath + String(line[end.lowerBound...])
                    if updatedLine != line {
                        lines[index] = updatedLine
                        changed = true
                    }
                } else if let marker = line.range(of: "@file:"),
                          let end = line.lastIndex(of: ":"), end > marker.upperBound {
                    let updatedLine = String(line[..<marker.upperBound]) + relativeHostPath + String(line[end...])
                    if updatedLine != line {
                        lines[index] = updatedLine
                        changed = true
                    }
                }
            }
            lock = lines.joined(separator: "\n")
            if let updated = lock.data(using: .utf8) {
                try? updated.write(to: lockURL, options: .atomic)
            }
        }

        return changed
    }

    private func relativePath(from base: URL, to target: URL) -> String {
        let baseComponents = base.standardizedFileURL.pathComponents
        let targetComponents = target.standardizedFileURL.pathComponents
        var common = 0
        while common < baseComponents.count,
              common < targetComponents.count,
              baseComponents[common] == targetComponents[common] {
            common += 1
        }

        let parentSteps = Array(repeating: "..", count: max(0, baseComponents.count - common))
        let targetSteps = Array(targetComponents.dropFirst(common))
        return (parentSteps + targetSteps).joined(separator: "/")
    }

    private func processOutput(stdout: Pipe, stderr: Pipe) -> String {
        let out = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let err = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let detail = [out, err]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
        return detail.isEmpty ? "" : "：\n\(detail)"
    }

    /// Repair the profile manifest created by an older Swift shell.
    ///
    /// The old first-launch path ran `pnpm add` before DSH had initialized the
    /// web profile. pnpm then created a package.json containing only
    /// `dependencies`, which made DSH boot an empty profile forever. Keep the
    /// user's installed plugin dependencies and restore only the missing DSH
    /// profile section so the normal DSH initializer can continue.
    public func repairWebProfileManifestIfNeeded() {
        let packageURL = Self.webProfileDirectory.appendingPathComponent("package.json")
        guard let data = try? Data(contentsOf: packageURL),
              var root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }

        var dsh = root["dsh"] as? [String: Any] ?? [:]
        var profile = dsh["profile"] as? [String: Any] ?? [:]
        if let bundles = profile["bundles"] as? [String], !bundles.isEmpty {
            return
        }

        profile["bundles"] = Self.standardWebProfileBundles
        dsh["profile"] = profile
        root["dsh"] = dsh

        guard let updated = try? JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys]) else {
            return
        }
        try? updated.write(to: packageURL, options: .atomic)
    }

    /// Whether the web profile has already been initialized enough for pnpm
    /// to add a local bridge bundle without recreating a partial manifest.
    /// A completely new profile is intentionally left for the first DSH boot
    /// so DSH can write its canonical package metadata first.
    public func hasInitializedWebProfileManifest() -> Bool {
        let packageURL = Self.webProfileDirectory.appendingPathComponent("package.json")
        guard let data = try? Data(contentsOf: packageURL),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let dsh = root["dsh"] as? [String: Any],
              let profile = dsh["profile"] as? [String: Any],
              let bundles = profile["bundles"] as? [String] else {
            return false
        }
        return !bundles.isEmpty
    }

    /// Ensure the built-in desktop host bridge plugin is installed and valid
    /// in the web profile. Returns true when the running DSH service must be
    /// restarted to load a changed profile bundle list.
    public func ensureDesktopHostPlugin() async -> Bool {
        guard let hostBundle = NodeRuntime.shared.resolveDesktopHostBundlePath(),
              let pnpm = NodeRuntime.shared.resolvePnpmBinary(),
              let node = NodeRuntime.shared.resolveNodeBinary() else {
            return false
        }

        let profileDir = Self.webProfileDirectory
        try? FileManager.default.createDirectory(at: profileDir, withIntermediateDirectories: true)
        let hostSpec = "file:\(hostBundle)"
        let dependencyWasRepaired = repairDesktopHostDependency(hostBundle)

        let plugins = listPlugins()
        if let existing = plugins.first(where: { $0.name == Self.desktopHostPluginName }) {
            if existing.version == hostSpec && !dependencyWasRepaired {
                if profileContainsBundle(Self.desktopHostPluginName) {
                    return false // Already installed and mounted.
                }
                try? updateProfileBundle(Self.desktopHostPluginName, removing: false)
                return true
            }
        }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: pnpm)
        proc.currentDirectoryURL = profileDir
        proc.arguments = ["add", "file:\(hostBundle)", "--reporter=append-only"]

        var env = NodeRuntime.shared.buildEnvironment()
        env["DSH_NODE_BIN"] = node
        proc.environment = env

        guard (try? proc.run()) != nil else { return false }
        proc.waitUntilExit()
        guard proc.terminationStatus == 0 else { return false }

        try? updateProfileBundle(Self.desktopHostPluginName, removing: false)
        return true
    }

    private func profileContainsBundle(_ name: String) -> Bool {
        let packageURL = Self.webProfileDirectory.appendingPathComponent("package.json")
        guard let data = try? Data(contentsOf: packageURL),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let dsh = root["dsh"] as? [String: Any],
              let profile = dsh["profile"] as? [String: Any],
              let bundles = profile["bundles"] as? [String] else {
            return false
        }
        return bundles.contains(name)
    }
}
