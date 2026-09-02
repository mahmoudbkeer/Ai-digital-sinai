package com.aidigitalsinai

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class PlatformApiAnalyticsTest {
    private lateinit var server: MockWebServer
    private lateinit var api: PlatformApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = PlatformApi(server.url("/").toString().trimEnd('/'), FakeSession("analytics-token", "tenant-analytics"))
    }

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun analyticsOverviewBuildsAuthenticatedGetAndParsesCoreCounts() {
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(
            """{"ok":true,"source":"database","asOf":"2026-09-02T00:00:00Z","analytics":{"marketplace":{"products":4,"services":1,"active_ads":2,"orders":7,"bookings":3},"platform":{"deliveries":5,"notifications":9,"audit_events":12}}}"""
        ))

        val (result, analytics) = api.analyticsOverview()
        val request = server.takeRequest()

        assertEquals(200, result.status)
        assertEquals("GET", request.method)
        assertEquals("/api/platform/analytics/overview", request.path)
        assertEquals("Bearer analytics-token", request.getHeader("Authorization"))
        assertEquals("tenant-analytics", request.getHeader("x-tenant-id"))
        assertEquals(7, analytics.orders)
        assertEquals(5, analytics.deliveries)
        assertEquals(9, analytics.notifications)
    }

    private class FakeSession(
        override var token: String?,
        override var tenantId: String?,
        override var branchId: String? = null
    ) : SessionStoreContract
}
