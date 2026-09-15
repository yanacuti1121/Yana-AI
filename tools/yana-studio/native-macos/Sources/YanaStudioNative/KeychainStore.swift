import Foundation
import Security

enum KeychainStoreError: LocalizedError {
    case failed(OSStatus)

    var errorDescription: String? {
        switch self {
        case .failed(let status):
            let detail = SecCopyErrorMessageString(status, nil) as String? ?? "mã lỗi \(status)"
            return "Keychain macOS không phản hồi: \(detail)."
        }
    }
}

enum KeychainStore {
    private static let service = "link.vutam.yana-studio-native"

    static func read(account: String) throws -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw KeychainStoreError.failed(status)
        }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ secret: String, account: String) throws {
        let data = Data(secret.utf8)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
        ]
        let update: [CFString: Any] = [kSecValueData: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw KeychainStoreError.failed(updateStatus)
        }

        var item = query
        item[kSecValueData] = data
        item[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw KeychainStoreError.failed(addStatus) }
    }

    static func delete(account: String) throws {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainStoreError.failed(status)
        }
    }
}
