import CryptoKit
import Foundation
import Security

struct StudioAccountStatus: Equatable {
    let configured: Bool
    let locked: Bool
    let mode: String
    let email: String
    let displayName: String

    static let empty = StudioAccountStatus(
        configured: false,
        locked: false,
        mode: "none",
        email: "",
        displayName: ""
    )
}

enum LocalAccountError: LocalizedError {
    case alreadyConfigured
    case invalidEmail
    case invalidDisplayName
    case invalidPassword
    case invalidAccountFile
    case incorrectPassword
    case accountUsesAnotherSignInMethod
    case googleIdentityMismatch
    case invalidGoogleIdentity
    case unavailable(String)

    var errorDescription: String? {
        switch self {
        case .alreadyConfigured:
            "Hồ sơ local đã được cấu hình trên máy này."
        case .invalidEmail:
            "Nhập một địa chỉ email hợp lệ."
        case .invalidDisplayName:
            "Nhập tên hiển thị của anh."
        case .invalidPassword:
            "Mật khẩu cần tối thiểu 10 ký tự."
        case .invalidAccountFile:
            "Không thể đọc hồ sơ local một cách an toàn."
        case .incorrectPassword:
            "Mật khẩu chưa đúng."
        case .accountUsesAnotherSignInMethod:
            "Hồ sơ trên máy này đang dùng phương thức đăng nhập khác."
        case .googleIdentityMismatch:
            "Tài khoản Google này không khớp với hồ sơ đã lưu trên máy."
        case .invalidGoogleIdentity:
            "Google chưa trả về một hồ sơ hợp lệ để đăng nhập."
        case .unavailable(let message):
            message
        }
    }
}

private struct PersistedLocalAccount: Codable {
    let schema: Int
    let mode: String
    let email: String
    let displayName: String
    let salt: String?
    let verifier: String?
    let providerSubject: String?
    let createdAt: Date
}

final class LocalAccountStore {
    private static let accountFileName = "account-v1.json"
    private static let saltLength = 16
    private static let verifierLength = 32
    private static let iterations = 210_000

    private let fileManager: FileManager
    private let accountFile: URL
    private var account: PersistedLocalAccount?
    private var isLocked = false

    init(fileManager: FileManager = .default, directoryURL: URL? = nil) throws {
        self.fileManager = fileManager
        let directory: URL
        if let directoryURL {
            directory = directoryURL
        } else {
            let supportDirectory = try fileManager.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            directory = supportDirectory
                .appendingPathComponent("Yana Studio Native", isDirectory: true)
        }
        try fileManager.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        accountFile = directory.appendingPathComponent(Self.accountFileName, isDirectory: false)

        guard fileManager.fileExists(atPath: accountFile.path) else { return }
        let attributes = try fileManager.attributesOfItem(atPath: accountFile.path)
        guard
            attributes[.type] as? FileAttributeType == .typeRegular,
            let size = attributes[.size] as? NSNumber,
            size.intValue > 0,
            size.intValue <= 64 * 1024
        else {
            throw LocalAccountError.invalidAccountFile
        }

        let data = try Data(contentsOf: accountFile)
        let stored = try JSONDecoder().decode(PersistedLocalAccount.self, from: data)
        guard Self.isValidStoredAccount(stored) else {
            throw LocalAccountError.invalidAccountFile
        }

        account = stored
        isLocked = true
    }

    var status: StudioAccountStatus {
        StudioAccountStatus(
            configured: account != nil,
            locked: isLocked,
            mode: account?.mode ?? "none",
            email: account?.email ?? "",
            displayName: account?.displayName ?? ""
        )
    }

    var storageDirectoryURL: URL {
        accountFile.deletingLastPathComponent()
    }

    func create(displayName: String, email: String, password: String) throws -> StudioAccountStatus {
        guard account == nil else { throw LocalAccountError.alreadyConfigured }
        let normalizedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard Self.isValidEmail(normalizedEmail) else { throw LocalAccountError.invalidEmail }
        guard !normalizedName.isEmpty, normalizedName.count <= 120 else {
            throw LocalAccountError.invalidDisplayName
        }
        guard password.count >= 10, password.count <= 1_024 else {
            throw LocalAccountError.invalidPassword
        }

        let salt = try Self.randomData(length: Self.saltLength)
        let verifier = Self.deriveVerifier(password: password, salt: salt)
        let stored = PersistedLocalAccount(
            schema: 1,
            mode: "local",
            email: normalizedEmail,
            displayName: normalizedName,
            salt: salt.base64EncodedString(),
            verifier: verifier.base64EncodedString(),
            providerSubject: nil,
            createdAt: .now
        )
        try write(stored)
        account = stored
        isLocked = false
        return status
    }

