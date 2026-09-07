package com.aidigitalsinai

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class PlatformApiMarketplaceDirectoryTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() { server = MockWebServer().also { it.start() } }

    @After
    fun tearDown() { server.shutdown() }

    @Test
    fun directoryParsesRealBusinessContractAndEncodesFilters() {
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(
            """{"ok":true,"businesses":[{"id":"b-1","name":"صيدلية النور","category":"الصحة والطب","subcategory":"صيدلية","district":"المساعيد","tag":"صيدلية","description":"خدمة دوائية","phone":"201000000000","whatsapp":"201000000000","hours_json":"{\"daily\":\"09:00-21:00\"}","reviews":7,"rating":4.8,"image_url":null,"offering_name":"أدوية وعناية","created_at":1730000000000,"sponsored":1,"featured_source":"advertising"}]}"""
        ))
        val (result, businesses) = PlatformApi(server.url("/").toString().trimEnd('/'), FakeSession()).marketplaceDirectory("صيدلية", "الصحة والطب")
        val request = server.takeRequest()
        assertEquals(200, result.status)
        assertEquals("GET", request.method)
        assertTrue(request.path!!.contains("query=%D8%B5%D9%8A%D8%AF%D9%84%D9%8A%D8%A9"))
        assertTrue(request.path!!.contains("category=%D8%A7%D9%84%D8%B5%D8%AD%D8%A9"))
        assertEquals("صيدلية النور", businesses.single().name)
        assertTrue(businesses.single().sponsored)
        assertEquals("advertising", businesses.single().featuredSource)
        assertEquals(4.8, businesses.single().rating!!, 0.01)
    }

    private class FakeSession : SessionStoreContract {
        override var token: String? = null
        override var tenantId: String? = null
        override var branchId: String? = null
    }
}
