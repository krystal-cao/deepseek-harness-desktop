import Foundation
import UserNotifications
import AppKit

public final class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    public static let shared = NotificationManager()

    private override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    /// Request notification authorization.
    public func requestAuthorization() {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .notDetermined else { return }
            center.requestAuthorization(options: [.alert, .sound, .badge]) { _, error in
                if let error = error {
                    print("[NotificationManager] Authorization error:", error)
                }
            }
        }
    }

    /// Display a task completion notification.
    public func showTaskDoneNotification(title: String?, cwd: String?) {
        let sessionLabel = (title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
            ? title!.trimmingCharacters(in: .whitespacesAndNewlines)
            : "会话"

        var workspace: String?
        if let cwd = cwd?.trimmingCharacters(in: .whitespacesAndNewlines), !cwd.isEmpty {
            workspace = URL(fileURLWithPath: cwd).lastPathComponent
        }

        let content = UNMutableNotificationContent()
        content.title = "任务完成"
        if let workspace = workspace {
            content.body = "\(sessionLabel)\n工作区：\(workspace)"
        } else {
            content.body = sessionLabel
        }
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("[NotificationManager] Failed to post notification:", error)
            }
        }
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        DispatchQueue.main.async {
            // Match Electron's click behavior: bring the actual DSH window
            // back when it was hidden behind the Dock or the red light.
            MainWindowController.shared.showMainWindow()
            completionHandler()
        }
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}
