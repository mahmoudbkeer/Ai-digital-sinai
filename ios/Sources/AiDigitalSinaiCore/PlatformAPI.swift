import Foundation

public struct APIResult: Sendable {
    public let statusCode: Int
    public let data: Data
    public init(statusCode: Int, data: Data) {
        self.statusCode = statusCode
        self.data = data
    }
}

public struct AuthSession: Codable, Sendable {
    public let token: String
    public let tenantID: String?
    public let branchID: String?
    public init(token: String, tenantID: String?, branchID: String?) {
        self.token = token
        self.tenantID = tenantID
        self.branchID = branchID
    }
}

public final class PlatformAPI {
    public let baseURL: URL
    private let session: URLSession
    public private(set) var authSession: AuthSession?

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func login(email: String, password: String) async throws -> (APIResult, AuthSession?) {
        try await authenticate(path: "/api/platform/auth/login", body: ["email": email, "password": password])
    }

    public func register(email: String, password: String, displayName: String, tenantName: String) async throws -> (APIResult, AuthSession?) {
        try await authenticate(path: "/api/platform/auth/register", body: [
            "email": email, "password": password, "displayName": displayName, "tenantName": tenantName
        ])
    }

    private func authenticate(path: String, body: [String: String]) async throws -> (APIResult, AuthSession?) {
        var request = URLRequest(url: baseURL.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        let http = response as! HTTPURLResponse
        let result = APIResult(statusCode: http.statusCode, data: data)
        let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        let token = object?["token"] as? String ?? object?["accessToken"] as? String
        let tenant = (object?["tenant"] as? [String: Any])?["id"] as? String ?? object?["tenantId"] as? String
        let branch = (object?["branch"] as? [String: Any])?["id"] as? String ?? object?["branchId"] as? String
        let auth = token.map { AuthSession(token: $0, tenantID: tenant, branchID: branch) }
        if let auth { authSession = auth }
        return result to auth
    }
}
