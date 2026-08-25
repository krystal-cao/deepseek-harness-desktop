import Foundation
import Darwin

/// Spawns and supervises the DSH Web child process.
public final class DshService: @unchecked Sendable {
    public static let shared = DshService()

    private var process: Process?
    private let lock = NSLock()
    private var isRestarting = false

    public enum ServiceError: Error, LocalizedError {
        case dshEntryNotFound
        case nodeNotFound
        case portInUse(Int)
        case startupFailed(String)

        public var errorDescription: String? {
            switch self {
            case .dshEntryNotFound:
                return "找不到 DSH 运行时入口。请确认已安装或在设置中下载版本。"
            case .nodeNotFound:
                return "找不到 Node.js 运行时可执行文件。"
            case .portInUse(let port):
                return "端口 \(port) 已被占用。请关闭占用该端口的程序或在设置中修改端口。"
            case .startupFailed(let detail):
                return "DSH 服务启动失败：\n\n\(detail)"
            }
        }
    }

    private static let readyRegex = try! NSRegularExpression(
        pattern: #"dsh web: (http://127\.0\.0\.1:\d+)\b"#
    )

    private init() {}

    /// Check if a local TCP port is available to bind.
    public func isPortAvailable(_ port: Int) -> Bool {
        var addr = sockaddr_in()
        addr.sin_len = __uint8_t(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = in_port_t(port).bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")

        let sock = socket(AF_INET, SOCK_STREAM, 0)
        guard sock >= 0 else { return false }
        defer { close(sock) }

        var reuse = 1
        setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int>.size))

        let bindResult = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return bindResult == 0
    }

    /// Start or restart the DSH service and return the ready URL.
    public func start(port: Int? = nil) async throws -> URL {
        let actualPort = port ?? (DshStateManager.shared.current.dshPort ?? 3080)

        // A settings change, version switch, or plugin mutation is a restart.
        // Wait for the old child to exit before probing the port; otherwise
        // the old service can make its own restart look like an external
        // conflict.
        await stopAndWait()
        let portDeadline = Date().addingTimeInterval(3.0)
        while !isPortAvailable(actualPort), Date() < portDeadline {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        guard isPortAvailable(actualPort) else {
            throw ServiceError.portInUse(actualPort)
        }

        guard let entry = DshVersionManager.shared.resolveCurrentEntry() else {
            throw ServiceError.dshEntryNotFound
        }

        guard let nodePath = NodeRuntime.shared.resolveNodeBinary() else {
            throw ServiceError.nodeNotFound
        }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: nodePath)
        proc.arguments = Self.buildArguments(
            entry: entry,
            port: actualPort,
            version: Self.resolveDshVersion(forEntry: entry)
        )
        proc.standardInput = FileHandle.nullDevice

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        proc.standardOutput = stdoutPipe
        proc.standardError = stderrPipe

        let environment = NodeRuntime.shared.buildEnvironment()
        proc.environment = environment

        do {
            try proc.run()
        } catch {
            throw ServiceError.startupFailed(error.localizedDescription)
        }
        process = proc

        let waiter = ProcessWaiter(proc: proc, stdoutPipe: stdoutPipe, stderrPipe: stderrPipe)
        return try await waiter.wait()
    }

    public static func buildArguments(entry: String, port: Int, version: String?) -> [String] {
        var arguments = [
            "--expose-internals",
            entry,
            "--profile", "web",
            "--host", "127.0.0.1",
            "--port", String(port)
        ]
        if let version,
           let semanticVersion = DshSemanticVersion(version),
           semanticVersion.supportsNoOpen {
            arguments.append("--no-open")
        }
        return arguments
    }

    private static func resolveDshVersion(forEntry entry: String) -> String? {
        var directory = URL(fileURLWithPath: entry).deletingLastPathComponent()
        for _ in 0..<5 {
            let manifestURL = directory.appendingPathComponent("package.json")
            if let data = try? Data(contentsOf: manifestURL),
               let manifest = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               manifest["name"] as? String == "@deepseek-ai/dsh",
               let version = manifest["version"] as? String {
                return version
            }
            directory.deleteLastPathComponent()
        }
        return nil
    }

    public func stop() {
        let proc = takeProcess()
        guard let proc, proc.isRunning else { return }
        proc.terminationHandler = nil
        proc.terminate()
        let pid = proc.processIdentifier
        DispatchQueue.global().asyncAfter(deadline: .now() + 3.0) {
            kill(pid, SIGKILL)
        }
    }

    private func stopAndWait() async {
        let proc = takeProcess()

        guard let proc, proc.isRunning else { return }
        proc.terminationHandler = nil
        proc.terminate()

        let deadline = Date().addingTimeInterval(3.0)
        while proc.isRunning, Date() < deadline {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }

        if proc.isRunning {
            kill(proc.processIdentifier, SIGKILL)
            while proc.isRunning, Date() < deadline.addingTimeInterval(1.0) {
                try? await Task.sleep(nanoseconds: 50_000_000)
            }
        }
    }

    private func takeProcess() -> Process? {
        lock.lock()
        defer { lock.unlock() }
        let proc = process
        process = nil
        return proc
    }
}