    func unlock(password: String) throws -> StudioAccountStatus {
        guard let account else { throw LocalAccountError.unavailable("Chưa có hồ sơ local để mở khóa.") }
        guard account.mode == "local" else { throw LocalAccountError.accountUsesAnotherSignInMethod }
        guard password.count <= 1_024 else { throw LocalAccountError.incorrectPassword }
        guard
            let encodedSalt = account.salt,
            let encodedVerifier = account.verifier,
            let salt = Data(base64Encoded: encodedSalt),
            let expected = Data(base64Encoded: encodedVerifier)
        else {
            throw LocalAccountError.invalidAccountFile
        }
        let actual = Self.deriveVerifier(password: password, salt: salt)
        guard Self.constantTimeEquals(actual, expected) else {
            throw LocalAccountError.incorrectPassword
        }
        isLocked = false
        return status
    }

    func useGoogle(identity: GoogleIdentity) throws -> StudioAccountStatus {
        let normalizedName = identity.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedEmail = identity.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let subject = identity.subject.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            !subject.isEmpty,
            !normalizedName.isEmpty,
            normalizedName.count <= 120,
            Self.isValidEmail(normalizedEmail)
        else {
            throw LocalAccountError.invalidGoogleIdentity
        }

        if let account {
            guard account.mode == "google" else { throw LocalAccountError.accountUsesAnotherSignInMethod }
            guard account.providerSubject == subject, account.email == normalizedEmail else {
                throw LocalAccountError.googleIdentityMismatch
            }
            isLocked = false
            return status
        }

        let stored = PersistedLocalAccount(
            schema: 2,
            mode: "google",
            email: normalizedEmail,
            displayName: normalizedName,
            salt: nil,
            verifier: nil,
            providerSubject: subject,
            createdAt: .now
        )
        try write(stored)
        account = stored
        isLocked = false
        return status
    }

    func lock() -> StudioAccountStatus {
        if account != nil { isLocked = true }
        return status
    }

    private func write(_ value: PersistedLocalAccount) throws {
        let data = try JSONEncoder().encode(value)
        try data.write(to: accountFile, options: .atomic)
        try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: accountFile.path)
    }

    private static func isValidEmail(_ email: String) -> Bool {
        guard email.count <= 320 else { return false }
        return email.range(
            of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#,
            options: .regularExpression
        ) != nil
    }

    private static func isValidStoredAccount(_ stored: PersistedLocalAccount) -> Bool {
        guard
            Self.isValidEmail(stored.email),
            !stored.displayName.isEmpty,
            stored.displayName.count <= 120
        else {
            return false
        }

        if stored.schema == 1, stored.mode == "local",
           let encodedSalt = stored.salt,
           let encodedVerifier = stored.verifier,
           let salt = Data(base64Encoded: encodedSalt),
           let verifier = Data(base64Encoded: encodedVerifier) {
            return salt.count == Self.saltLength && verifier.count == Self.verifierLength && stored.providerSubject == nil
        }

        return stored.schema == 2
            && stored.mode == "google"
            && !(stored.providerSubject?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
            && stored.salt == nil
            && stored.verifier == nil
    }

    private static func randomData(length: Int) throws -> Data {
        var data = Data(repeating: 0, count: length)
        let status = data.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, length, buffer.baseAddress!)
        }
        guard status == errSecSuccess else {
            throw LocalAccountError.unavailable("Không thể tạo khóa bảo vệ hồ sơ local.")
        }
        return data
    }

    private static func deriveVerifier(password: String, salt: Data) -> Data {
        let passwordKey = SymmetricKey(data: Data(password.utf8))
        var block = salt
        var counter = UInt32(1).bigEndian
        withUnsafeBytes(of: &counter) { block.append(contentsOf: $0) }

        var iteration = Data(HMAC<SHA256>.authenticationCode(for: block, using: passwordKey))
        var result = [UInt8](iteration)
        for _ in 1 ..< iterations {
            iteration = Data(HMAC<SHA256>.authenticationCode(for: iteration, using: passwordKey))
            let bytes = [UInt8](iteration)
            for index in result.indices {
                result[index] ^= bytes[index]
            }
        }
        return Data(result)
    }

    private static func constantTimeEquals(_ left: Data, _ right: Data) -> Bool {
        guard left.count == right.count else { return false }
        var difference: UInt8 = 0
        for (leftByte, rightByte) in zip(left, right) {
            difference |= leftByte ^ rightByte
        }
        return difference == 0
    }
}
