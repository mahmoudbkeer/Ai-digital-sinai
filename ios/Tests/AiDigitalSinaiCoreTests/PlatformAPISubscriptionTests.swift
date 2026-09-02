import XCTest
@testable import AiDigitalSinaiCore

final class PlatformAPISubscriptionTests: XCTestCase {
    func testSubscriptionAndEntitlementsBuildAuthenticatedRequestsAndParseResponses() async throws {
        SubscriptionURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer subscription-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-tenant-id"), "tenant-subscription")
            let path = try XCTUnwrap(request.url?.path)
            let response = HTTPURLResponse(url: try XCTUnwrap(request.url), statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])
            if path == "/api/platform/subscription" {
                let data = Data(#"{"ok":true,"subscription":{"id":"sub-1","plan_code":"trial","status":"TRIALING","current_period_start":"2026-09-01T00:00:00.000Z","current_period_end":"2026-09-08T00:00:00.000Z","cancel_at_period_end":false,"price_cents":0,"trial_days":7}}"#.utf8)
                return (response!, data)
            }
            XCTAssertEqual(path, "/api/platform/subscription/entitlements")
            let data = Data(#"{"ok":true,"subscription":{"plan_code":"trial","status":"TRIALING","current_period_end":"2026-09-08T00:00:00.000Z","name":"Trial"},"features":[{"feature":"orders.monthly","limit_value":"100"},{"feature":"analytics.read","limit_value":"true"}]}"#.utf8)
            return (response!, data)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SubscriptionURLProtocol.self]
        let api = PlatformAPI(baseURL: URL(string: "https://api.example.test")!, session: URLSession(configuration: configuration))
        api.setAuthSession(AuthSession(token: "subscription-token", tenantID: "tenant-subscription", branchID: nil))

        let (subscriptionResult, subscription) = try await api.subscription()
        let (entitlementResult, entitlements) = try await api.subscriptionEntitlements()

        XCTAssertEqual(subscriptionResult.statusCode, 200)
        XCTAssertEqual(subscription?.id, "sub-1")
        XCTAssertEqual(subscription?.planCode, "trial")
        XCTAssertEqual(subscription?.status, "TRIALING")
        XCTAssertEqual(subscription?.priceCents, 0)
        XCTAssertEqual(subscription?.trialDays, 7)
        XCTAssertEqual(entitlementResult.statusCode, 200)
        XCTAssertEqual(entitlements?.planCode, "trial")
        XCTAssertEqual(entitlements?.status, "TRIALING")
        XCTAssertEqual(entitlements?.features["orders.monthly"], "100")
        XCTAssertEqual(entitlements?.features["analytics.read"], "true")
    }
}

private final class SubscriptionURLProtocol: URLProtocol {
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
