package com.aidigitalsinai

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class PlatformApiCartCheckoutTest {
    private lateinit var server: MockWebServer
    private lateinit var api: PlatformApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = PlatformApi(server.url("/").toString().trimEnd('/'), FakeSession("cart-token", "tenant-cart"))
    }

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun cartBuildsAuthenticatedGetAndParsesItems() {
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(
            """{"ok":true,"cart":{"id":"cart-1","branch_id":"branch-1","status":"ACTIVE"},"items":[{"id":"item-1","product_id":"product-1","name":"Coffee","quantity":2,"unit_price_cents":300,"line_total_cents":600}],"totalCents":600}"""
        ))

        val (result, cart) = api.cart()
        val request = server.takeRequest()

        assertEquals(200, result.status)
        assertEquals("GET", request.method)
        assertEquals("/api/platform/cart", request.path)
        assertEquals("Bearer cart-token", request.getHeader("Authorization"))
        assertEquals("tenant-cart", request.getHeader("x-tenant-id"))
        assertEquals("cart-1", cart.cartId)
        assertEquals("ACTIVE", cart.status)
        assertEquals(1, cart.items.size)
        assertEquals("product-1", cart.items.single().productId)
        assertEquals(600, cart.totalCents)
    }

    @Test
    fun addCartItemBuildsAuthenticatedPostWithExpectedJson() {
        server.enqueue(MockResponse().setResponseCode(201).setHeader("Content-Type", "application/json").setBody(
            """{"ok":true,"cartId":"cart-1"}"""
        ))

        val result = api.addCartItem("product-1", 2, "branch-1")
        val request = server.takeRequest()
        val body = request.body.readUtf8()

        assertEquals(201, result.status)
        assertEquals("POST", request.method)
        assertEquals("/api/platform/cart/items", request.path)
        assertEquals("Bearer cart-token", request.getHeader("Authorization"))
        assertEquals("tenant-cart", request.getHeader("x-tenant-id"))
        assertEquals(true, body.contains("\"productId\":\"product-1\""))
        assertEquals(true, body.contains("\"quantity\":2"))
        assertEquals(true, body.contains("\"branchId\":\"branch-1\""))
        assertEquals("cart-1", result.body.getString("cartId"))
    }

    @Test
    fun checkoutBuildsAuthenticatedPostAndParsesOrderState() {
        server.enqueue(MockResponse().setResponseCode(201).setHeader("Content-Type", "application/json").setBody(
            """{"ok":true,"orderId":"order-1","totalCents":600,"taxCents":0,"currency":"EGP","state":"PENDING"}"""
        ))

        val (result, checkout) = api.checkout("branch-1")
        val request = server.takeRequest()
        val body = request.body.readUtf8()

        assertEquals(201, result.status)
        assertEquals("POST", request.method)
        assertEquals("/api/platform/cart/checkout", request.path)
        assertEquals("Bearer cart-token", request.getHeader("Authorization"))
        assertEquals("tenant-cart", request.getHeader("x-tenant-id"))
        assertEquals(true, body.contains("\"branchId\":\"branch-1\""))
        assertEquals("order-1", checkout?.orderId)
        assertEquals("PENDING", checkout?.state)
        assertEquals(600, checkout?.totalCents)
        assertEquals("EGP", checkout?.currency)
    }

    private class FakeSession(
        override var token: String?,
        override var tenantId: String?,
        override var branchId: String? = null
    ) : SessionStoreContract
}
