import SwiftUI
import AiDigitalSinaiCore

@main
struct AiDigitalSinaiApp: App {
    @State private var showSplash = true

    var body: some Scene {
        WindowGroup {
            ZStack {
                LoginView()
                    .tint(DesignTokens.sinaiTide)
                    .environment(\.layoutDirection, Locale.current.language.languageCode?.identifier == "ar" ? .rightToLeft : .leftToRight)
                if showSplash {
                    LaunchScreenView()
                        .transition(.opacity)
                        .task {
                            try? await Task.sleep(for: .milliseconds(650))
                            withAnimation(.easeOut(duration: 0.22)) { showSplash = false }
                        }
                }
            }
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
    @State private var showAuth = false
    @State private var pendingAction: String?
    private let api = PlatformAPI(baseURL: URL(string: "http://127.0.0.1:4173")!)

    var body: some View {
        MarketplaceView(api: api, onProtectedAction: { action in
            pendingAction = action
            showAuth = true
        })
        .sheet(isPresented: $showAuth) { authSheet }
        .onAppear { restoreSession() }
    }

    private var authSheet: some View {
        NavigationStack {
            Form {
                Section("AI DIGITAL SINAI") {
                    TextField("البريد الإلكتروني", text: $email)
                    SecureField("كلمة المرور", text: $password)
                    if registerMode { TextField("الاسم", text: $displayName); TextField("اسم النشاط", text: $tenantName) }
                }
                Section {
                    Button(registerMode ? "إنشاء الحساب" : "دخول") { Task { await submit() } }.disabled(loading || email.isEmpty || password.isEmpty)
                    Button(registerMode ? "لدي حساب بالفعل" : "إنشاء حساب جديد") { registerMode.toggle(); message = "" }
                }
                if loading { ProgressView() }
                if !message.isEmpty { Text(message).foregroundStyle(DesignTokens.sinaiTide) }
            }
            .navigationTitle(registerMode ? "إنشاء حساب" : "تسجيل الدخول")
        }
    }

    private func restoreSession() {
        if let token = UserDefaults.standard.string(forKey: "platform_token") {
            let tenant = UserDefaults.standard.string(forKey: "platform_tenant_id")
            api.setAuthSession(AuthSession(token: token, tenantID: tenant, branchID: nil))
        }
    }

    private func submit() async {
        loading = true; defer { loading = false }
        do {
            let result: (APIResult, AuthSession?) = registerMode
                ? try await api.register(email: email, password: password, displayName: displayName, tenantName: tenantName)
                : try await api.login(email: email, password: password)
            guard let session = result.1 else { message = "تعذر المصادقة (HTTP \(result.0.statusCode))."; return }
            UserDefaults.standard.set(session.token, forKey: "platform_token")
            if let tenant = session.tenantID { UserDefaults.standard.set(tenant, forKey: "platform_tenant_id") }
            showAuth = false
            if pendingAction != nil { pendingAction = nil }
        } catch { message = "فشل الطلب: \(error.localizedDescription)" }
    }
}

struct MarketplaceView: View {
    let api: PlatformAPI
    let onProtectedAction: (String) -> Void
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.openURL) private var openURL
    @State private var businesses: [MarketplaceBusiness] = []
    @State private var directoryQuery = ""
    @State private var category = "الكل"
    @State private var directoryLoading = true
    @State private var directoryError = ""
    @State private var products: [MarketplaceProduct] = []
    @State private var productLoading = true
    @State private var searchResults: [MarketplaceBusiness] = []
    @State private var assistantQuery = ""
    @State private var assistantMessage = ""
    @State private var searching = false
    private let categories = ["الكل", "الصحة والطب", "المقاولات والحرف", "التعليم والتدريب", "المطاعم والأغذية", "السيارات", "الخدمات الرقمية", "الأزياء والجمال"]

    var body: some View {
        List {
            Section { VStack(alignment: .leading, spacing: 8) { Text("AI DIGITAL SINAI").font(.caption).tracking(2).foregroundStyle(DesignTokens.sinaiTide); Text("NOCTURNE SIGNAL").font(.title2.bold()); Text("تصفح دليل سيناء كضيف — سجّل الدخول فقط عند الإجراء المحمي.").foregroundStyle(.secondary) }.padding(.vertical, 8) }
            Section("استكشف دليل سيناء") {
                TextField("ابحث عن نشاط أو خدمة أو حي", text: $directoryQuery).textFieldStyle(.roundedBorder)
                ScrollView(.horizontal, showsIndicators: false) { HStack { ForEach(categories, id: \.self) { item in MarketplaceCategoryButton(title: item, selected: category == item) { selectCategory(item) } } } }
                if directoryLoading { ProgressView("جارٍ تحميل الأنشطة المعتمدة…") }
                if !directoryError.isEmpty { Text(directoryError).foregroundStyle(DesignTokens.error) }
                ForEach(businesses) { business in BusinessDirectoryRow(business: business, openURL: openURL, onProtectedAction: onProtectedAction) }
                if !directoryLoading && businesses.isEmpty && directoryError.isEmpty { Text("لا توجد منشآت أو خدمات معتمدة لهذا البحث.").foregroundStyle(.secondary) }
            }
            Section("المساعد الذكي المرتبط بالبحث") {
                TextField("مثال: صيدلية أو مطعم", text: $assistantQuery).textFieldStyle(.roundedBorder)
                Button("ابحث في Marketplace") { Task { await runAssistant() } }.disabled(searching || assistantQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if searching { ProgressView("جارٍ البحث…") }
                if !assistantMessage.isEmpty { Text(assistantMessage).foregroundStyle(DesignTokens.sinaiTide) }
                ForEach(searchResults) { business in BusinessDirectoryRow(business: business, openURL: openURL, onProtectedAction: onProtectedAction) }
            }
            Section("المنتجات") {
                if productLoading { ProgressView("تحميل المنتجات…") }
                else if products.isEmpty { Text("لا توجد منتجات منشورة").foregroundStyle(.secondary) }
                else { ForEach(products) { product in NavigationLink { ProductDetailView(api: api, productId: product.id) } label: { VStack(alignment: .leading) { Text(product.name).font(.headline); Text(product.category ?? "خدمات متنوعة").font(.caption); Text(String(format: "%.2f %@", Double(product.priceCents) / 100.0, product.currency)).foregroundStyle(DesignTokens.sinaiTide) } } } }
            }
        }
        .navigationTitle("Marketplace")
        .frame(maxWidth: horizontalSizeClass == .regular ? 960 : .infinity)
        .frame(maxWidth: .infinity)
        .toolbar { ToolbarItemGroup(placement: .automatic) { NavigationLink("الإشعارات") { NotificationsView(api: api) }; NavigationLink("Analytics") { AnalyticsView(api: api) }; NavigationLink("Subscription") { SubscriptionView(api: api) } } }
        .searchable(text: $directoryQuery, prompt: "ابحث في دليل سيناء")
        .task { await loadDirectory(); await loadProducts() }
        .onChange(of: directoryQuery) { _ in Task { await loadDirectory() } }
    }
    private func loadDirectory() async { directoryLoading = true; directoryError = ""; do { let (result, loaded) = try await api.marketplaceDirectory(query: directoryQuery, category: category == "الكل" ? "" : category); businesses = loaded; if !(200..<300).contains(result.statusCode) { directoryError = "HTTP \(result.statusCode)" } } catch { directoryError = error.localizedDescription }; directoryLoading = false }
    private func selectCategory(_ item: String) { category = item; Task { await loadDirectory() } }
    private func runAssistant() async { searching = true; assistantMessage = "جارٍ البحث في الأنشطة والخدمات المنشورة فعليًا…"; do { let (_, loaded) = try await api.marketplaceDirectory(query: assistantQuery); searchResults = loaded; assistantMessage = loaded.isEmpty ? "لم أجد نشاطًا مطابقًا." : "وجدت \(loaded.count) نتيجة مطابقة." } catch { assistantMessage = error.localizedDescription }; searching = false }
    private func loadProducts() async { defer { productLoading = false }; if let (_, loaded) = try? await api.products() { products = loaded } }
}
private struct MarketplaceCategoryButton: View { let title: String; let selected: Bool; let action: () -> Void; var body: some View { Button(title, action: action).buttonStyle(.borderedProminent).tint(selected ? DesignTokens.sinaiTide : .gray) } }
private struct BusinessDirectoryRow: View {
    let business: MarketplaceBusiness
    let openURL: OpenURLAction
    let onProtectedAction: (String) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack { Text(business.name).font(.headline); Spacer(); Text(isOpen(business.hoursJSON) ? "● مفتوح الآن" : "مغلق حاليًا").font(.caption).foregroundStyle(isOpen(business.hoursJSON) ? DesignTokens.success : DesignTokens.error) }
            Text("\(business.offeringName) · \(business.district)").font(.subheadline).foregroundStyle(DesignTokens.sinaiTide)
            Text(business.description.isEmpty ? "نشاط معتمد داخل Marketplace." : business.description).lineLimit(3)
            Text("\(business.reviews) تقييم · \(business.rating.map { String(format: "%.1f", $0) } ?? "—") · \(formatHours(business.hoursJSON))").font(.caption).foregroundStyle(.secondary)
            HStack {
                if let phone = business.phone, let url = URL(string: "tel:+\(phone)") { Button("اتصال") { openURL(url) }.buttonStyle(.borderedProminent) }
                if let whatsapp = business.whatsapp, let url = URL(string: "https://wa.me/\(whatsapp)") { Button("واتساب") { openURL(url) }.buttonStyle(.bordered) }
            }
            Button("حجز أو إضافة للسلة") { onProtectedAction("cart:\(business.id)") }.buttonStyle(.bordered)
        }.padding(.vertical, 7)
    }
}

