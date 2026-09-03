import SwiftUI
import AiDigitalSinaiCore

@main
struct AiDigitalSinaiApp: App {
    var body: some Scene {
        WindowGroup {
            LoginView()
                .tint(DesignTokens.sinaiTide)
                .environment(\.layoutDirection, Locale.current.language.languageCode?.identifier == "ar" ? .rightToLeft : .leftToRight)
        }
    }
}

struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var displayName = ""
    @State private var tenantName = ""
    @State private var registerMode = false
    @State private var loading = false
    @State private var message = ""
    @State private var authenticated = false

    private let api = PlatformAPI(baseURL: URL(string: "http://127.0.0.1:4173")!)

    var body: some View {
        NavigationStack {
            if authenticated {
                MarketplaceView(api: api)
            } else {
            Form {
                Section("AI DIGITAL SINAI") {
                    TextField(LocalizedStringKey("email"), text: $email)
                    SecureField(LocalizedStringKey("password"), text: $password)
                    if registerMode {
                        TextField(LocalizedStringKey("name"), text: $displayName)
                        TextField(LocalizedStringKey("business_name"), text: $tenantName)
                    }
                }
                Section {
                    Button(LocalizedStringKey(registerMode ? "register" : "sign_in")) {
                        Task { await submit() }
                    }
                    .disabled(loading || email.isEmpty || password.isEmpty)
                    Button(LocalizedStringKey(registerMode ? "existing_account" : "create_account")) {
                        registerMode.toggle()
                        message = ""
                    }
                }
                if loading { ProgressView() }
                if !message.isEmpty { Text(message).foregroundStyle(DesignTokens.sinaiTide) }
            }
            .navigationTitle(LocalizedStringKey(registerMode ? "create_account" : "login_title"))
            }
        }
    }

    private func submit() async {
        loading = true
        defer { loading = false }
        do {
            let (result, session): (APIResult, AuthSession?)
            if registerMode {
                (result, session) = try await api.register(email: email, password: password, displayName: displayName, tenantName: tenantName)
            } else {
                (result, session) = try await api.login(email: email, password: password)
            }
            authenticated = session != nil
            message = "HTTP \(result.statusCode) — token: \(session?.token.isEmpty == false ? "received" : "missing"), tenant: \(session?.tenantID ?? "missing")"
        } catch {
            message = "فشل الطلب: \(error.localizedDescription)"
        }
    }
}


struct MarketplaceView: View {
    let api: PlatformAPI
    @State private var products: [MarketplaceProduct] = []
    @State private var loading = true
    @State private var errorMessage = ""
    @State private var searchQuery = ""
    @State private var searchResults: [AiSearchResult] = []
    @State private var searching = false
    @State private var searchError = ""

