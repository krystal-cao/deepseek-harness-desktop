import Foundation

/// The restricted SemVer shape published by DSH: `major.minor.patch` with an
/// optional `-rc.number` prerelease suffix.
public struct DshSemanticVersion: Comparable, Sendable {
    public let major: Int
    public let minor: Int
    public let patch: Int
    public let releaseCandidate: Int?

    public init?(_ value: String) {
        let version = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let releaseParts = version.split(separator: "-", omittingEmptySubsequences: false)
        guard releaseParts.count == 1 || releaseParts.count == 2 else { return nil }

        let core = releaseParts[0].split(separator: ".", omittingEmptySubsequences: false)
        guard core.count == 3,
              let major = Int(core[0]), major >= 0,
              let minor = Int(core[1]), minor >= 0,
              let patch = Int(core[2]), patch >= 0 else { return nil }

        let releaseCandidate: Int?
        if releaseParts.count == 2 {
            let prerelease = releaseParts[1].split(separator: ".", omittingEmptySubsequences: false)
            guard prerelease.count == 2,
                  prerelease[0] == "rc",
                  let number = Int(prerelease[1]), number >= 0 else { return nil }
            releaseCandidate = number
        } else {
            releaseCandidate = nil
        }

        self.major = major
        self.minor = minor
        self.patch = patch
        self.releaseCandidate = releaseCandidate
    }

    public static func < (lhs: DshSemanticVersion, rhs: DshSemanticVersion) -> Bool {
        if lhs.major != rhs.major { return lhs.major < rhs.major }
        if lhs.minor != rhs.minor { return lhs.minor < rhs.minor }
        if lhs.patch != rhs.patch { return lhs.patch < rhs.patch }

        switch (lhs.releaseCandidate, rhs.releaseCandidate) {
        case (nil, nil):
            return false
        case (nil, _):
            return false
        case (_, nil):
            return true
        case let (left?, right?):
            return left < right
        }
    }

    /// `dsh web --no-open` was introduced in 0.1.0-rc.8.
    public var supportsNoOpen: Bool {
        self >= DshSemanticVersion.noOpenMinimum
    }

    private static let noOpenMinimum = DshSemanticVersion("0.1.0-rc.8")!
}
