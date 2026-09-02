import XCTest
@testable import AiDigitalSinaiCore

final class PlatformAPIProductDetailTests: XCTestCase {
    func testProductDetailBuildsAuthenticatedRequestAndParsesAllFields() async throws {
        ProductDetailURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/api/platform/products/p-42")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer detail-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-tenant-id"), "tenant-detail")
            let response = HTTPURLResponse(url: try XCTUnwrap(request.url), statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])
            let data = Data(#"{"ok":true,"product":{"id":"p-42","business_id":"b-42","sku":"SKU-42","name":"Sinai Date Box","description":"Premium dates","category":"Food","price_cents":2750,"currency":"EGP","status":"active","created_at":1730000000000,"updated_at":1730000001000}}"#.utf8)
            return (response!, data)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ProductDetailURLProtocol.self]
        let api = PlatformAPI(baseURL: URL(string: "https://api.example.test")!, session: URLSession(configuration: configuration))
        api.setAuthSession(AuthSession(token: "detail-token", tenantID: "tenant-detail", branchID: nil))

        let (result, product) = try await api.productDetail(productId: "p-42")

        XCTAssertEqual(result.statusCode, 200)
        XCTAssertEqual(product.id, "p-42")
        XCTAssertEqual(product.businessID, "b-42")
        XCTAssertEqual(product.sku, "SKU-42")
        XCTAssertEqual(product.name, "Sinai Date Box")
        XCTAssertEqual(product.description, "Premium dates")
        XCTAssertEqual(product.category, "Food")
        XCTAssertEqual(product.priceCents, 2750)
        XCTAssertEqual(product.currency, "EGP")
        XCTAssertEqual(product.status, "active")
        XCTAssertEqual(product.createdAt, 1730000000000)
        XCTAssertEqual(product.updatedAt, 1730000001000)
    }
}

private final class ProductDetailURLProtocol: URLProtocol {
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