    var body: some View {
        Group {
            if loading {
                ProgressView("تحميل المنتجات…")
            } else if !errorMessage.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                    Text("تعذر تحميل Marketplace").font(.headline)
                    Text(errorMessage)
                }
            } else if products.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "shippingbox")
                    Text("لا توجد منتجات منشورة")
                }
            } else {
                List {
                    Section("AI Search") {
                        HStack {
                            TextField("ابحث في المعرفة…", text: $searchQuery)
                                .textFieldStyle(.roundedBorder)
                            Button("بحث") { Task { await search() } }
                                .disabled(searching || searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                        if searching { ProgressView("جارٍ البحث…") }
                        if !searchError.isEmpty { Text(searchError).foregroundStyle(DesignTokens.error) }
                        ForEach(searchResults) { result in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(result.title).font(.headline)
                                Text(result.snippet)
                                Text(result.sourceType).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Section("المنتجات") {
                        ForEach(products) { product in
                            NavigationLink {
                                ProductDetailView(api: api, productId: product.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack {
                                        Text(product.name).font(.headline)
                                        Spacer()
                                        Text(String(format: "%.2f %@", Double(product.priceCents) / 100.0, product.currency))
                                    }
                                    if let category = product.category { Text(category).font(.caption) }
                                    if let description = product.description { Text(description) }
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Marketplace")
        .toolbar {
            ToolbarItemGroup(placement: .automatic) {
                NavigationLink("الإشعارات") { NotificationsView(api: api) }
                NavigationLink("Analytics") { AnalyticsView(api: api) }
                NavigationLink("Subscription") { SubscriptionView(api: api) }
            }
        }
        .task { await loadProducts() }
    }

    private func search() async {
        searching = true
        searchError = ""
        defer { searching = false }
        do {
            let (result, loadedResults) = try await api.aiSearch(query: searchQuery)
            if (200..<300).contains(result.statusCode) {
                searchResults = loadedResults
            } else {
                searchError = "HTTP \(result.statusCode)"
            }
        } catch {
            searchError = error.localizedDescription
        }
    }

    private func loadProducts() async {
        do {
            let (result, loadedProducts) = try await api.products()
            if (200..<300).contains(result.statusCode) {
                products = loadedProducts
            } else {
                errorMessage = "HTTP \(result.statusCode)"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }
}


struct ProductDetailView: View {
    let api: PlatformAPI
    let productId: String
    @State private var product: ProductDetail?
    @State private var loading = true
    @State private var errorMessage = ""

    var body: some View {
        Group {
            if loading {
                ProgressView("تحميل التفاصيل…")
            } else if let product {
                List {
                    Section("المنتج") {
                        LabeledContent("الاسم", value: product.name)
                        LabeledContent("SKU", value: product.sku)
                        LabeledContent("النشاط", value: product.businessID)
                        LabeledContent("الفئة", value: product.category ?? "—")
                        LabeledContent("الحالة", value: product.status)
                        LabeledContent("السعر", value: String(format: "%.2f %@", Double(product.priceCents) / 100.0, product.currency))
                    }
                    Section("الوصف") { Text(product.description ?? "لا يوجد وصف") }
                    Section {
                        NavigationLink("أضف للسلة") {
                            CartCheckoutView(api: api, productId: product.id)
                        }
                    }
                    Section("السجل") {
                        LabeledContent("إنشاء", value: String(product.createdAt))
                        LabeledContent("تحديث", value: String(product.updatedAt))
                        LabeledContent("ID", value: product.id)
                    }
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                    Text("تعذر تحميل التفاصيل")
                    Text(errorMessage)
                }
            }
        }
        .navigationTitle("تفاصيل المنتج")
        .task { await loadDetail() }
    }

    private func loadDetail() async {
        do {
            let (result, loadedProduct) = try await api.productDetail(productId: productId)
            if (200..<300).contains(result.statusCode) {
                product = loadedProduct
            } else {
                errorMessage = "HTTP \(result.statusCode)"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }
}


struct CartCheckoutView: View {
    let api: PlatformAPI
    let productId: String
    @State private var cart: Cart?
    @State private var loading = false
    @State private var message = ""
    @State private var order: CheckoutResult?

    var body: some View {
        Form {
            Section("السلة") {
                if let cart {
                    ForEach(cart.items) { item in
                        HStack {
                            Text(item.name)
                            Spacer()
                            Text("x\(item.quantity)")
                        }
                        Text(String(format: "%.2f EGP", Double(item.lineTotalCents) / 100.0))
                            .font(.caption)
                    }
                    LabeledContent("الإجمالي", value: String(format: "%.2f EGP", Double(cart.totalCents) / 100.0))
                } else {
                    Text("السلة غير محمّلة")
                }
            }
            Section {
                Button("أضف للسلة") { Task { await addItem() } }
                    .disabled(loading)
                Button("إتمام الشراء") { Task { await completeCheckout() } }
                    .disabled(loading || cart?.items.isEmpty != false || api.authSession?.branchID == nil)
            }
            if loading { ProgressView() }
            if !message.isEmpty { Text(message).foregroundStyle(DesignTokens.sinaiTide) }
            if let order {
                Section("الطلب") {
                    LabeledContent("Order ID", value: order.orderID)
                    LabeledContent("State", value: order.state)
                }
            }
        }
        .navigationTitle("Cart / Checkout")
        .task { await loadCart() }
    }

    private func loadCart() async {
        loading = true
        defer { loading = false }
        do {
            let (result, loadedCart) = try await api.cart()
            if (200..<300).contains(result.statusCode) { cart = loadedCart }
            else { message = "Cart HTTP \(result.statusCode)" }
        } catch { message = error.localizedDescription }
    }

    private func addItem() async {
        loading = true
        defer { loading = false }
        do {
            let (result, _) = try await api.addCartItem(productId: productId, quantity: 1, branchId: api.authSession?.branchID)
            if (200..<300).contains(result.statusCode) { await loadCart() }
            else { message = "Add item HTTP \(result.statusCode)" }
        } catch { message = error.localizedDescription }
    }

    private func completeCheckout() async {
        guard let branchID = api.authSession?.branchID else { message = "الفرع مطلوب"; return }
        loading = true
        defer { loading = false }
        do {
            let (result, checkoutResult) = try await api.checkout(branchId: branchID)
            if (200..<300).contains(result.statusCode) { order = checkoutResult }
            else { message = "Checkout HTTP \(result.statusCode)" }
        } catch { message = error.localizedDescription }
    }
}


struct SubscriptionView: View {
    let api: PlatformAPI
    @State private var subscription: SubscriptionSnapshot?
    @State private var entitlements: SubscriptionEntitlements?
    @State private var loading = true
    @State private var errorMessage = ""

    var body: some View {
        Group {
            if loading {
                ProgressView("تحميل الاشتراك…")
            } else if !errorMessage.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                    Text("تعذر تحميل الاشتراك")
                    Text(errorMessage)
                }
            } else {
                List {
                    Section("الخطة") {
                        if let subscription {
                            LabeledContent("Plan Code", value: subscription.planCode)
                            LabeledContent("الحالة", value: subscription.status)
                            LabeledContent("السعر بالسنت", value: String(subscription.priceCents))
                            LabeledContent("أيام التجربة", value: String(subscription.trialDays))
                        } else {
                            Text("لا يوجد اشتراك")
                        }
                    }
                    Section("الامتيازات") {
                        if let entitlements {
                            LabeledContent("Plan Code", value: entitlements.planCode)
                            LabeledContent("الحالة", value: entitlements.status)
                            ForEach(entitlements.features.keys.sorted(), id: \.self) { feature in
                                LabeledContent(feature, value: entitlements.features[feature] ?? "")
                            }
                        } else {
                            Text("لا توجد امتيازات")
                        }
                    }
                }
            }
        }
        .navigationTitle("Subscription")
        .task { await loadSubscription() }
    }

    private func loadSubscription() async {
        do {
            let (subscriptionResult, loadedSubscription) = try await api.subscription()
            let (entitlementResult, loadedEntitlements) = try await api.subscriptionEntitlements()
            guard (200..<300).contains(subscriptionResult.statusCode), (200..<300).contains(entitlementResult.statusCode) else {
                errorMessage = "Subscription HTTP \(subscriptionResult.statusCode), Entitlements HTTP \(entitlementResult.statusCode)"
                loading = false
                return
            }
            subscription = loadedSubscription
            entitlements = loadedEntitlements
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }
}

struct AnalyticsView: View {
    let api: PlatformAPI
    @State private var analytics: AnalyticsOverview?
    @State private var loading = true
    @State private var errorMessage = ""

    var body: some View {
        Group {
            if loading {
                ProgressView("تحميل التحليلات…")
            } else if !errorMessage.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                    Text("تعذر تحميل التحليلات")
                    Text(errorMessage)
                }
            } else if let analytics {
                List {
                    Section("ملخص المنصة") {
                        LabeledContent("الطلبات", value: String(analytics.orders))
                        LabeledContent("التوصيلات", value: String(analytics.deliveries))
                        LabeledContent("الإشعارات", value: String(analytics.notifications))
                    }
                }
            }
        }
        .navigationTitle("Analytics")
        .task { await loadAnalytics() }
    }

    private func loadAnalytics() async {
        do {
            let (result, loadedAnalytics) = try await api.analyticsOverview()
            if (200..<300).contains(result.statusCode) {
                analytics = loadedAnalytics
            } else {
                errorMessage = "HTTP \(result.statusCode)"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }
}

struct NotificationsView: View {
    let api: PlatformAPI
    @State private var notifications: [PlatformNotification] = []
    @State private var loading = true
    @State private var errorMessage = ""

    var body: some View {
        Group {
            if loading {
                ProgressView("تحميل الإشعارات…")
            } else if !errorMessage.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                    Text("تعذر تحميل الإشعارات")
                    Text(errorMessage)
                }
            } else if notifications.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "bell.slash")
                    Text("لا توجد إشعارات")
                }
            } else {
                List(notifications) { notification in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(notification.title).font(.headline)
                            Spacer()
                            Text(notification.status).font(.caption).bold()
                        }
                        Text(notification.body)
                        Text("\(notification.channel) · \(notification.status)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle("الإشعارات")
        .task { await loadNotifications() }
    }

    private func loadNotifications() async {
        do {
            let (result, loaded) = try await api.notifications()
            if (200..<300).contains(result.statusCode) {
                notifications = loaded
            } else {
                errorMessage = "HTTP \(result.statusCode)"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }
}
