import Foundation
import SwiftUI
import Combine

public extension Notification.Name {
    static let dshSettingsPanelDidChange = Notification.Name("dsh.settingsPanelDidChange")
}

@MainActor
public final class SettingsViewModel: ObservableObject {
    public static let shared = SettingsViewModel()
    private static let selectedPanelDefaultsKey = "dsh.settings.selectedPanel"

    @Published public var availableVersions: [DshVersionItem] = []
    @Published public var installedVersions: [String] = []
    @Published public var selectedVersion: String? = nil
    @Published public var selectedCategoryIndex: Int = 0
    @Published public var latestVersion: String? = nil
    @Published public var autoFollowLatest: Bool = false
    @Published public var npmRegistry: String = DshVersionManager.defaultRegistry
    @Published public var dshPort: Int = 3080
    @Published public var uiTheme: String = "default"
    @Published public private(set) var externalTheme: String?
    @Published public var translateCommands: Bool = true

    @Published public var installedPlugins: [DshPluginItem] = []
    @Published public var outdatedPluginsMap: [String: String] = [:]

    @Published public var isInstallingVersion: Bool = false
    @Published public var isSwitchingVersion: Bool = false
    @Published public var isUninstallingVersion: Bool = false
    @Published public var installingVersionName: String? = nil
    @Published public var uninstallingVersionName: String? = nil
    @Published public var installProgressPhase: String = ""
    @Published public var installProgressDetail: String? = nil

    @Published public var isLoadingCatalog: Bool = false
    @Published public var isRefreshingPlugins: Bool = false
    @Published public var isCheckingPluginUpdates: Bool = false
    @Published public var isOperatingPlugin: Bool = false
    @Published public var operatingPluginName: String? = nil
    @Published public var alertMessage: String? = nil

    private var isFollowingLatest = false

    private init() {
        if let savedPanel = UserDefaults.standard.object(forKey: Self.selectedPanelDefaultsKey) as? Int,
           SettingsPanel(rawValue: savedPanel) != nil {
            self.selectedCategoryIndex = savedPanel
        }
        loadFromState()
    }

    public func rememberSelectedPanel(_ panel: SettingsPanel) {
        selectedCategoryIndex = panel.rawValue
        UserDefaults.standard.set(panel.rawValue, forKey: Self.selectedPanelDefaultsKey)
        NotificationCenter.default.post(name: .dshSettingsPanelDidChange, object: panel)
    }

    public func loadFromState() {
        let state = DshStateManager.shared.current
        self.selectedVersion = DshVersionManager.shared.ensureSelection()
        self.autoFollowLatest = state.autoFollowLatest
        self.npmRegistry = state.npmRegistry ?? DshVersionManager.defaultRegistry
        self.dshPort = state.dshPort ?? 3080
        self.uiTheme = state.uiTheme
        self.externalTheme = DshPluginManager.shared.detectExternalTheme()
        self.translateCommands = state.translateCommands
        self.installedVersions = DshVersionManager.shared.listInstalledVersions()
        self.installedPlugins = DshPluginManager.shared.listPlugins(outdatedMap: outdatedPluginsMap)
    }

    /// Refresh the profile-based theme state after plugin changes or when the
    /// general settings page becomes visible.
    public func refreshExternalTheme() {
        let detected = DshPluginManager.shared.detectExternalTheme()
        guard externalTheme != detected else { return }
        externalTheme = detected
        MainWindowController.shared.syncUiTheme()
    }

    /// The bridge can report the active theme, but the package manifest is the
    /// stable source used by Electron for settings availability. Re-read it so
    /// a stale bridge snapshot cannot keep the native control locked.
    public func refreshExternalThemeFromBridge() {
        refreshExternalTheme()
    }

    public func refreshCatalog() async {
        isLoadingCatalog = true
        let startedAt = Date()
        defer { isLoadingCatalog = false }
        do {
            let res = try await DshVersionManager.shared.fetchCatalog(registry: npmRegistry)
            self.latestVersion = res.latest
            self.availableVersions = res.versions
            self.installedVersions = DshVersionManager.shared.listInstalledVersions()
        } catch {
            self.alertMessage = error.localizedDescription
        }
        await holdRefreshAnimation(since: startedAt)
    }

