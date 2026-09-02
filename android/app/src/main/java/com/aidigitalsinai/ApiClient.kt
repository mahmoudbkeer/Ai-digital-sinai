package com.aidigitalsinai

import android.content.Context
import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("platform_session", Context.MODE_PRIVATE)
    var token: String?
        get() = prefs.getString("platform_token", null)
        set(value) { prefs.edit().putString("platform_token", value).apply() }
    var tenantId: String?
        get() = prefs.getString("platform_tenant_id", null)
        set(value) { prefs.edit().putString("platform_tenant_id", value).apply() }
}

data class ApiResult(val status: Int, val body: JSONObject)

data class MarketplaceProduct(
    val id: String,
    val name: String,
    val description: String?,
    val priceCents: Int,
    val currency: String,
    val category: String?
)

class PlatformApi(private val baseUrl: String, private val session: SessionStore) {
    fun login(email: String, password: String): ApiResult = request("POST", "/api/platform/auth/login", JSONObject().apply {
        put("email", email)
        put("password", password)
    }, authenticated = false).also { result ->
        if (result.status in 200..299 && result.body.optString("token").isNotBlank()) {
            session.token = result.body.getString("token")
            val tenants = result.body.optJSONArray("tenants")
            session.tenantId = tenants?.optJSONObject(0)?.optString("tenant_id")
        }
    }

    fun products(): Pair<ApiResult, List<MarketplaceProduct>> {
        val result = request("GET", "/api/platform/products", null, authenticated = true)
        val values = buildList {
            val items = result.body.optJSONArray("products") ?: return@buildList
            for (index in 0 until items.length()) {
                val item = items.optJSONObject(index) ?: continue
                add(MarketplaceProduct(
                    id = item.optString("id"),
                    name = item.optString("name"),
                    description = item.optString("description").ifBlank { null },
                    priceCents = item.optInt("price_cents"),
                    currency = item.optString("currency", "EGP"),
                    category = item.optString("category").ifBlank { null }
                ))
            }
        }
        return result to values
    }

    fun register(email: String, password: String, displayName: String, tenantName: String): ApiResult = request("POST", "/api/platform/auth/register", JSONObject().apply {
        put("email", email)
        put("password", password)
        put("displayName", displayName)
        put("tenantName", tenantName)
    }, authenticated = false).also { result ->
        if (result.status in 200..299) {
            session.token = result.body.optString("token")
            session.tenantId = result.body.optString("tenantId")
        }
    }

    private fun request(method: String, path: String, payload: JSONObject?, authenticated: Boolean): ApiResult {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 10_000
            setRequestProperty("Content-Type", "application/json")
            if (authenticated) {
                setRequestProperty("Authorization", "Bearer ${session.token}")
                setRequestProperty("x-tenant-id", session.tenantId ?: "")
            }
            doInput = true
            if (payload != null) doOutput = true
        }
        payload?.toString()?.toByteArray(Charsets.UTF_8)?.let { connection.outputStream.use { stream -> stream.write(it) } }
        val status = connection.responseCode
        val stream = if (status >= 400) connection.errorStream else connection.inputStream
        val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        return ApiResult(status, JSONObject(if (body.isBlank()) "{}" else body))
    }
}
