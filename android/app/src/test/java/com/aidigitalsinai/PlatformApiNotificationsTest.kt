package com.aidigitalsinai

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class PlatformApiNotificationsTest {
    private lateinit var server: MockWebServer
    private lateinit var api: PlatformApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = PlatformApi(server.url("/").toString().trimEnd('/'), FakeSession("notification-token", "tenant-notification"))
    }

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun notificationsBuildsAuthenticatedGetAndParsesChannelAndStatus() {
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(
            """{"ok":true,"notifications":[{"id":"notification-1","user_id":"user-1","channel":"IN_APP","title":"Order delivered","body":"Your order is delivered","status":"DELIVERED","created_at":1730000000000}]}"""
        ))

        val (result, notifications) = api.notifications()
        val request = server.takeRequest()

        assertEquals(200, result.status)
        assertEquals("GET", request.method)
        assertEquals("/api/platform/notifications", request.path)
        assertEquals("Bearer notification-token", request.getHeader("Authorization"))
        assertEquals("tenant-notification", request.getHeader("x-tenant-id"))
        assertEquals(1, notifications.size)
        assertEquals("IN_APP", notifications.single().channel)
        assertEquals("DELIVERED", notifications.single().status)
        assertEquals("Order delivered", notifications.single().title)
    }

    private class FakeSession(
        override var token: String?,
        override var tenantId: String?,
        override var branchId: String? = null
    ) : SessionStoreContract
}
