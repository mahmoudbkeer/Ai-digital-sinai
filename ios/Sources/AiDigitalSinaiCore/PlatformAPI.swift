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

public typealias ProductDetail = MarketplaceProduct

public struct PlatformNotification: Decodable, Sendable, Identifiable {
    public let id: String
    public let userID: String
    public let channel: String
    public let title: String
    public let body: String
    public let status: String
    public let createdAt: Int64
    enum CodingKeys: String, CodingKey {
        case id, userID = "user_id", channel, title, body, status
        case createdAt = "created_at"
    }
}

public struct CartItem: Decodable, Sendable, Identifiable {
    public let id: String
    public let productID: String
    public let sku: String
    public let name: String
    public let quantity: Int
    public let unitPriceCents: Int
    public let lineTotalCents: Int
    enum CodingKeys: String, CodingKey {
        case id, productID = "product_id", sku, name, quantity
        case unitPriceCents = "unit_price_cents", lineTotalCents = "line_total_cents"
    }
}

public struct Cart: Decodable, Sendable {
    public let id: String?
    public let branchID: String?
    public let items: [CartItem]
    public let totalCents: Int
    enum CodingKeys: String, CodingKey {
        case id, branchID = "branch_id", items
        case totalCents = "totalCents"
    }

    public init(id: String?, branchID: String?, items: [CartItem], totalCents: Int) {
        self.id = id
        self.branchID = branchID
        self.items = items
        self.totalCents = totalCents
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id)
        branchID = try container.decodeIfPresent(String.self, forKey: .branchID)
        items = try container.decodeIfPresent([CartItem].self, forKey: .items) ?? []
        totalCents = try container.decodeIfPresent(Int.self, forKey: .totalCents) ?? 0
    }
}

public struct CheckoutResult: Decodable, Sendable {
    public let orderID: String
    public let state: String
    public let totalCents: Int?
    enum CodingKeys: String, CodingKey {
        case orderID = "orderId", state, totalCents
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

private struct ProductDetailEnvelope: Decodable {
    let product: ProductDetail
}

private struct NotificationEnvelope: Decodable {
    let notifications: [PlatformNotification]
}

private struct CartEnvelope: Decodable {
    let cart: Cart?
    let items: [CartItem]
    let totalCents: Int
}

private struct CheckoutEnvelope: Decodable {
    let orderId: String
    let state: String
    let totalCents: Int?
}

public final class PlatformAPI {
    public let baseURL: URL
    private let session: URLSession
    public private(set) var authSession: AuthSession?

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func setAuthSession(_ session: AuthSession) {
        authSession = session
    }

    public func login(email: String, password: String) async throws -> (APIResult, AuthSession?) {
        try await authenticate(path: "/api/platform/auth/login", body: ["email": email, "password": password])
    }

    public func register(email: String, password: String, displayName: String, tenantName: String) async throws -> (APIResult, AuthSession?) {
        try await authenticate(path: "/api/platform/auth/register", body: [
            "email": email, "password": password, "displayName": displayName, "tenantName": tenantName
        ])
    }

    public func notifications() async throws -> (APIResult, [PlatformNotification]) {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/platform/notifications"))
        request.httpMethod = "GET"
        applyAuth(to: &request)
        let (data, response) = try await session.data(for: request)
        let http = response as! HTTPURLResponse
        let result = APIResult(statusCode: http.statusCode, data: data)
        let envelope = try JSONDecoder().decode(NotificationEnvelope.self, from: data)
        return (result, envelope.notifications)
    }

    public func cart() async throws -> (APIResult, Cart) {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/platform/cart"))
        request.httpMethod = "GET"
        applyAuth(to: &request)
        let (data, response) = try await session.data(for: request)
        let http = response as! HTTPURLResponse
        let result = APIResult(statusCode: http.statusCode, data: data)
        let envelope = try JSONDecoder().decode(CartEnvelope.self, from: data)
        let nested = envelope.cart
        let cart = Cart(
            id: nested?.id,
            branchID: nested?.branchID,
            items: nested?.items.isEmpty == false ? nested!.items : envelope.items,
            totalCents: (nested?.totalCents ?? 0) > 0 ? (nested?.totalCents ?? 0) : envelope.totalCents
        )
        return (result, cart)
    }

    public func addCartItem(productId: String, quantity: Int, branchId: String? = nil) async throws -> (APIResult, String?) {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/platform/cart/items"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuth(to: &request)
        var body: [String: Any] = ["productId": productId, "quantity": quantity]
        if let branchId { body["branchId"] = branchId }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        let http = response as! HTTPURLResponse
        let result = APIResult(statusCode: http.statusCode, data: data)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return (result, object?["cartId"] as? String)
    }

    public func checkout(branchId: String) async throws -> (APIResult, CheckoutResult) {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/platform/cart/checkout"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyAuth(to: &request)
        request.httpBody = try JSONSerialization.data(withJSONObject: ["branchId": branchId])
        let (data, response) = try await session.data(for: request)
        let http = response as! HTTPURLResponse
        let result = APIResult(statusCode: http.statusCode, data: data)
        let envelope = try JSONDecoder().decode(CheckoutEnvelope.self, from: data)
        return (result, CheckoutResult(orderID: envelope.orderId, state: envelope.state, totalCents: envelope.totalCents))
    }

    public func productDetail(productId: String) async throws -> (APIResult, ProductDetail) {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/platform/products/\(productId)"))
        request.httpMethod = "GET"
        applyAuth(to: &request)
        let (data, response) = try await session.data(for: request)
        let http = response as! HTTPURLResponse
        let result = APIResult(statusCode: http.statusCode, data: data)
        let envelope = try JSONDecoder().decode(ProductDetailEnvelope.self, from: data)
        return (result, envelope.product)
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
