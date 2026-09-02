import Foundation

public struct APIResult: Sendable {
    public let statusCode: Int
    public let data: Data
    public init(statusCode: Int, data: Data) {
        self.statusCode = statusCode
        self.data = data
    }
}

public struct MarketplaceProduct: Decodable, Sendable, Identifiable {
    public let id: String
    public let businessID: String
    public let sku: String
    public let name: String
    public let description: String?
    public let category: String?
    public let priceCents: Int
    public let currency: String
    public let status: String
    public let createdAt: Int64
    public let updatedAt: Int64

    enum CodingKeys: String, CodingKey {
        case id, businessID = "business_id", sku, name, description, category
        case priceCents = "price_cents", currency, status
        case createdAt = "created_at", updatedAt = "updated_at"
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

private struct ProductEnvelope: Decodable {
    let products: [MarketplaceProduct]
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

    public func products() async throws -> (APIResult, [MarketplaceProduct]) {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/platform/products"))
        request.httpMethod = "GET"
        applyAuth(to: &request)
        let (data, response) = try await session.data(for: request)
        let http = response as! HTTPURLResponse
        let result = APIResult(statusCode: http.statusCode, data: data)
        let envelope = try JSONDecoder().decode(ProductEnvelope.self, from: data)
        return (result, envelope.products)
    }

    private func applyAuth(to request: inout URLRequest) {
        if let authSession {
            request.setValue("Bearer \(authSession.token)", forHTTPHeaderField: "Authorization")
            if let tenantID = authSession.tenantID {
                request.setValue(tenantID, forHTTPHeaderField: "x-tenant-id")
            }
        }
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
        return (result, auth)
    }
}
