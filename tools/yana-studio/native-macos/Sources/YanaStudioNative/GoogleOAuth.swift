import AppKit
import CryptoKit
import Foundation
import Network
import Security

struct GoogleIdentity: Equatable, Sendable {
    let subject: String
    let email: String
    let displayName: String
}

enum GoogleOAuthError: LocalizedError {
    case missingClientID
    case unavailable(String)
    case authorizationDenied(String)
    case invalidCallback
    case stateMismatch
    case tokenExchangeFailed(String)
    case invalidProfile

    var errorDescription: String? {
        switch self {
        case .missingClientID:
            "Chưa cấu hình Google Client ID cho Yana Studio."
        case .unavailable(let message):
            message
        case .authorizationDenied(let reason):
            "Google chưa cấp quyền đăng nhập. \(reason)"
        case .invalidCallback:
            "Không đọc được phản hồi đăng nhập từ Google."
        case .stateMismatch:
            "Phiên đăng nhập Google không khớp. Hãy thử lại."
        case .tokenExchangeFailed(let detail):
            "Google không xác nhận được phiên đăng nhập này. \(detail)"
        case .invalidProfile:
            "Google chưa trả về tên và email đã xác minh."
        }
    }
}

enum GoogleOAuthPKCE {
    static func makeVerifier() throws -> String {
        let length = 32
        var bytes = Data(repeating: 0, count: length)
        let status = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, length, buffer.baseAddress!)
        }
        guard status == errSecSuccess else {
            throw GoogleOAuthError.unavailable("Không thể tạo phiên đăng nhập Google an toàn.")
        }
        return base64URL(bytes)
    }

    static func challenge(for verifier: String) -> String {
        base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

@MainActor
enum GoogleOAuthSignIn {
    private static let authorizationEndpoint = URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!
    private static let tokenEndpoint = URL(string: "https://oauth2.googleapis.com/token")!
    private static let profileEndpoint = URL(string: "https://openidconnect.googleapis.com/v1/userinfo")!

    static var isConfigured: Bool {
        clientID != nil
    }

    static func authenticate() async throws -> GoogleIdentity {
        guard let clientID else {
            NSLog("[oauth:google] stage=failed reason=missing_client_id")
            throw GoogleOAuthError.missingClientID
        }

        let verifier = try GoogleOAuthPKCE.makeVerifier()
        let state = try GoogleOAuthPKCE.makeVerifier()
        let callbackServer = GoogleLoopbackCallbackServer()
        let redirectURL = try await callbackServer.start()
        let authorizationURL = try makeAuthorizationURL(
            clientID: clientID,
            redirectURL: redirectURL,
            verifier: verifier,
            state: state
        )
        NSLog("[oauth:google] stage=authorize redirect_uri=\(redirectURL.absoluteString) client_id=\(clientID) has_secret=\(clientSecret != nil)")

        guard NSWorkspace.shared.open(authorizationURL) else {
            NSLog("[oauth:google] stage=failed reason=browser_open_failed")
            throw GoogleOAuthError.unavailable("Không thể mở trình duyệt để đăng nhập Google.")
        }

        NSLog("[oauth:google] stage=callback waiting for browser redirect")
        let callback = try await callbackServer.waitForCallback()
        guard callback.state == state else {
            NSLog("[oauth:google] stage=failed reason=state_mismatch")
            throw GoogleOAuthError.stateMismatch
        }
        if let error = callback.error {
            NSLog("[oauth:google] stage=failed reason=authorization_denied error=\(error)")
            throw GoogleOAuthError.authorizationDenied(callback.errorDescription ?? error)
        }
        guard let code = callback.code, !code.isEmpty else {
            NSLog("[oauth:google] stage=failed reason=invalid_callback")
            throw GoogleOAuthError.invalidCallback
        }
        NSLog("[oauth:google] stage=code_received length=\(code.count)")

        let accessToken = try await exchangeCode(
            code,
            clientID: clientID,
            clientSecret: clientSecret,
            verifier: verifier,
            redirectURL: redirectURL
        )
        NSLog("[oauth:google] stage=token_exchange ok")
        let identity = try await loadIdentity(accessToken: accessToken)
        NSLog("[oauth:google] stage=identity ok")
        return identity
    }

    private static var clientID: String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "GoogleOAuthClientID") as? String else {
            return nil
        }
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? nil : normalized
    }

    // Google's token endpoint rejects a Desktop-app token exchange with
    // "invalid_request: client_secret is missing" even with a correct PKCE
    // code_verifier -- confirmed live against this same Client ID on the
    // Electron build (every stage up through code_received succeeded, only
    // exchange failed on this). Google's own native-app guide includes
    // client_secret in the Desktop-app token request; unlike a Web-
    // application secret, this one isn't meant to stay confidential, since
    // Desktop clients ship it in distributed source. It still isn't
    // committed to this repo (GitHub's push protection rejects that
    // regardless of Google's own stance) -- scripts/build-app.sh injects it
    // into the built .app's Info.plist from YANA_GOOGLE_CLIENT_SECRET at
    // build time, never into the tracked source file.
    private static var clientSecret: String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "GoogleOAuthClientSecret") as? String else {
            return nil
        }
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? nil : normalized
    }

    private static func makeAuthorizationURL(
        clientID: String,
        redirectURL: URL,
        verifier: String,
        state: String
    ) throws -> URL {
        var components = URLComponents(url: authorizationEndpoint, resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURL.absoluteString),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: GoogleOAuthPKCE.challenge(for: verifier)),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
        ]
        guard let url = components?.url else {
            throw GoogleOAuthError.unavailable("Không thể tạo yêu cầu đăng nhập Google.")
        }
        return url
    }

    private static func exchangeCode(
        _ code: String,
        clientID: String,
        clientSecret: String?,
        verifier: String,
        redirectURL: URL
    ) async throws -> String {
        var request = URLRequest(url: tokenEndpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var fields = [
            ("code", code),
            ("client_id", clientID),
            ("code_verifier", verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirectURL.absoluteString),
        ]
        if let clientSecret {
            fields.append(("client_secret", clientSecret))
        }
        request.httpBody = formData(fields)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ... 299).contains(http.statusCode) else {
            throw tokenExchangeError(data: data, response: response)
        }
        let token = try JSONDecoder().decode(GoogleTokenResponse.self, from: data)
        guard !token.accessToken.isEmpty else {
            throw GoogleOAuthError.tokenExchangeFailed("Google không trả về access token.")
        }
        return token.accessToken
    }

    private static func tokenExchangeError(data: Data, response: URLResponse) -> GoogleOAuthError {
        let status = (response as? HTTPURLResponse)?.statusCode
        let failure = try? JSONDecoder().decode(GoogleOAuthFailure.self, from: data)
        let code = failure?.error ?? "unknown"
        NSLog("[oauth:google] stage=token_exchange status=\(status ?? 0) error=\(code) description=\(failure?.errorDescription ?? "")")
        switch code {
        case "invalid_client", "unauthorized_client":
            return .tokenExchangeFailed("Client ID chưa được Google chấp nhận cho ứng dụng Desktop.")
        case "invalid_request":
            return .tokenExchangeFailed("Google báo invalid_request (\(failure?.errorDescription ?? "không rõ chi tiết")).")
        case "invalid_grant":
            return .tokenExchangeFailed("Mã đăng nhập đã hết hạn hoặc đã dùng; hãy bấm Google và đăng nhập lại một lần.")
        default:
            let label = status.map { "HTTP \($0)" } ?? "lỗi mạng"
            return .tokenExchangeFailed("Google trả về \(label) (\(code)).")
        }
    }

    private static func loadIdentity(accessToken: String) async throws -> GoogleIdentity {
        var request = URLRequest(url: profileEndpoint)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ... 299).contains(http.statusCode) else {
            throw GoogleOAuthError.invalidProfile
        }
        let profile = try JSONDecoder().decode(GoogleProfile.self, from: data)
        guard profile.emailVerified else { throw GoogleOAuthError.invalidProfile }
        let displayName = profile.name?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            !profile.subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            !profile.email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            let displayName,
            !displayName.isEmpty
        else {
            throw GoogleOAuthError.invalidProfile
        }
        return GoogleIdentity(subject: profile.subject, email: profile.email, displayName: displayName)
    }

    private static func formData(_ values: [(String, String)]) -> Data? {
        var components = URLComponents()
        components.queryItems = values.map { URLQueryItem(name: $0.0, value: $0.1) }
        return components.percentEncodedQuery.map { Data($0.utf8) }
    }
}

