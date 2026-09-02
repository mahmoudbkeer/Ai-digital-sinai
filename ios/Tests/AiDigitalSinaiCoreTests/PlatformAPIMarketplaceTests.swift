import XCTest
@testable import AiDigitalSinaiCore

final class PlatformAPIMarketplaceTests: XCTestCase {
    func testProductsBuildsAuthenticatedRequestAndParsesListing() async throws {
        MarketplaceURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/api/platform/products")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer marketplace-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-tenant-id"), "tenant-marketplace")
            let response = HTTPURLResponse(url: try XCTUnwrap(request.url), statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])
            let data = Data(#"{"ok":true,"products":[{"id":"p-1","business_id":"b-1","sku":"SKU-1","name":"Sinai Coffee","description":"Fresh coffee","category":"Beverages","price_cents":1250,"currency":"EGP","status":"active","created_at":1730000000000,"updated_at":1730000001000}]}"#.utf8)
            return (response!, data)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MarketplaceURLProtocol.self]
        let api = PlatformAPI(baseURL: URL(string: "https://api.example.test")!, session: URLSession(configuration: configuration))
        api.setAuthSession(AuthSession(token: "marketplace-token", tenantID: "tenant-marketplace", branchID: nil))

        let (result, products) = try await api.products()

        XCTAssertEqual(result.statusCode, 200)
        XCTAssertEqual(products.count, 1)
        XCTAssertEqual(products[0].id, "p-1")
        XCTAssertEqual(products[0].businessID, "b-1")
        XCTAssertEqual(products[0].sku, "SKU-1")
        XCTAssertEqual(products[0].name, "Sinai Coffee")
        XCTAssertEqual(products[0].description, "Fresh coffee")
        XCTAssertEqual(products[0].category, "Beverages")
        XCTAssertEqual(products[0].priceCents, 1250)
        XCTAssertEqual(products[0].currency, "EGP")
        XCTAssertEqual(products[0].status, "active")
        XCTAssertEqual(products[0].createdAt, 1730000000000)
        XCTAssertEqual(products[0].updatedAt, 1730000001000)
    }
}

private final class MarketplaceURLProtocol: URLProtocol {
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
