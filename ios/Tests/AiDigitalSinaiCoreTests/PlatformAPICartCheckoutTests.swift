import XCTest
@testable import AiDigitalSinaiCore

final class PlatformAPICartCheckoutTests: XCTestCase {
    func testCartAddItemAndCheckoutUseAuthenticatedPlatformContracts() async throws {
        CartCheckoutURLProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer cart-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-tenant-id"), "tenant-cart")
            let path = try XCTUnwrap(request.url?.path)
            switch (request.httpMethod, path) {
            case ("GET", "/api/platform/cart"):
                let response = HTTPURLResponse(url: try XCTUnwrap(request.url), statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])
                let data = Data(#"{"ok":true,"cart":{"id":"cart-1","branch_id":"branch-1"},"items":[{"id":"item-1","product_id":"p-1","sku":"SKU-1","name":"Sinai Coffee","quantity":2,"unit_price_cents":1250,"line_total_cents":2500}],"totalCents":2500}"#.utf8)
                return (response!, data)
            case ("POST", "/api/platform/cart/items"):
                XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
                let body = try XCTUnwrap(request.httpBody ?? PlatformAPICartCheckoutTests.readBodyStream(request.httpBodyStream))
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["productId"] as? String, "p-1")
                XCTAssertEqual(json["quantity"] as? Int, 2)
                XCTAssertEqual(json["branchId"] as? String, "branch-1")
                let response = HTTPURLResponse(url: try XCTUnwrap(request.url), statusCode: 201, httpVersion: nil, headerFields: nil)
                return (response!, Data(#"{"ok":true,"cartId":"cart-1"}"#.utf8))
            case ("POST", "/api/platform/cart/checkout"):
                XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
                let body = try XCTUnwrap(request.httpBody ?? PlatformAPICartCheckoutTests.readBodyStream(request.httpBodyStream))
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["branchId"] as? String, "branch-1")
                let response = HTTPURLResponse(url: try XCTUnwrap(request.url), statusCode: 201, httpVersion: nil, headerFields: nil)
                return (response!, Data(#"{"ok":true,"orderId":"order-1","state":"PENDING","totalCents":2500}"#.utf8))
            default:
                throw NSError(domain: "UnexpectedRequest", code: 1)
            }
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CartCheckoutURLProtocol.self]
        let api = PlatformAPI(baseURL: URL(string: "https://api.example.test")!, session: URLSession(configuration: configuration))
        api.setAuthSession(AuthSession(token: "cart-token", tenantID: "tenant-cart", branchID: "branch-1"))

        let (cartResult, cart) = try await api.cart()
        let (addResult, cartId) = try await api.addCartItem(productId: "p-1", quantity: 2, branchId: "branch-1")
        let (checkoutResult, order) = try await api.checkout(branchId: "branch-1")

        XCTAssertEqual(cartResult.statusCode, 200)
        XCTAssertEqual(cart.id, "cart-1")
        XCTAssertEqual(cart.branchID, "branch-1")
        XCTAssertEqual(cart.items[0].lineTotalCents, 2500)
        XCTAssertEqual(cart.totalCents, 2500)
        XCTAssertEqual(addResult.statusCode, 201)
        XCTAssertEqual(cartId, "cart-1")
        XCTAssertEqual(checkoutResult.statusCode, 201)
        XCTAssertEqual(order.orderID, "order-1")
        XCTAssertEqual(order.state, "PENDING")
        XCTAssertEqual(order.totalCents, 2500)
    }

    private static func readBodyStream(_ stream: InputStream?) throws -> Data {
        let stream = try XCTUnwrap(stream)
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

private final class CartCheckoutURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (response, data) = try Self.handler!(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