private final class ProcessWaiter: @unchecked Sendable {
    private let proc: Process
    private let stdoutPipe: Pipe
    private let stderrPipe: Pipe
    private let lock = NSLock()
    private var output = ""
    private var settled = false
    private var continuation: CheckedContinuation<URL, Error>?
    private var timeoutTask: DispatchWorkItem?

    private static let readyRegex = try! NSRegularExpression(
        pattern: #"dsh web: (http://127\.0\.0\.1:\d+)\b"#
    )

    init(proc: Process, stdoutPipe: Pipe, stderrPipe: Pipe) {
        self.proc = proc
        self.stdoutPipe = stdoutPipe
        self.stderrPipe = stderrPipe
    }

    func wait() async throws -> URL {
        return try await withCheckedThrowingContinuation { cont in
            self.continuation = cont

            let timeoutTask = DispatchWorkItem { [weak self] in
                guard let self = self else { return }
                self.proc.terminate()
                self.lock.lock()
                let currentOutput = self.output.isEmpty ? "等待 60 秒后超时。" : self.output
                self.lock.unlock()
                self.finish(.failure(DshService.ServiceError.startupFailed(currentOutput)))
            }
            self.timeoutTask = timeoutTask

            self.stdoutPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
                self?.inspect(handle.availableData)
            }
            self.stderrPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
                self?.inspect(handle.availableData)
            }

            DispatchQueue.global().asyncAfter(deadline: .now() + 60, execute: timeoutTask)

            self.proc.terminationHandler = { [weak self] terminatedProcess in
                guard let self = self else { return }
                self.lock.lock()
                let detail = """
                退出码 \(terminatedProcess.terminationStatus)，信号 \(terminatedProcess.terminationReason.rawValue)
                \(self.output)
                """
                self.lock.unlock()
                self.finish(.failure(DshService.ServiceError.startupFailed(detail)))
            }
        }
    }

    private func inspect(_ data: Data) {
        guard !data.isEmpty,
              let chunk = String(data: data, encoding: .utf8) else { return }
        lock.lock()
        output += chunk
        let range = NSRange(output.startIndex..., in: output)
        let match = Self.readyRegex.firstMatch(in: output, range: range)
        var matchedUrl: URL?
        if let match = match, let urlRange = Range(match.range(at: 1), in: output) {
            matchedUrl = URL(string: String(output[urlRange]))
        }
        lock.unlock()

        if let url = matchedUrl {
            finish(.success(url))
        }
    }

    private func finish(_ result: Result<URL, Error>) {
        lock.lock()
        defer { lock.unlock() }
        guard !settled else { return }
        settled = true
        timeoutTask?.cancel()
        timeoutTask = nil
        stdoutPipe.fileHandleForReading.readabilityHandler = nil
        stderrPipe.fileHandleForReading.readabilityHandler = nil
        continuation?.resume(with: result)
        continuation = nil
    }
}
