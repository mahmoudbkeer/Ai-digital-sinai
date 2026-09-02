package com.aidigitalsinai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = SessionStore(this)
        val api = PlatformApi(BuildConfig.API_BASE_URL, store)
        setContent { MaterialTheme { Surface { LoginScreen(api, store) } } }
    }
}

@androidx.compose.runtime.Composable
private fun LoginScreen(api: PlatformApi, store: SessionStore) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var tenantName by remember { mutableStateOf("") }
    var registerMode by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var marketplaceLoading by remember { mutableStateOf(false) }
    var products by remember { mutableStateOf(emptyList<MarketplaceProduct>()) }
    var authenticated by remember { mutableStateOf(store.token != null && store.tenantId != null) }
    var cartLoading by remember { mutableStateOf(false) }
    var cart by remember { mutableStateOf<CartSnapshot?>(null) }
    var checkoutMessage by remember { mutableStateOf("") }
    var notifications by remember { mutableStateOf(emptyList<PlatformNotification>()) }
    var notificationLoading by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf(emptyList<AiSearchResult>()) }
    var searchMessage by remember { mutableStateOf("") }
    var searchLoading by remember { mutableStateOf(false) }
    var analytics by remember { mutableStateOf<AnalyticsOverview?>(null) }
    var analyticsLoading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxSize().padding(PaddingValues(24.dp)),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("AI DIGITAL SINAI", style = MaterialTheme.typography.headlineMedium)
        Text(if (registerMode) "إنشاء مساحة عمل" else "تسجيل الدخول", style = MaterialTheme.typography.titleLarge)
        OutlinedTextField(email, { email = it }, label = { Text("البريد الإلكتروني") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(password, { password = it }, label = { Text("كلمة المرور") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        if (registerMode) {
            OutlinedTextField(displayName, { displayName = it }, label = { Text("الاسم") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(tenantName, { tenantName = it }, label = { Text("اسم النشاط") }, modifier = Modifier.fillMaxWidth())
        }
        Button(
            onClick = {
                loading = true
                message = ""
                scope.launch {
                    val result = withContext(Dispatchers.IO) {
                        if (registerMode) api.register(email, password, displayName, tenantName)
                        else api.login(email, password)
                    }
                    loading = false
                    message = if (result.status in 200..299) {
                        authenticated = true
                        marketplaceLoading = true
                        val (productsResult, loadedProducts) = withContext(Dispatchers.IO) { api.products() }
                        products = loadedProducts
                        marketplaceLoading = false
                        val (cartResult, loadedCart) = withContext(Dispatchers.IO) { api.cart() }
                        cart = loadedCart
                        notificationLoading = true
                        val (notificationsResult, loadedNotifications) = withContext(Dispatchers.IO) { api.notifications() }
                        notifications = loadedNotifications
                        notificationLoading = false
                        analyticsLoading = true
                        val (analyticsResult, loadedAnalytics) = withContext(Dispatchers.IO) { api.analyticsOverview() }
                        analytics = loadedAnalytics
                        analyticsLoading = false
                        "نجح الاتصال: HTTP ${result.status}. Marketplace HTTP ${productsResult.status}. Cart HTTP ${cartResult.status}. Notifications HTTP ${notificationsResult.status}. Analytics HTTP ${analyticsResult.status}. tenant=${store.tenantId}"
                    } else {
                        "فشل الطلب: HTTP ${result.status} — ${result.body.optString("message", "تعذر الاتصال")}" 
                    }
                }
            },
            enabled = !loading && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) { if (loading) CircularProgressIndicator() else Text(if (registerMode) "تسجيل" else "دخول") }
        Button(onClick = { registerMode = !registerMode; message = "" }, modifier = Modifier.fillMaxWidth()) {
            Text(if (registerMode) "لدي حساب بالفعل" else "إنشاء حساب جديد")
        }
        if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.primary)
        if (authenticated) {
            Text("Marketplace", style = MaterialTheme.typography.headlineSmall)
            if (marketplaceLoading) CircularProgressIndicator()
            else if (products.isEmpty()) Text("لا توجد منتجات منشورة لهذا المستأجر.")
            else LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(products, key = { it.id }) { product ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                Text(product.name, style = MaterialTheme.typography.titleMedium)
                                Text("${product.priceCents / 100.0} ${product.currency}", fontSize = 14.sp)
                            }
                            product.category?.let { Text(it, style = MaterialTheme.typography.labelMedium) }
                            product.description?.let { Text(it) }
                            Button(onClick = {
                                cartLoading = true
                                scope.launch {
                                    val result = withContext(Dispatchers.IO) {
                                        api.addCartItem(product.id, 1, store.branchId)
                                    }
                                    val (_, loadedCart) = withContext(Dispatchers.IO) { api.cart() }
                                    cart = loadedCart
                                    cartLoading = false
                                    checkoutMessage = "تمت إضافة المنتج: HTTP ${result.status}"
                                }
                            }, enabled = !cartLoading) { Text("أضف للسلة") }
                        }
                    }
                }
            }
            Text("Cart", style = MaterialTheme.typography.headlineSmall)
            if (cartLoading) CircularProgressIndicator()
            cart?.items?.forEach { item ->
                Text("${item.name} × ${item.quantity} — ${item.lineTotalCents / 100.0} EGP")
            }
            Text("الإجمالي: ${cart?.totalCents?.div(100.0) ?: 0.0} EGP")
            Button(
                onClick = {
                    cartLoading = true
                    scope.launch {
                        val (result, checkout) = withContext(Dispatchers.IO) {
                            store.branchId?.let { api.checkout(it) } ?: (ApiResult(400, org.json.JSONObject().put("message", "branchId مطلوب")) to null)
                        }
                        cartLoading = false
                        checkoutMessage = if (checkout != null) {
                            "تم إنشاء الطلب: ${checkout.orderId} — الحالة: ${checkout.state} — HTTP ${result.status}"
                        } else {
                            "تعذر إتمام الشراء: HTTP ${result.status} — ${result.body.optString("message", "branchId مطلوب")}"
                        }
                    }
                },
                enabled = !cartLoading && !cart?.items.isNullOrEmpty()
            ) { Text("إتمام الشراء") }
            if (checkoutMessage.isNotBlank()) Text(checkoutMessage, color = MaterialTheme.colorScheme.primary)
            Text("Notifications", style = MaterialTheme.typography.headlineSmall)
            if (notificationLoading) CircularProgressIndicator()
            else if (notifications.isEmpty()) Text("لا توجد إشعارات.")
            else notifications.forEach { notification ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(notification.title, style = MaterialTheme.typography.titleMedium)
                        Text(notification.body)
                        Text("${notification.channel} / ${notification.status}", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
            Text("AI Search", style = MaterialTheme.typography.headlineSmall)
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                label = { Text("ابحث في المعرفة") },
                modifier = Modifier.fillMaxWidth()
            )
            Button(
                onClick = {
                    searchLoading = true
                    scope.launch {
                        val (result, loadedResults) = withContext(Dispatchers.IO) { api.aiSearch(searchQuery) }
                        searchResults = loadedResults
                        searchLoading = false
                        searchMessage = "AI Search HTTP ${result.status} — ${loadedResults.size} نتيجة"
                    }
                },
                enabled = !searchLoading && searchQuery.isNotBlank()
            ) { if (searchLoading) CircularProgressIndicator() else Text("بحث") }
            if (searchMessage.isNotBlank()) Text(searchMessage, color = MaterialTheme.colorScheme.primary)
            searchResults.forEach { item ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(item.title, style = MaterialTheme.typography.titleMedium)
                        Text(item.snippet)
                        Text(item.sourceType, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
            Text("Analytics", style = MaterialTheme.typography.headlineSmall)
            if (analyticsLoading) CircularProgressIndicator()
            else analytics?.let { overview ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Orders: ${overview.orders}")
                        Text("Deliveries: ${overview.deliveries}")
                        Text("Notifications: ${overview.notifications}")
                    }
                }
            }
        }
    }
}
