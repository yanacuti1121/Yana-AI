import Foundation
import XCTest
@testable import YanaStudioNative

final class StudioHostProfileTests: XCTestCase {
    func testProcessorLabelUsesFallbackForAnEmptyValue() {
        let profile = makeProfile(processorName: "")

        XCTAssertEqual(profile.processorLabel, "Không xác định")
    }

    func testUptimeLabelFormatsHoursAndMinutes() {
        let profile = makeProfile(uptime: 90 * 60)

        XCTAssertEqual(profile.uptimeLabel, "1 giờ 30 phút")
    }

    func testUptimeLabelFormatsDaysAndHours() {
        let profile = makeProfile(uptime: (2 * 24 * 60 + 3 * 60 + 4) * 60)

        XCTAssertEqual(profile.uptimeLabel, "2 ngày 3 giờ")
    }

    func testRuntimeTaskIncludesOnlyTheSelectedAttachmentContent() {
        let task = makeRuntimeTask(
            message: "Giải thích tệp này",
            attachments: [StudioChatAttachment(relativePath: "src/main.swift", text: "print(\"Yana\")")]
        )

        XCTAssertEqual(task, "[Tệp đính kèm: src/main.swift]\n```\nprint(\"Yana\")\n```\n\nGiải thích tệp này")
    }

    private func makeProfile(processorName: String = "Apple M1", uptime: TimeInterval = 0) -> StudioHostProfile {
        StudioHostProfile(
            hostName: "test-mac",
            hardwareModel: "MacBookAir10,1",
            processorName: processorName,
            architecture: "arm64",
            operatingSystem: "macOS",
            logicalCores: 8,
            physicalCores: 4,
            memoryBytes: 8 * 1_024 * 1_024 * 1_024,
            uptime: uptime
        )
    }
}

final class DesignTokenScannerTests: XCTestCase {
    func testExtractFindsShortAndLongHexColorsWithSourceLines() {
        let tokens = DesignTokenScanner.extract(
            from: "body { color: #ABC; }\n.card { background: #12345678; }",
            relativePath: "styles/theme.css"
        )

        XCTAssertEqual(tokens, [
            DesignToken(hex: "#ABC", relativePath: "styles/theme.css", line: 1),
            DesignToken(hex: "#12345678", relativePath: "styles/theme.css", line: 2),
        ])
    }

    func testScanSkipsFilesWithSensitiveNames() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("yana-design-scanner-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try "body { color: #112233; }".write(
            to: directory.appendingPathComponent("theme.css"),
            atomically: true,
            encoding: .utf8
        )
        try "body { color: #AABBCC; }".write(
            to: directory.appendingPathComponent("secrets.css"),
            atomically: true,
            encoding: .utf8
        )

        let tokens = try DesignTokenScanner.scan(projectRoot: directory)

        XCTAssertEqual(tokens, [DesignToken(hex: "#112233", relativePath: "theme.css", line: 1)])
    }
}