private struct GoogleTokenResponse: Decodable {
    let accessToken: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
    }
}

private struct GoogleOAuthFailure: Decodable {
    let error: String
    let errorDescription: String?

    enum CodingKeys: String, CodingKey {
        case error
        case errorDescription = "error_description"
    }
}

private struct GoogleProfile: Decodable {
    let subject: String
    let email: String
    let emailVerified: Bool
    let name: String?

    enum CodingKeys: String, CodingKey {
        case subject = "sub"
        case email
        case emailVerified = "email_verified"
        case name
    }
}

private struct GoogleOAuthCallback {
    let code: String?
    let state: String?
    let error: String?
    let errorDescription: String?
}

private final class GoogleLoopbackCallbackServer: @unchecked Sendable {
    private let lock = NSLock()
    private let queue = DispatchQueue(label: "com.yana-ai.studio.google-oauth")
    private var listener: NWListener?
    private var startupContinuation: CheckedContinuation<URL, Error>?
    private var callbackContinuation: CheckedContinuation<GoogleOAuthCallback, Error>?
    private var startupResult: Result<URL, Error>?
    private var callbackResult: Result<GoogleOAuthCallback, Error>?

    deinit {
        listener?.cancel()
    }

    func start() async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            if let startupResult {
                lock.unlock()
                continuation.resume(with: startupResult)
                return
            }
            startupContinuation = continuation
            lock.unlock()

