import Foundation

public struct DshVersionItem: Identifiable, Equatable {
    public var id: String { version }
    public let version: String
    public let publishedAt: String?
    public let tags: [String]
    public let isInstalled: Bool
    public let isSelected: Bool

    public init(
        version: String,
        publishedAt: String? = nil,
        tags: [String] = [],
        isInstalled: Bool = false,
        isSelected: Bool = false
    ) {
        self.version = version
        self.publishedAt = publishedAt
        self.tags = tags
        self.isInstalled = isInstalled
        self.isSelected = isSelected
    }
}

public struct InstallProgress: Equatable {
    public let version: String
    public let phase: String
    public let detail: String?
}

private struct DshFamilyManifest: Decodable {
    let packages: [String]
}

private struct DshFamilyAlignment {
    let available: [String]
    let missing: [String]
}

public final class DshVersionManager {
    public static let shared = DshVersionManager()

    public static let defaultRegistry = "https://registry.npmjs.org"
    public static let mirrorRegistry = "https://registry.npmmirror.com"
    private static let versionPattern = try! NSRegularExpression(pattern: #"^\d+\.\d+\.\d+(?:-rc\.\d+)?$"#)

    private init() {
        cleanupStaleStagingDirs()
    }

    public func cleanupStaleStagingDirs() {
        let dir = DshStateManager.versionsDirectory
        guard let items = try? FileManager.default.contentsOfDirectory(atPath: dir.path) else { return }
        for item in items where item.hasPrefix(".staging-") {
            let path = dir.appendingPathComponent(item).path
            try? FileManager.default.removeItem(atPath: path)
        }
    }

    public static func isValidVersion(_ version: String) -> Bool {
        let range = NSRange(version.startIndex..., in: version)
        return versionPattern.firstMatch(in: version, range: range) != nil
    }

    /// List only complete user-installed versions. Swift has no bundled DSH
    /// version; the app ships Node and installs the DSH runtime on demand.
    public func listInstalledVersions() -> [String] {
        let dir = DshStateManager.versionsDirectory
        guard let entries = try? FileManager.default.contentsOfDirectory(atPath: dir.path) else { return [] }
        var installed: [String] = []
        for name in entries where !name.hasPrefix(".") {
            if resolvedEntry(for: name) != nil {
                installed.append(name)
            }
        }
        return sortVersions(installed)
    }

    public func isVersionInstalled(_ version: String) -> Bool {
        resolvedEntry(for: version) != nil
    }

    /// Establish the initial selection only when the state has no selection.
    /// A stale/corrupt explicit selection is kept unresolved so the UI can
    /// explain that the selected runtime must be reinstalled.
    @discardableResult
    public func ensureSelection() -> String? {
        let state = DshStateManager.shared.current
        if let selected = state.selectedVersion {
            return isVersionInstalled(selected) ? selected : nil
        }
        guard let first = listInstalledVersions().first else { return nil }
        DshStateManager.shared.update { $0.selectedVersion = first }
        return first
    }

    /// Resolve the executable bin.js path for the currently active version.
    public func resolveCurrentEntry() -> String? {
        if let selected = DshStateManager.shared.current.selectedVersion {
            return resolvedEntry(for: selected)?.path
        }

        if let first = listInstalledVersions().first {
            DshStateManager.shared.update { $0.selectedVersion = first }
            return resolvedEntry(for: first)?.path
        }

        // Development-only fallback. A packaged Swift app intentionally has
        // no bundled DSH runtime and therefore reaches onboarding instead.
        // Also check development workspace node_modules.
        let execUrl = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
        var searchDir = execUrl.deletingLastPathComponent()
        for _ in 0..<8 {
            let candidate = searchDir.appendingPathComponent("node_modules/@deepseek-ai/dsh/lib/bin.js").path
            if FileManager.default.fileExists(atPath: candidate) {
                return candidate
            }
            searchDir.deleteLastPathComponent()
        }
        return nil
    }

    private func resolvedEntry(for version: String) -> URL? {
        guard Self.isValidVersion(version) else { return nil }
        let packageRoot = DshStateManager.versionsDirectory
            .appendingPathComponent(version, isDirectory: true)
            .appendingPathComponent("node_modules", isDirectory: true)
            .appendingPathComponent("@deepseek-ai", isDirectory: true)
            .appendingPathComponent("dsh", isDirectory: true)
        let manifestURL = packageRoot.appendingPathComponent("package.json")
        guard
            let data = try? Data(contentsOf: manifestURL),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            json["name"] as? String == "@deepseek-ai/dsh",
            json["version"] as? String == version
        else { return nil }

        let bin: String?
        if let value = json["bin"] as? String {
            bin = value
        } else if let values = json["bin"] as? [String: String] {
            bin = values["dsh"]
        } else {
            bin = nil
        }

        guard let bin, !bin.isEmpty else { return nil }
        let rootPath = packageRoot.standardizedFileURL.path
        let entry = packageRoot.appendingPathComponent(bin).standardizedFileURL
        guard entry.path.hasPrefix(rootPath + "/") else { return nil }
        return FileManager.default.fileExists(atPath: entry.path) ? entry : nil
    }

    /// Fetch version catalog from the npm registry.
    public func fetchCatalog(registry: String? = nil) async throws -> (latest: String?, versions: [DshVersionItem]) {
        let reg = (registry?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
            ? registry!.trimmingCharacters(in: .whitespacesAndNewlines)
            : (DshStateManager.shared.current.npmRegistry ?? Self.defaultRegistry)
        let trimmedReg = reg.hasSuffix("/") ? String(reg.dropLast()) : reg
        guard let url = URL(string: "\(trimmedReg)/@deepseek-ai%2Fdsh") ?? URL(string: "\(trimmedReg)/@deepseek-ai/dsh") else {
            throw NSError(domain: "DshVersionManager", code: -1, userInfo: [NSLocalizedDescriptionKey: "无效的 npm Registry 地址"])
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 15.0
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw NSError(domain: "DshVersionManager", code: -2, userInfo: [NSLocalizedDescriptionKey: "无法从 npm registry 获取 DSH 版本目录"])
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NSError(domain: "DshVersionManager", code: -3, userInfo: [NSLocalizedDescriptionKey: "npm registry 返回格式错误"])
        }

        let distTags = json["dist-tags"] as? [String: String] ?? [:]
        let latestTag = distTags["latest"]
        let timeDict = json["time"] as? [String: String] ?? [:]
        let versionsDict = json["versions"] as? [String: Any] ?? [:]

        let installed = Set(listInstalledVersions())
        let currentSelected = DshStateManager.shared.current.selectedVersion

        let allVersions = sortVersions(Array(versionsDict.keys))
        let items: [DshVersionItem] = allVersions.map { ver in
            var tags: [String] = []
            for (tag, tagVer) in distTags where tagVer == ver {
                tags.append(tag)
            }
            return DshVersionItem(
                version: ver,
                publishedAt: timeDict[ver],
                tags: tags,
                isInstalled: installed.contains(ver),
                isSelected: currentSelected == ver
            )
        }

        return (latest: latestTag, versions: items)
    }

    private func loadDshFamilyPackages() throws -> [String] {
        guard let assetsDirectory = NodeRuntime.shared.resolveAssetsDirectory() else {
            throw NSError(
                domain: "DshVersionManager",
                code: -13,
                userInfo: [NSLocalizedDescriptionKey: "找不到 DSH 插件族清单所在的资源目录"]
            )
        }

        let manifestURL = URL(fileURLWithPath: assetsDirectory)
            .appendingPathComponent("dsh-family.json")
        guard let data = try? Data(contentsOf: manifestURL),
              let manifest = try? JSONDecoder().decode(DshFamilyManifest.self, from: data) else {
            throw NSError(
                domain: "DshVersionManager",
                code: -13,
                userInfo: [NSLocalizedDescriptionKey: "无法读取 DSH 插件族清单"]
            )
        }

        let packages = manifest.packages.sorted()
        guard !packages.isEmpty,
              Set(packages).count == packages.count,
              packages.allSatisfy({ $0.hasPrefix("@deepseek-ai/dsh-") }) else {
            throw NSError(
                domain: "DshVersionManager",
                code: -13,
                userInfo: [NSLocalizedDescriptionKey: "DSH 插件族清单格式无效"]
            )
        }
        return packages
    }

    private func resolveAlignedFamily(version: String, registry: String) async throws -> DshFamilyAlignment {
        let packages = try loadDshFamilyPackages()
        var registryBase = registry.trimmingCharacters(in: .whitespacesAndNewlines)
        while registryBase.hasSuffix("/") { registryBase.removeLast() }

        let results = await withTaskGroup(of: (String, Bool).self) { group in
            for package in packages {
                group.addTask {
                    guard let url = URL(string: "\(registryBase)/\(package)") else {
                        return (package, false)
                    }
                    var request = URLRequest(url: url)
                    request.timeoutInterval = 10.0
                    request.setValue("application/vnd.npm.install-v1+json", forHTTPHeaderField: "Accept")
                    do {
                        let (data, response) = try await URLSession.shared.data(for: request)
                        guard let httpResponse = response as? HTTPURLResponse,
                              (200...299).contains(httpResponse.statusCode),
                              let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                              let versions = root["versions"] as? [String: Any] else {
                            return (package, false)
                        }
                        return (package, versions[version] != nil)
                    } catch {
                        return (package, false)
                    }
                }
            }

            var values: [(String, Bool)] = []
            for await result in group { values.append(result) }
            return values
        }

        return DshFamilyAlignment(
            available: results.filter(\.1).map(\.0).sorted(),
            missing: results.filter { !$0.1 }.map(\.0).sorted()
        )
    }

    private func misalignedFamilyPackages(
        in installRoot: URL,
        version: String,
        packages: [String]
    ) -> [String] {
        packages.filter { package in
            let manifestURL = installRoot
                .appendingPathComponent("node_modules", isDirectory: true)
                .appendingPathComponent(package, isDirectory: true)
                .appendingPathComponent("package.json")
            guard let data = try? Data(contentsOf: manifestURL),
                  let manifest = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return true
            }
            return manifest["name"] as? String != package || manifest["version"] as? String != version
        }
    }

    /// Install a specific version using bundled pnpm into an atomic directory.
    public func installVersion(
        version: String,
        registry: String? = nil,
        onProgress: @escaping (InstallProgress) -> Void
    ) async throws -> Bool {
        guard Self.isValidVersion(version) else {
            throw NSError(domain: "DshVersionManager", code: -8, userInfo: [NSLocalizedDescriptionKey: "无效的 DSH 版本号：\(version)"])
        }
        guard let pnpm = NodeRuntime.shared.resolvePnpmBinary(),
              let node = NodeRuntime.shared.resolveNodeBinary() else {
            throw NSError(domain: "DshVersionManager", code: -4, userInfo: [NSLocalizedDescriptionKey: "缺少 Node.js 运行时或 pnpm 包管理器"])
        }

        let hadRunnableVersion = resolveCurrentEntry() != nil
        let existingTarget = DshStateManager.versionsDirectory.appendingPathComponent(version, isDirectory: true)
        if FileManager.default.fileExists(atPath: existingTarget.path) {
            guard isVersionInstalled(version) else {
                throw NSError(domain: "DshVersionManager", code: -9, userInfo: [NSLocalizedDescriptionKey: "已存在但无法校验 DSH \(version) 的安装目录"])
            }
            if !hadRunnableVersion {
                DshStateManager.shared.update { $0.selectedVersion = version }
                return true
            }
            return false
        }

        let reg = (registry?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
            ? registry!.trimmingCharacters(in: .whitespacesAndNewlines)
            : (DshStateManager.shared.current.npmRegistry ?? Self.defaultRegistry)

        let versionsDir = DshStateManager.versionsDirectory
        let stagingName = ".staging-\(version)-\(Int(Date().timeIntervalSince1970))"
        let stagingDir = versionsDir.appendingPathComponent(stagingName)
        let targetDir = versionsDir.appendingPathComponent(version)

        try FileManager.default.createDirectory(at: stagingDir, withIntermediateDirectories: true)
        var movedToTarget = false
        defer {
            if !movedToTarget {
                try? FileManager.default.removeItem(at: stagingDir)
            }
        }

        onProgress(InstallProgress(version: version, phase: "正在检查 DSH 插件族...", detail: "目标版本：\(version)"))
        let alignedFamily = try await resolveAlignedFamily(version: version, registry: reg)
        let familyTotal = alignedFamily.available.count + alignedFamily.missing.count
        onProgress(InstallProgress(
            version: version,
            phase: "正在从 npm 下载 DSH \(version)...",
            detail: "插件族 \(alignedFamily.available.count)/\(familyTotal) 可对齐 · Registry: \(reg)"
        ))

        // pnpm 11 blocks dependency build scripts by default. Fetch the tree
        // without scripts first, then approve only the scripts present in the
        // downloaded tree and rebuild them. This is the same two-stage flow as
        // the web version and avoids failing halfway through an RC install.
        var dependencies = ["@deepseek-ai/dsh": version]
        for package in alignedFamily.available { dependencies[package] = version }
        let packageObject: [String: Any] = [
            "name": "deepseek-harness-desktop-managed-dsh",
            "version": "0.0.0",
            "private": true,
            "dependencies": dependencies
        ]
        var packageData = try JSONSerialization.data(
            withJSONObject: packageObject,
            options: [.prettyPrinted, .sortedKeys]
        )
        packageData.append(0x0A)
        try packageData.write(to: stagingDir.appendingPathComponent("package.json"), options: .atomic)
        try writeText(
            "registry=\(reg)\nprefer-offline=true\naudit=false\nminimum-release-age=0\n",
            to: stagingDir.appendingPathComponent(".npmrc")
        )

        var env = NodeRuntime.shared.buildEnvironment()
        env["DSH_NODE_BIN"] = node

        _ = try runPnpmCommand(
            pnpm: pnpm,
            node: node,
            currentDirectory: stagingDir,
            arguments: [
                "add",
                "@deepseek-ai/dsh@\(version)",
                "--registry", reg,
                "--prefer-offline",
                "--ignore-scripts",
                "--reporter=append-only"
            ],
            environment: env,
            version: version,
            phase: "正在安装依赖...",
            onProgress: onProgress
        )

        let buildScripts = collectBuildScriptNames(in: stagingDir)
        if !buildScripts.isEmpty {
            let allowBuilds = (["allowBuilds:"] + buildScripts.map { "  \(yamlQuoted($0)): true" }).joined(separator: "\n") + "\n"
            try writeText(allowBuilds, to: stagingDir.appendingPathComponent("pnpm-workspace.yaml"))
            _ = try runPnpmCommand(
                pnpm: pnpm,
                node: node,
                currentDirectory: stagingDir,
                arguments: ["rebuild", "--reporter=append-only"],
                environment: env,
                version: version,
                phase: "正在编译依赖...",
                onProgress: onProgress
            )
        }

        // Validate entry bin.js
        let binPath = stagingDir.appendingPathComponent("node_modules/@deepseek-ai/dsh/lib/bin.js").path
        guard FileManager.default.fileExists(atPath: binPath) else {
            try? FileManager.default.removeItem(at: stagingDir)
            throw NSError(domain: "DshVersionManager", code: -6, userInfo: [NSLocalizedDescriptionKey: "安装产物中未找到 bin.js 入口"])
        }

        let misalignedPackages = misalignedFamilyPackages(
            in: stagingDir,
            version: version,
            packages: alignedFamily.available
        )
        guard misalignedPackages.isEmpty else {
            throw NSError(
                domain: "DshVersionManager",
                code: -14,
                userInfo: [
                    NSLocalizedDescriptionKey: "DSH 插件族版本校验失败：\(misalignedPackages.joined(separator: ", "))"
                ]
            )
        }

        onProgress(InstallProgress(version: version, phase: "正在准备环境...", detail: "移动到版本目录"))

        // Atomically replace target directory
        if FileManager.default.fileExists(atPath: targetDir.path) {
            try? FileManager.default.removeItem(at: targetDir)
        }
        try FileManager.default.moveItem(at: stagingDir, to: targetDir)
        movedToTarget = true

        DshStateManager.shared.update { state in
            if !hadRunnableVersion || state.selectedVersion == nil {
                state.selectedVersion = version
            }
        }

        onProgress(InstallProgress(
            version: version,
            phase: "安装完成",
            detail: "插件族已对齐 \(alignedFamily.available.count) 个，\(alignedFamily.missing.count) 个版本尚未发布"
        ))
        return !hadRunnableVersion
    }

    private func writeText(_ text: String, to url: URL) throws {
        guard let data = text.data(using: .utf8) else {
            throw NSError(domain: "DshVersionManager", code: -7, userInfo: [NSLocalizedDescriptionKey: "无法写入 pnpm 安装配置"])
        }
        try data.write(to: url, options: .atomic)
    }

    private func yamlQuoted(_ value: String) -> String {
        "\"" + value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
    }

    /// Find packages that declare an install lifecycle script in the staging tree.
    private func collectBuildScriptNames(in staging: URL) -> [String] {
        let nodeModules = staging.appendingPathComponent("node_modules", isDirectory: true)
        guard let enumerator = FileManager.default.enumerator(
            at: nodeModules,
            includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey],
            options: []
        ) else { return [] }

        var names = Set<String>()
        for case let url as URL in enumerator where url.lastPathComponent == "package.json" {
            guard
                let data = try? Data(contentsOf: url),
                let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                let scripts = json["scripts"] as? [String: Any],
                ["preinstall", "install", "postinstall"].contains(where: { scripts[$0] != nil }),
                let name = json["name"] as? String,
                !name.isEmpty
            else { continue }
            names.insert(name)
        }
        return names.sorted()
    }

    @discardableResult
    private func runPnpmCommand(
        pnpm: String,
        node: String,
        currentDirectory: URL,
        arguments: [String],
        environment: [String: String],
        version: String,
        phase: String,
        onProgress: @escaping (InstallProgress) -> Void
    ) throws -> String {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: pnpm)
        proc.currentDirectoryURL = currentDirectory
        proc.arguments = arguments
        var childEnvironment = environment
        childEnvironment["DSH_NODE_BIN"] = node
        proc.environment = childEnvironment

        let stdout = Pipe()
        let stderr = Pipe()
        proc.standardOutput = stdout
        proc.standardError = stderr

        let outputLock = NSLock()
        var output = ""
        func consume(_ data: Data) {
            guard !data.isEmpty, let chunk = String(data: data, encoding: .utf8), !chunk.isEmpty else { return }
            outputLock.lock()
            output.append(chunk)
            outputLock.unlock()
            let detail = chunk.trimmingCharacters(in: .whitespacesAndNewlines)
            if !detail.isEmpty {
                DispatchQueue.main.async {
                    onProgress(InstallProgress(version: version, phase: phase, detail: detail))
                }
            }
        }

        stdout.fileHandleForReading.readabilityHandler = { handle in consume(handle.availableData) }
        stderr.fileHandleForReading.readabilityHandler = { handle in consume(handle.availableData) }

        do {
            try proc.run()
            proc.waitUntilExit()
        } catch {
            stdout.fileHandleForReading.readabilityHandler = nil
            stderr.fileHandleForReading.readabilityHandler = nil
            throw error
        }

        stdout.fileHandleForReading.readabilityHandler = nil
        stderr.fileHandleForReading.readabilityHandler = nil
        consume(stdout.fileHandleForReading.readDataToEndOfFile())
        consume(stderr.fileHandleForReading.readDataToEndOfFile())

        outputLock.lock()
        let finalOutput = output.trimmingCharacters(in: .whitespacesAndNewlines)
        outputLock.unlock()

        guard proc.terminationStatus == 0 else {
            let detail = finalOutput.isEmpty ? "未返回具体错误信息" : String(finalOutput.suffix(1200))
            throw NSError(
                domain: "DshVersionManager",
                code: -5,
                userInfo: [NSLocalizedDescriptionKey: "pnpm 安装 DSH \(version) 失败（退出码 \(proc.terminationStatus)）\n\n\(detail)"]
            )
        }
        return finalOutput
    }

