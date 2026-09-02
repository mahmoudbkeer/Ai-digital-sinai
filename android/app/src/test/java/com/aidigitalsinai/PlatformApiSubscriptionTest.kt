package com.aidigitalsinai

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class PlatformApiSubscriptionTest {
    private lateinit var server: MockWebServer
    private lateinit var api: PlatformApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = PlatformApi(server.url("/").toString().trimEnd('/'), FakeSession("subscription-token", "tenant-subscription"))
    }

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun subscriptionBuildsAuthenticatedGetAndParsesPlanStatus() {
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(
            """{"ok":true,"subscription":{"id":"sub-1","plan_code":"trial","status":"TRIALING","current_period_start":1730000000000,"current_period_end":1732592000000,"cancel_at_period_end":false,"price_cents":0,"trial_days":14}}"""
        ))

        val (result, subscription) = api.subscription()
        val request = server.takeRequest()

        assertEquals(200, result.status)
        assertEquals("GET", request.method)
        assertEquals("/api/platform/subscription", request.path)
        assertEquals("Bearer subscription-token", request.getHeader("Authorization"))
        assertEquals("tenant-subscription", request.getHeader("x-tenant-id"))
        assertEquals("trial", subscription?.planCode)
        assertEquals("TRIALING", subscription?.status)
        assertEquals(0, subscription?.priceCents)
        assertEquals(14, subscription?.trialDays)
    }

    @Test
    fun subscriptionEntitlementsBuildsAuthenticatedGetAndParsesFeatures() {
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(
            """{"ok":true,"subscription":{"plan_code":"trial","status":"TRIALING","current_period_end":1732592000000,"name":"Trial"},"features":[{"feature":"analytics.read","limit_value":"enabled"},{"feature":"orders.monthly","limit_value":"100"}]}"""
        ))

        val (result, entitlements) = api.subscriptionEntitlements()
        val request = server.takeRequest()

        assertEquals(200, result.status)
        assertEquals("GET", request.method)
        assertEquals("/api/platform/subscription/entitlements", request.path)
        assertEquals("Bearer subscription-token", request.getHeader("Authorization"))
        assertEquals("tenant-subscription", request.getHeader("x-tenant-id"))
        assertEquals("trial", entitlements?.planCode)
        assertEquals("TRIALING", entitlements?.status)
        assertEquals("enabled", entitlements?.features?.get("analytics.read"))
        assertEquals("100", entitlements?.features?.get("orders.monthly"))
    }

    private class FakeSession(
        override var token: String?,
        override var tenantId: String?,
        override var branchId: String? = null
    ) : SessionStoreContract
}
