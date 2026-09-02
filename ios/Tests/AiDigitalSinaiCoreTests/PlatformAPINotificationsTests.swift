import XCTest
@testable import AiDigitalSinaiCore

final class PlatformAPINotificationsTests: XCTestCase {
    func testNotificationsBuildsAuthenticatedRequestAndParsesChannelStatus() async throws {
        NotificationsURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/api/platform/notifications")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer notifications-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-tenant-id"), "tenant-notifications")
            let response = HTTPURLResponse(url: try XCTUnwrap(request.url), statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])
            let data = Data(#"{"ok":true,"notifications":[{"id":"n-1","user_id":"u-1","channel":"IN_APP","title":"Order delivered","body":"Your order arrived","status":"DELIVERED","created_at":1730000000000}]}"#.utf8)
            return (response!, data)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [NotificationsURLProtocol.self]
        let api = PlatformAPI(baseURL: URL(string: "https://api.example.test")!, session: URLSession(configuration: configuration))
        api.setAuthSession(AuthSession(token: "notifications-token", tenantID: "tenant-notifications", branchID: nil))

        let (result, notifications) = try await api.notifications()

        XCTAssertEqual(result.statusCode, 200)
        XCTAssertEqual(notifications.count, 1)
        XCTAssertEqual(notifications[0].id, "n-1")
        XCTAssertEqual(notifications[0].userID, "u-1")
        XCTAssertEqual(notifications[0].channel, "IN_APP")
        XCTAssertEqual(notifications[0].status, "DELIVERED")
        XCTAssertEqual(notifications[0].title, "Order delivered")
        XCTAssertEqual(notifications[0].body, "Your order arrived")
        XCTAssertEqual(notifications[0].createdAt, 1730000000000)
    }
}

private final class NotificationsURLProtocol: URLProtocol {
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