    /// Uninstall a version.
    public func uninstallVersion(version: String) throws {
        guard Self.isValidVersion(version) else {
            throw NSError(domain: "DshVersionManager", code: -10, userInfo: [NSLocalizedDescriptionKey: "无效的 DSH 版本号"])
        }
        let current = DshStateManager.shared.current.selectedVersion
        guard current != version else {
            throw NSError(domain: "DshVersionManager", code: -11, userInfo: [NSLocalizedDescriptionKey: "请先切换到其他版本，再卸载当前版本"])
        }
        let targetDir = DshStateManager.versionsDirectory.appendingPathComponent(version)
        guard isVersionInstalled(version), FileManager.default.fileExists(atPath: targetDir.path) else {
            throw NSError(domain: "DshVersionManager", code: -12, userInfo: [NSLocalizedDescriptionKey: "该版本未安装"])
        }
        try FileManager.default.removeItem(at: targetDir)
    }

    /// Natural SemVer version sorting (highest version first).
    public func sortVersions(_ versions: [String]) -> [String] {
        return versions.sorted { a, b in
            let parsedA = DshSemanticVersion(a)
            let parsedB = DshSemanticVersion(b)
            switch (parsedA, parsedB) {
            case let (left?, right?):
                if left != right { return left > right }
                return a > b
            case (_?, nil):
                return true
            case (nil, _?):
                return false
            case (nil, nil):
                return a > b
            }
        }
    }

    public func isVersionNewer(_ lhs: String, than rhs: String) -> Bool {
        guard let left = DshSemanticVersion(lhs),
              let right = DshSemanticVersion(rhs) else { return false }
        return left > right
    }
}