    public func refreshPlugins() {
        self.installedPlugins = DshPluginManager.shared.listPlugins(outdatedMap: outdatedPluginsMap)
        refreshExternalTheme()
    }

    public func refreshPluginList() async {
        guard !isRefreshingPlugins else { return }
        isRefreshingPlugins = true
        let startedAt = Date()
        defer { isRefreshingPlugins = false }
        refreshPlugins()
        await holdRefreshAnimation(since: startedAt)
    }

    public func checkPluginUpdates() async {
        guard !isCheckingPluginUpdates else { return }
        isCheckingPluginUpdates = true
        let startedAt = Date()
        defer { isCheckingPluginUpdates = false }
        do {
            let map = try await DshPluginManager.shared.checkOutdatedPlugins()
            self.outdatedPluginsMap = map
            self.installedPlugins = DshPluginManager.shared.listPlugins(outdatedMap: map)
        } catch {
            self.alertMessage = "检测插件更新失败：\(error.localizedDescription)"
        }
        await holdRefreshAnimation(since: startedAt)
    }

    public func updatePlugin(name: String) {
        guard !isOperatingPlugin else { return }
        isOperatingPlugin = true
        operatingPluginName = name
        Task {
            do {
                try await DshPluginManager.shared.updatePlugin(name: name)
                self.outdatedPluginsMap.removeValue(forKey: name)
                self.refreshPlugins()
                self.isOperatingPlugin = false
                self.operatingPluginName = nil
                self.restartDshService()
            } catch {
                self.isOperatingPlugin = false
                self.operatingPluginName = nil
                self.alertMessage = "更新插件失败：\(error.localizedDescription)"
            }
        }
    }

    public func updateAllPlugins() {
        guard !isOperatingPlugin else { return }
        isOperatingPlugin = true
        operatingPluginName = "全部插件"
        Task {
            do {
                try await DshPluginManager.shared.updateAllPlugins()
                self.outdatedPluginsMap.removeAll()
                self.refreshPlugins()
                self.isOperatingPlugin = false
                self.operatingPluginName = nil
                self.restartDshService()
            } catch {
                self.isOperatingPlugin = false
                self.operatingPluginName = nil
                self.alertMessage = "批量更新插件失败：\(error.localizedDescription)"
            }
        }
    }

    public func installVersion(_ version: String) {
        guard !isInstallingVersion else { return }
        isInstallingVersion = true
        installingVersionName = version
        installProgressPhase = "准备安装 DSH \(version)..."
        installProgressDetail = nil

        Task { [self] in
            do {
                let selectedByInstall = try await DshVersionManager.shared.installVersion(version: version, registry: npmRegistry) { progress in
                    Task { @MainActor in
                        self.installProgressPhase = progress.phase
                        self.installProgressDetail = progress.detail
                    }
                }
                self.loadFromState()
                await self.refreshCatalog()
                if selectedByInstall {
                    try await self.restartDshServiceAndWait()
                }
                self.isInstallingVersion = false
                self.installingVersionName = nil
            } catch {
                self.isInstallingVersion = false
                self.installingVersionName = nil
                self.alertMessage = "安装版本失败：\(error.localizedDescription)"
            }
        }
    }

    public func selectVersion(_ version: String) {
        guard !isInstallingVersion, !isSwitchingVersion, !isUninstallingVersion else { return }
        guard DshVersionManager.shared.isVersionInstalled(version) else {
            alertMessage = "该版本尚未安装"
            return
        }
        let previous = DshStateManager.shared.current.selectedVersion
        guard previous != version else { return }

        isSwitchingVersion = true
        DshStateManager.shared.update { $0.selectedVersion = version }
        selectedVersion = version
        installedVersions = DshVersionManager.shared.listInstalledVersions()

        Task { [self] in
            do {
                try await restartDshServiceAndWait()
                self.loadFromState()
                await self.refreshCatalog()
                self.isSwitchingVersion = false
            } catch {
                DshStateManager.shared.update { $0.selectedVersion = previous }
                self.loadFromState()
                await self.refreshCatalog()
                self.isSwitchingVersion = false
                self.alertMessage = "切换版本失败：\(error.localizedDescription)"
                if previous != nil {
                    try? await self.restartDshServiceAndWait()
                }
            }
        }
    }

