package com.aidigitalsinai

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class PlatformApiRegisterTest {
    private lateinit var server: MockWebServer
    private lateinit var session: FakeSession

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        session = FakeSession()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun registerPersistsAllWorkspaceContextFields() {
        server.enqueue(MockResponse()
            .setResponseCode(201)
            .setHeader("Content-Type", "application/json")
            .setBody("""{"ok":true,"token":"registered-token","tenantId":"tenant-1","businessId":"business-1","branchId":"branch-1"}"""))

        val result = PlatformApi(server.url("/").toString().trimEnd('/'), session)
            .register("owner@example.com", "a-very-strong-password", "Owner", "Sinai Shop")

        assertEquals(201, result.status)
        assertEquals("registered-token", session.token)
        assertEquals("tenant-1", session.tenantId)
        assertEquals("branch-1", session.branchId)
        assertEquals("POST", server.takeRequest().method)
    }

    private class FakeSession : SessionStoreContract {
        override var token: String? = null
        override var tenantId: String? = null
        override var branchId: String? = null
    }
}
