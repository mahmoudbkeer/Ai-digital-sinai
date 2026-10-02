package com.aidigitalsinai

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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
            .setBody("""{"ok":true,"userId":"user-1","tenantId":"tenant-1","businessId":"business-1","branchId":"branch-1","activation":{"status":"REQUIRES_SETUP"}}"""))

        val result = PlatformApi(server.url("/").toString().trimEnd('/'), session)
            .register("owner@example.com", "a-very-strong-password", "Owner", "Sinai Shop")

        assertEquals(201, result.status)
        assertNull(session.token)
        assertNull(session.tenantId)
        assertNull(session.branchId)
        assertEquals("POST", server.takeRequest().method)
    }

    private class FakeSession : SessionStoreContract {
        override var token: String? = null
        override var tenantId: String? = null
        override var branchId: String? = null
    }
}
