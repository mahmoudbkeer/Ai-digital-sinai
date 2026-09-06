package com.aidigitalsinai

import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PlatformApiNetworkFailureTest {
    @Test
    fun registerReturnsManagedNetworkErrorWhenServerIsUnavailable() {
        val server = MockWebServer()
        server.start()
        val baseUrl = server.url("/").toString().trimEnd('/')
        server.shutdown()

        val result = PlatformApi(baseUrl, FakeSession()).register(
            "owner@example.com",
            "a-very-strong-password",
            "Owner",
            "Sinai Shop"
        )

        assertEquals(ApiResult.NETWORK_ERROR_STATUS, result.status)
        assertTrue(result.isNetworkError)
        assertEquals(ApiResult.NETWORK_ERROR_MESSAGE, result.body.optString("message"))
    }

    private class FakeSession : SessionStoreContract {
        override var token: String? = null
        override var tenantId: String? = null
        override var branchId: String? = null
    }
}
