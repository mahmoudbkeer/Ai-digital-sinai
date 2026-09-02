import SwiftUI
import AiDigitalSinaiCore

@main
struct AiDigitalSinaiApp: App {
    var body: some Scene {
        WindowGroup { LoginView() }
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
                    TextField("البريد الإلكتروني", text: $email)
                    SecureField("كلمة المرور", text: $password)
                    if registerMode {
                        TextField("الاسم", text: $displayName)
                        TextField("اسم النشاط", text: $tenantName)
                    }
                }
                Section {
                    Button(registerMode ? "تسجيل" : "دخول") {
                        Task { await submit() }
                    }
                    .disabled(loading || email.isEmpty || password.isEmpty)
                    Button(registerMode ? "لدي حساب بالفعل" : "إنشاء حساب جديد") {
                        registerMode.toggle()
                        message = ""
                    }
                }
                if loading { ProgressView() }
                if !message.isEmpty { Text(message).foregroundStyle(.blue) }
            }
            .navigationTitle(registerMode ? "إنشاء مساحة عمل" : "تسجيل الدخول")
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
                List(products) { product in
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
        .navigationTitle("Marketplace")
        .task { await loadProducts() }
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
            if !message.isEmpty { Text(message).foregroundStyle(.blue) }
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
