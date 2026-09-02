package com.aidigitalsinai

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test

class PlatformApiProductsTest {
    private lateinit var server: MockWebServer
    private lateinit var session: FakeSession
    private lateinit var api: PlatformApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        session = FakeSession("test-bearer-token", "tenant-test-123")
        api = PlatformApi(server.url("/").toString().trimEnd('/'), session)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun productsBuildsAuthenticatedRequestAndParsesResponse() {
        server.enqueue(MockResponse()
            .setResponseCode(200)
            .setHeader("Content-Type", "application/json")
            .setBody("""{"ok":true,"products":[{"id":"product-1","name":"Android Marketplace Product","description":"served by mock HTTP server","category":"local","price_cents":1250,"currency":"EGP","status":"active"}]}"""))

        val (result, products) = api.products()
        val request = server.takeRequest()

        assertEquals(200, result.status)
        assertEquals("GET", request.method)
        assertEquals("/api/platform/products", request.path)
        assertEquals("Bearer test-bearer-token", request.getHeader("Authorization"))
        assertEquals("tenant-test-123", request.getHeader("x-tenant-id"))
        assertEquals(1, products.size)
        assertEquals("product-1", products.single().id)
        assertEquals("Android Marketplace Product", products.single().name)
        assertEquals(1250, products.single().priceCents)
        assertEquals("EGP", products.single().currency)
        assertNotNull(products.single().description)
    }

    private class FakeSession(
        override var token: String?,
        override var tenantId: String?,
        override var branchId: String? = null
    ) : SessionStoreContract
}