    /// Match Electron's startup auto-follow behavior. With no bundled DSH,
    /// this only runs when a valid user-installed current version exists.
    public func followLatestIfEnabled() async {
        guard autoFollowLatest,
              !isInstallingVersion,
              !isSwitchingVersion,
              !isFollowingLatest,
              let latest = latestVersion,
              let current = DshStateManager.shared.current.selectedVersion,
              DshVersionManager.shared.isVersionInstalled(current),
              DshVersionManager.shared.isVersionNewer(latest, than: current) else { return }

        isFollowingLatest = true
        defer { isFollowingLatest = false }
        isInstallingVersion = true
        installingVersionName = latest
        installProgressPhase = "准备自动更新 DSH \(latest)..."
        installProgressDetail = nil
        do {
            _ = try await DshVersionManager.shared.installVersion(version: latest, registry: npmRegistry) { progress in
                Task { @MainActor in
                    self.installProgressPhase = progress.phase
                    self.installProgressDetail = progress.detail
                }
            }
            DshStateManager.shared.update { $0.selectedVersion = latest }
            selectedVersion = latest
            installedVersions = DshVersionManager.shared.listInstalledVersions()
            try await restartDshServiceAndWait()
            isInstallingVersion = false
            installingVersionName = nil
        } catch {
            DshStateManager.shared.update { $0.selectedVersion = current }
            selectedVersion = current
            isInstallingVersion = false
            installingVersionName = nil
            try? await restartDshServiceAndWait()
            alertMessage = "自动更新 DSH 失败：\(error.localizedDescription)"
        }
    }

    public func uninstallVersion(_ version: String) {
        guard !isInstallingVersion, !isSwitchingVersion, !isUninstallingVersion else { return }
        isUninstallingVersion = true
        uninstallingVersionName = version
        Task { [self] in
            do {
                try await performUninstall(version)
                self.loadFromState()
                await self.refreshCatalog()
            } catch {
                self.alertMessage = "卸载失败：\(error.localizedDescription)"
            }
            self.isUninstallingVersion = false
            self.uninstallingVersionName = nil
        }
    }

    private func performUninstall(_ version: String) async throws {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    try DshVersionManager.shared.uninstallVersion(version: version)
                    continuation.resume()
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    public func addPlugin(spec: String) {
        guard !isOperatingPlugin, !spec.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        isOperatingPlugin = true
        operatingPluginName = spec
        Task {
            do {
                try await DshPluginManager.shared.addPlugin(spec: spec)
                self.refreshPlugins()
                self.isOperatingPlugin = false
                self.operatingPluginName = nil
                self.restartDshService()
            } catch {
                self.isOperatingPlugin = false
                self.operatingPluginName = nil
                self.alertMessage = error.localizedDescription
            }
        }
    }

    public func removePlugin(name: String) {
        guard !isOperatingPlugin else { return }
        isOperatingPlugin = true
        operatingPluginName = name
        Task {
            do {
                try await DshPluginManager.shared.removePlugin(name: name)
                self.outdatedPluginsMap.removeValue(forKey: name)
                self.refreshPlugins()
                self.isOperatingPlugin = false
                self.operatingPluginName = nil
                self.restartDshService()
            } catch {
                self.isOperatingPlugin = false
                self.operatingPluginName = nil
                self.alertMessage = error.localizedDescription
            }
        }
    }

    public func saveGeneralSettings() {
        DshStateManager.shared.update { state in
            state.dshPort = dshPort
            state.npmRegistry = npmRegistry
            state.uiTheme = uiTheme
            state.translateCommands = translateCommands
            state.autoFollowLatest = autoFollowLatest
        }
        MainWindowController.shared.syncUiTheme()
        MainWindowController.shared.syncTranslateCommands()
    }

    public func restartDshService() {
        Task {
            MainWindowController.shared.startAndLoadDsh()
        }
    }

    private func restartDshServiceAndWait() async throws {
        _ = try await MainWindowController.shared.restartDshService()
    }

    private func holdRefreshAnimation(since startedAt: Date) async {
        let minimumDuration = 0.9
        let remaining = minimumDuration - Date().timeIntervalSince(startedAt)
        guard remaining > 0 else { return }
        try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
    }
}