            do {
                let listener = try NWListener(using: .tcp)
                listener.stateUpdateHandler = { [weak self] state in
                    self?.handleListenerState(state)
                }
                listener.newConnectionHandler = { [weak self, queue] connection in
                    connection.start(queue: queue)
                    self?.receive(connection)
                }
                lock.lock()
                self.listener = listener
                lock.unlock()
                listener.start(queue: queue)
            } catch {
                resolveStartup(.failure(error))
                resolveCallback(.failure(error))
            }
        }
    }

    func waitForCallback() async throws -> GoogleOAuthCallback {
        try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            if let callbackResult {
                lock.unlock()
                continuation.resume(with: callbackResult)
                return
            }
            callbackContinuation = continuation
            lock.unlock()
        }
    }

    private func handleListenerState(_ state: NWListener.State) {
        switch state {
        case .ready:
            lock.lock()
            let port = listener?.port?.rawValue
            lock.unlock()
            guard let port else {
                let error = GoogleOAuthError.unavailable("Không thể mở cổng nhận phản hồi từ Google.")
                resolveStartup(.failure(error))
                resolveCallback(.failure(error))
                return
            }
            guard let url = URL(string: "http://127.0.0.1:\(port)/oauth2callback") else {
                let error = GoogleOAuthError.unavailable("Không thể tạo địa chỉ nhận phản hồi Google.")
                resolveStartup(.failure(error))
                resolveCallback(.failure(error))
                return
            }
            resolveStartup(.success(url))
        case .failed(let error):
            resolveStartup(.failure(error))
            resolveCallback(.failure(error))
        case .cancelled:
            resolveCallback(.failure(GoogleOAuthError.unavailable("Đã hủy phiên đăng nhập Google.")))
        default:
            break
        }
    }

    private func receive(_ connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1_024) { [weak self] data, _, _, error in
            guard let self else { return }
            if let error {
                self.respond(on: connection, title: "Không thể nhận phản hồi", detail: "Yana không nhận được phản hồi đăng nhập từ Google.")
                self.resolveCallback(.failure(error))
                return
            }
            guard let data else {
                self.respond(on: connection, title: "Phản hồi không hợp lệ", detail: "Hãy quay lại Yana Studio và thử lại.")
                self.resolveCallback(.failure(GoogleOAuthError.invalidCallback))
                return
            }
            self.handleRequest(data, on: connection)
        }
    }

    private func handleRequest(_ data: Data, on connection: NWConnection) {
        guard
            let request = String(data: data, encoding: .utf8),
            let firstLine = request.components(separatedBy: "\r\n").first
        else {
            respond(on: connection, title: "Phản hồi không hợp lệ", detail: "Hãy quay lại Yana Studio và thử lại.")
            resolveCallback(.failure(GoogleOAuthError.invalidCallback))
            return
        }
        let pieces = firstLine.split(separator: " ", maxSplits: 2)
        guard pieces.count >= 2, pieces[0] == "GET", let components = URLComponents(string: "http://127.0.0.1\(pieces[1])"), components.path == "/oauth2callback" else {
            respond(on: connection, title: "Đường dẫn không hợp lệ", detail: "Hãy quay lại Yana Studio và thử lại.")
            resolveCallback(.failure(GoogleOAuthError.invalidCallback))
            return
        }
        let items = components.queryItems ?? []
        let value = { (name: String) in items.first(where: { $0.name == name })?.value }
        let callback = GoogleOAuthCallback(
            code: value("code"),
            state: value("state"),
            error: value("error"),
            errorDescription: value("error_description")
        )
        let accepted = callback.error == nil && callback.code != nil
        respond(
            on: connection,
            title: accepted ? "Đã nhận đăng nhập" : "Đăng nhập chưa hoàn tất",
            detail: accepted ? "Anh có thể đóng trang này và quay lại Yana Studio." : "Hãy quay lại Yana Studio để xem thông báo và thử lại."
        )
        resolveCallback(.success(callback))
    }

    private func respond(on connection: NWConnection, title: String, detail: String) {
        let body = "<!doctype html><html lang=\"vi\"><meta charset=\"utf-8\"><title>Yana Studio</title><body style=\"font-family:-apple-system;padding:48px;color:#171729\"><h1>\(title)</h1><p>\(detail)</p></body></html>"
        let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"
        connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func resolveStartup(_ result: Result<URL, Error>) {
        lock.lock()
        guard startupResult == nil else {
            lock.unlock()
            return
        }
        startupResult = result
        let continuation = startupContinuation
        startupContinuation = nil
        lock.unlock()
        continuation?.resume(with: result)
    }

    private func resolveCallback(_ result: Result<GoogleOAuthCallback, Error>) {
        lock.lock()
        guard callbackResult == nil else {
            lock.unlock()
            return
        }
        callbackResult = result
        let continuation = callbackContinuation
        callbackContinuation = nil
        let listener = listener
        self.listener = nil
        lock.unlock()
        continuation?.resume(with: result)
        listener?.cancel()
    }
}