private func parseHours(_ value: String?) -> [String: Any]? { guard let value, let data = value.data(using: .utf8) else { return nil }; return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] }
private func todayKey() -> String { ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][Calendar.current.component(.weekday, from: Date()) - 1] }
private func hoursEntry(_ value: String?) -> String? { guard let hours = parseHours(value) else { return nil }; let entry = hours[todayKey()] ?? hours["daily"]; if let text = entry as? String { return text }; if let object = entry as? [String: Any], let open = object["open"] as? String, let close = object["close"] as? String { return "\(open)-\(close)" }; return nil }
private func formatHours(_ value: String?) -> String { hoursEntry(value) ?? "الساعات غير مسجلة" }
private func isOpen(_ value: String?) -> Bool { guard let raw = hoursEntry(value), raw != "24h", raw != "24 ساعة" else { return hoursEntry(value) != nil }; let p = raw.replacingOccurrences(of: "–", with: "-").split(separator: "-").map(String.init); guard p.count == 2 else { return false }; func mins(_ s: String) -> Int? { let a = s.split(separator: ":").compactMap { Int($0) }; return a.count == 2 ? a[0] * 60 + a[1] : nil }; guard let open = mins(p[0]), let close = mins(p[1]) else { return false }; let now = Calendar.current.component(.hour, from: Date()) * 60 + Calendar.current.component(.minute, from: Date()); return close < open ? now >= open || now <= close : now >= open && now <= close }


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
