import XCTest
@testable import AiDigitalSinaiCore

final class PlatformAPIAISearchTests: XCTestCase {
    func testAISearchSendsQueryAndParsesResults() async throws {
        AISearchURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/api/platform/ai/search")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer ai-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-tenant-id"), "tenant-ai")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
            let body: Data
            if let httpBody = request.httpBody {
                body = httpBody
            } else if let stream = request.httpBodyStream {
                stream.open()
                defer { stream.close() }
                var collected = Data()
                var buffer = [UInt8](repeating: 0, count: 1024)
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count <= 0 { break }
                    collected.append(buffer, count: count)
                }
                body = collected
            } else {
                throw AISearchTestError.missingBody
            }
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
            XCTAssertEqual(json["query"], "Coffee product")
            let response = HTTPURLResponse(url: try XCTUnwrap(request.url), statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])
            let data = Data(#"{"ok":true,"engine":"lexical-fallback","providerStatus":"requires-setup","results":[{"document_id":"doc-1","title":"Catalog","source_type":"PRODUCT","source_ref":"product-1","chunk_id":"chunk-1","snippet":"Coffee product knowledge"}]}"#.utf8)
            return (response!, data)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AISearchURLProtocol.self]
        let api = PlatformAPI(baseURL: URL(string: "https://api.example.test")!, session: URLSession(configuration: configuration))
        api.setAuthSession(AuthSession(token: "ai-token", tenantID: "tenant-ai", branchID: nil))

        let (result, searchResults) = try await api.aiSearch(query: "Coffee product")

        XCTAssertEqual(result.statusCode, 200)
        XCTAssertEqual(searchResults.count, 1)
        XCTAssertEqual(searchResults[0].documentID, "doc-1")
        XCTAssertEqual(searchResults[0].title, "Catalog")
        XCTAssertEqual(searchResults[0].sourceType, "PRODUCT")
        XCTAssertEqual(searchResults[0].sourceRef, "product-1")
        XCTAssertEqual(searchResults[0].chunkID, "chunk-1")
        XCTAssertEqual(searchResults[0].snippet, "Coffee product knowledge")
    }
}

private enum AISearchTestError: Error {
    case missingBody
}

private final class AISearchURLProtocol: URLProtocol {
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
