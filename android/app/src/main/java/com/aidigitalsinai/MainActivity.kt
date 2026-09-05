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
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val AppLightColorScheme = lightColorScheme(
    primary = DesignTokens.SinaiTide,
    onPrimary = DesignTokens.Surface,
    secondary = DesignTokens.SeaNavy,
    onSecondary = DesignTokens.Surface,
    background = DesignTokens.Background,
    onBackground = DesignTokens.Text,
    surface = DesignTokens.Surface,
    onSurface = DesignTokens.Text,
    error = DesignTokens.Error
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = SessionStore(this)
        val api = PlatformApi(BuildConfig.API_BASE_URL, store)
        setContent { CompositionLocalProvider(LocalLayoutDirection provides if (java.util.Locale.getDefault().language == "ar") LayoutDirection.Rtl else LayoutDirection.Ltr) { MaterialTheme(colorScheme = AppLightColorScheme) { Surface { LoginScreen(api, store) } } } }
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
    var selectedProduct by remember { mutableStateOf<ProductDetail?>(null) }
    var detailLoading by remember { mutableStateOf(false) }
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
    var subscription by remember { mutableStateOf<SubscriptionSnapshot?>(null) }
    var entitlements by remember { mutableStateOf<SubscriptionEntitlements?>(null) }
    var subscriptionLoading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    suspend fun loadOptional(block: suspend () -> Unit) {
        try {
            block()
        } catch (_: Exception) {
            // Optional workspace panels must not prevent the project screen from opening.
        }
    }

    fun loadWorkspace() {
        scope.launch {
            try {
                marketplaceLoading = true
                val (productsResult, loadedProducts) = withContext(Dispatchers.IO) { api.products() }
                products = loadedProducts
                marketplaceLoading = false
                if (productsResult.status !in 200..299) message = "تم فتح المشروع، وتعذر تحميل المتجر (HTTP ${productsResult.status})."
            } catch (_: Exception) {
                marketplaceLoading = false
                message = "تم فتح المشروع، لكن تعذر تحميل بيانات المتجر حالياً."
            }

            loadOptional {
                val (_, loadedCart) = withContext(Dispatchers.IO) { api.cart() }
                cart = loadedCart
            }
            loadOptional {
                val (_, loadedNotifications) = withContext(Dispatchers.IO) { api.notifications() }
                notifications = loadedNotifications
            }
            loadOptional {
                val (_, loadedAnalytics) = withContext(Dispatchers.IO) { api.analyticsOverview() }
                analytics = loadedAnalytics
            }
            loadOptional {
                val (_, loadedSubscription) = withContext(Dispatchers.IO) { api.subscription() }
                subscription = loadedSubscription
            }
            loadOptional {
                val (_, loadedEntitlements) = withContext(Dispatchers.IO) { api.subscriptionEntitlements() }
                entitlements = loadedEntitlements
            }
            notificationLoading = false
            analyticsLoading = false
            subscriptionLoading = false
        }
    }

    LaunchedEffect(authenticated) {
        if (authenticated) loadWorkspace()
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(PaddingValues(24.dp)),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(stringResource(R.string.brand_name), style = MaterialTheme.typography.headlineMedium)
        Text(stringResource(if (registerMode) R.string.create_account else R.string.login_title), style = MaterialTheme.typography.titleLarge)
        Button(
            onClick = {
                loading = true
                message = ""
                scope.launch {
                    when (val google = signInWithGoogle(context)) {
                        GoogleSignInResult.RequiresSetup -> message = "REQUIRES_SETUP: أضف GOOGLE_SERVER_CLIENT_ID لإتاحة Google Sign-In."
                        GoogleSignInResult.Cancelled -> message = "تم إلغاء اختيار حساب Google."
                        is GoogleSignInResult.Failed -> message = google.message
                        is GoogleSignInResult.Success -> {
                            val result = withContext(Dispatchers.IO) { api.googleLogin(google.idToken) }
                            if (result.status in 200..299) {
                                authenticated = true
                                message = "تم تسجيل الدخول بحساب Google."
                            } else {
                                message = "Google Sign-In: HTTP ${result.status} — ${result.body.optString("message", "يتطلب إعداد Google.")}"
                            }
                        }
                    }
                    loading = false
                }
            },
            enabled = !loading && !registerMode,
            modifier = Modifier.fillMaxWidth()
        ) { Text("المتابعة بحساب Google") }
        OutlinedTextField(email, { email = it }, label = { Text(stringResource(R.string.email)) }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(password, { password = it }, label = { Text(stringResource(R.string.password)) }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
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
                        notificationLoading = true
                        analyticsLoading = true
                        subscriptionLoading = true
                        "تم فتح المشروع بنجاح (HTTP ${result.status}). tenant=${store.tenantId}"
                    } else {
                        "فشل الطلب: HTTP ${result.status} — ${result.body.optString("message", "تعذر الاتصال")}"
                    }
                }
            },
            enabled = !loading && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) { if (loading) CircularProgressIndicator() else Text(stringResource(if (registerMode) R.string.register else R.string.sign_in)) }
        Button(onClick = { registerMode = !registerMode; message = "" }, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(if (registerMode) R.string.existing_account else R.string.create_account))
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
                                detailLoading = true
                                scope.launch {
                                    val (_, detail) = withContext(Dispatchers.IO) { api.productDetail(product.id) }
                                    selectedProduct = detail
                                    detailLoading = false
                                }
                            }, enabled = !detailLoading) { Text("التفاصيل") }
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
            if (detailLoading) CircularProgressIndicator()
            selectedProduct?.let { detail ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text("Product Detail", style = MaterialTheme.typography.titleLarge)
                        Text("${detail.name} — ${detail.priceCents / 100.0} ${detail.currency}")
                        Text("SKU: ${detail.sku}")
                        Text("Business: ${detail.businessId}")
                        Text("Category: ${detail.category ?: "—"}")
                        Text("Status: ${detail.status}")
                        detail.description?.let { Text(it) }
                        Text("Created: ${detail.createdAt}")
                        Text("Updated: ${detail.updatedAt}")
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
            Text("Subscription", style = MaterialTheme.typography.headlineSmall)
            if (subscriptionLoading) CircularProgressIndicator()
            else {
                subscription?.let { plan ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text("Plan: ${plan.planCode}")
                            Text("Status: ${plan.status}")
                            Text("Price: ${plan.priceCents / 100.0} EGP")
                            Text("Trial days: ${plan.trialDays}")
                            entitlements?.features?.forEach { (feature, limit) -> Text("$feature: $limit") }
                        }
                    }
                } ?: Text("لا يوجد اشتراك لهذا المستأجر.")
            }
        }
    }
}
