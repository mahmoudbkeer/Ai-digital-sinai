package com.aidigitalsinai

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class PlatformApiProductDetailTest {
    private lateinit var server: MockWebServer
    private lateinit var api: PlatformApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = PlatformApi(server.url("/").toString().trimEnd('/'), FakeSession("detail-token", "tenant-detail"))
    }

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun productDetailBuildsAuthenticatedGetAndParsesAllFields() {
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(
            """{"ok":true,"product":{"id":"product-1","business_id":"business-1","sku":"SKU-1","name":"Coffee","description":"Fresh coffee","category":"Beverages","price_cents":1250,"currency":"EGP","status":"active","created_at":1730000000000,"updated_at":1730000001000}}"""
        ))

        val (result, product) = api.productDetail("product-1")
        val request = server.takeRequest()

        assertEquals(200, result.status)
        assertEquals("GET", request.method)
        assertEquals("/api/platform/products/product-1", request.path)
        assertEquals("Bearer detail-token", request.getHeader("Authorization"))
        assertEquals("tenant-detail", request.getHeader("x-tenant-id"))
        assertEquals("product-1", product?.id)
        assertEquals("business-1", product?.businessId)
        assertEquals("SKU-1", product?.sku)
        assertEquals("Coffee", product?.name)
        assertEquals("Fresh coffee", product?.description)
        assertEquals("Beverages", product?.category)
        assertEquals(1250, product?.priceCents)
        assertEquals("EGP", product?.currency)
        assertEquals("active", product?.status)
        assertEquals(1730000000000L, product?.createdAt)
        assertEquals(1730000001000L, product?.updatedAt)
    }

    private class FakeSession(
        override var token: String?,
        override var tenantId: String?,
        override var branchId: String? = null
    ) : SessionStoreContract
}
