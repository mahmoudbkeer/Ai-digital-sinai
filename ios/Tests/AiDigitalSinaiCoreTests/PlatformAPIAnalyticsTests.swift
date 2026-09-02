import XCTest
@testable import AiDigitalSinaiCore

final class PlatformAPIAnalyticsTests: XCTestCase {
    func testAnalyticsOverviewBuildsAuthenticatedRequestAndParsesMetrics() async throws {
        AnalyticsURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/api/platform/analytics/overview")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer analytics-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-tenant-id"), "tenant-analytics")
            let response = HTTPURLResponse(url: try XCTUnwrap(request.url), statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])
            let data = Data(#"{"ok":true,"source":"database","asOf":"2026-09-03T00:00:00.000Z","analytics":{"user":{"total":4,"active":3},"business":{"total":2,"active":2},"marketplace":{"products":5,"services":2,"active_ads":1,"orders":7,"bookings":3},"financial":{"payments":6,"authorized_or_captured_cents":12500,"failed_payments":1},"ai":{"requests":8,"tokens":900,"features":2},"platform":{"deliveries":4,"notifications":9,"audit_events":12}}}"#.utf8)
            return (response!, data)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AnalyticsURLProtocol.self]
        let api = PlatformAPI(baseURL: URL(string: "https://api.example.test")!, session: URLSession(configuration: configuration))
        api.setAuthSession(AuthSession(token: "analytics-token", tenantID: "tenant-analytics", branchID: nil))

        let (result, analytics) = try await api.analyticsOverview()

        XCTAssertEqual(result.statusCode, 200)
        XCTAssertEqual(analytics.orders, 7)
        XCTAssertEqual(analytics.deliveries, 4)
        XCTAssertEqual(analytics.notifications, 9)
    }
}

private final class AnalyticsURLProtocol: URLProtocol {
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
