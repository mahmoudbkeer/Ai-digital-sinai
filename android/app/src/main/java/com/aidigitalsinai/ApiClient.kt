package com.aidigitalsinai

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

interface SessionStoreContract {
    var token: String?
    var tenantId: String?
    var branchId: String?
}

class SessionStore(context: Context) : SessionStoreContract {
    private val prefs = context.getSharedPreferences("platform_session", Context.MODE_PRIVATE)
    override var token: String?
        get() = prefs.getString("platform_token", null)
        set(value) { prefs.edit().putString("platform_token", value).apply() }
    override var tenantId: String?
        get() = prefs.getString("platform_tenant_id", null)
        set(value) { prefs.edit().putString("platform_tenant_id", value).apply() }
    override var branchId: String?
        get() = prefs.getString("platform_branch_id", null)
        set(value) { prefs.edit().putString("platform_branch_id", value).apply() }
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

data class CartItem(
    val id: String,
    val productId: String,
    val name: String,
    val quantity: Int,
    val unitPriceCents: Int,
    val lineTotalCents: Int
)

data class CartSnapshot(
    val cartId: String?,
    val status: String?,
    val items: List<CartItem>,
    val totalCents: Int
)

data class CheckoutResult(
    val orderId: String,
    val state: String,
    val totalCents: Int,
    val currency: String
)

data class PlatformNotification(
    val id: String,
    val channel: String,
    val title: String,
    val body: String,
    val status: String
)

data class AiSearchResult(
    val documentId: String,
    val title: String,
    val snippet: String,
    val sourceType: String
)

class PlatformApi(private val baseUrl: String, private val session: SessionStoreContract) {
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

    fun aiSearch(query: String): Pair<ApiResult, List<AiSearchResult>> {
        val result = request("POST", "/api/platform/ai/search", JSONObject().apply {
            put("query", query)
        }, authenticated = true)
        val values = buildList {
            val items = result.body.optJSONArray("results") ?: return@buildList
            for (index in 0 until items.length()) {
                val item = items.optJSONObject(index) ?: continue
                add(AiSearchResult(
                    documentId = item.optString("document_id"),
                    title = item.optString("title"),
                    snippet = item.optString("snippet"),
                    sourceType = item.optString("source_type")
                ))
            }
        }
        return result to values
    }

    fun notifications(): Pair<ApiResult, List<PlatformNotification>> {
        val result = request("GET", "/api/platform/notifications", null, authenticated = true)
        val values = buildList {
            val items = result.body.optJSONArray("notifications") ?: return@buildList
            for (index in 0 until items.length()) {
                val item = items.optJSONObject(index) ?: continue
                add(PlatformNotification(
                    id = item.optString("id"),
                    channel = item.optString("channel"),
                    title = item.optString("title"),
                    body = item.optString("body"),
                    status = item.optString("status")
                ))
            }
        }
        return result to values
    }

    fun cart(): Pair<ApiResult, CartSnapshot> {
        val result = request("GET", "/api/platform/cart", null, authenticated = true)
        val cart = result.body.optJSONObject("cart")
        val values = buildList {
            val items = result.body.optJSONArray("items") ?: return@buildList
            for (index in 0 until items.length()) {
                val item = items.optJSONObject(index) ?: continue
                add(CartItem(
                    id = item.optString("id"),
                    productId = item.optString("product_id"),
                    name = item.optString("name"),
                    quantity = item.optInt("quantity"),
                    unitPriceCents = item.optInt("unit_price_cents"),
                    lineTotalCents = item.optInt("line_total_cents")
                ))
            }
        }
        return result to CartSnapshot(
            cartId = cart?.optString("id")?.ifBlank { null },
            status = cart?.optString("status")?.ifBlank { null },
            items = values,
            totalCents = result.body.optInt("totalCents")
        )
    }

    fun addCartItem(productId: String, quantity: Int, branchId: String?): ApiResult = request(
        "POST", "/api/platform/cart/items", JSONObject().apply {
            put("productId", productId)
            put("quantity", quantity)
            branchId?.let { put("branchId", it) }
        }, authenticated = true
    )

    fun checkout(branchId: String): Pair<ApiResult, CheckoutResult?> {
        val result = request("POST", "/api/platform/cart/checkout", JSONObject().apply {
            put("branchId", branchId)
        }, authenticated = true)
        val orderId = result.body.optString("orderId")
        val checkout = if (orderId.isNotBlank()) CheckoutResult(
            orderId = orderId,
            state = result.body.optString("state"),
            totalCents = result.body.optInt("totalCents"),
            currency = result.body.optString("currency")
        ) else null
        return result to checkout
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
            session.branchId = result.body.optString("branchId")
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
