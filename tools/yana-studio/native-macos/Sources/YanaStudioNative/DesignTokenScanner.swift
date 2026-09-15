import Foundation

struct DesignToken: Identifiable, Hashable, Sendable {
    let hex: String
    let relativePath: String
    let line: Int

    var id: String { "\(relativePath):\(line):\(hex)" }
}

enum DesignTokenScannerError: LocalizedError {
    case unreadableProject

    var errorDescription: String? {
        switch self {
        case .unreadableProject:
            "Không thể đọc project để quét màu thiết kế."
        }
    }
}

enum DesignTokenScanner {
    private static let supportedExtensions: Set<String> = [
        "css", "scss", "sass", "less", "html", "htm", "svg", "tsx", "jsx", "ts", "js", "swift",
    ]
    private static let maxFiles = 300
    private static let maxFileBytes = 1_000_000
    private static let colorPattern = try! NSRegularExpression(
        pattern: #"#(?:[A-Fa-f0-9]{8}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{3})(?![A-Fa-f0-9])"#
    )

    static func scan(projectRoot: URL) throws -> [DesignToken] {
        let root = projectRoot.standardizedFileURL
        let options: FileManager.DirectoryEnumerationOptions = [.skipsHiddenFiles, .skipsPackageDescendants]
        guard let enumerator = FileManager.default.enumerator(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey, .isRegularFileKey],
            options: options
        ) else {
            throw DesignTokenScannerError.unreadableProject
        }

        var scannedFiles = 0
        var tokens = Set<DesignToken>()
        while let url = enumerator.nextObject() as? URL, scannedFiles < maxFiles {
            let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey, .isRegularFileKey])
            if values?.isDirectory == true {
                if isSymbolicLink(url) || containsSensitiveComponent(url) {
                    enumerator.skipDescendants()
                }
                continue
            }
            guard values?.isRegularFile == true,
                  !isSymbolicLink(url),
                  !containsSensitiveComponent(url),
                  supportedExtensions.contains(url.pathExtension.lowercased()),
                  let fileSize = values?.fileSize,
                  fileSize > 0,
                  fileSize <= maxFileBytes,
                  let data = try? Data(contentsOf: url, options: .mappedIfSafe),
                  !data.contains(0),
                  let text = String(data: data, encoding: .utf8)
            else {
                continue
            }

            scannedFiles += 1
            let relativePath = relativePath(for: url, within: root)
            tokens.formUnion(extract(from: text, relativePath: relativePath))
        }

        return tokens.sorted { left, right in
            if left.relativePath != right.relativePath {
                return left.relativePath.localizedStandardCompare(right.relativePath) == .orderedAscending
            }
            if left.line != right.line { return left.line < right.line }
            return left.hex < right.hex
        }
    }

    static func extract(from text: String, relativePath: String) -> [DesignToken] {
        let range = NSRange(text.startIndex..., in: text)
        return colorPattern.matches(in: text, range: range).compactMap { match in
            guard let valueRange = Range(match.range, in: text) else { return nil }
            let line = text[..<valueRange.lowerBound].reduce(into: 1) { count, character in
                if character == "\n" { count += 1 }
            }
            return DesignToken(
                hex: String(text[valueRange]).uppercased(),
                relativePath: relativePath,
                line: line
            )
        }
    }

    private static func isSymbolicLink(_ url: URL) -> Bool {
        (try? FileManager.default.destinationOfSymbolicLink(atPath: url.path)) != nil
    }

    private static func relativePath(for url: URL, within root: URL) -> String {
        let fileComponents = url.pathComponents
        let rootComponents = root.pathComponents
        if fileComponents.starts(with: rootComponents) {
            return fileComponents.dropFirst(rootComponents.count).joined(separator: "/")
        }
        if let rootIndex = fileComponents.lastIndex(of: root.lastPathComponent) {
            return fileComponents.dropFirst(rootIndex + 1).joined(separator: "/")
        }
        return url.lastPathComponent
    }

    private static func containsSensitiveComponent(_ url: URL) -> Bool {
        url.pathComponents.contains { component in
            let name = component.lowercased()
            if [".git", ".ssh", ".aws", ".gnupg"].contains(name) { return true }
            if name == ".env" || name.hasPrefix(".env.") { return true }
            return name.range(
                of: #"(^|[._-])(credentials?|secrets?)([._-]|$)|\.(pem|key|p12|pfx)$"#,
                options: .regularExpression
            ) != nil
        }
    }
}
