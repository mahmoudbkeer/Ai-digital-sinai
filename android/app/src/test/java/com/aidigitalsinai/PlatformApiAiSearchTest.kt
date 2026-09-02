package com.aidigitalsinai

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class PlatformApiAiSearchTest {
    private lateinit var server: MockWebServer
    private lateinit var api: PlatformApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = PlatformApi(server.url("/").toString().trimEnd('/'), FakeSession("ai-token", "tenant-ai"))
    }

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun aiSearchSendsQueryAndParsesResults() {
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(
            """{"ok":true,"engine":"lexical-fallback","providerStatus":"requires-setup","results":[{"document_id":"doc-1","title":"Catalog","source_type":"PRODUCT","source_ref":"product-1","chunk_id":"chunk-1","snippet":"Coffee product knowledge"}]}"""
        ))

        val (result, results) = api.aiSearch("Coffee product")
        val request = server.takeRequest()
        val body = request.body.readUtf8()

        assertEquals(200, result.status)
        assertEquals("POST", request.method)
        assertEquals("/api/platform/ai/search", request.path)
        assertEquals("Bearer ai-token", request.getHeader("Authorization"))
        assertEquals("tenant-ai", request.getHeader("x-tenant-id"))
        assertTrue(body.contains("\"query\":\"Coffee product\""))
        assertEquals(1, results.size)
        assertEquals("doc-1", results.single().documentId)
        assertEquals("Catalog", results.single().title)
        assertEquals("Coffee product knowledge", results.single().snippet)
    }

    private class FakeSession(
        override var token: String?,
        override var tenantId: String?,
        override var branchId: String? = null
    ) : SessionStoreContract
}
