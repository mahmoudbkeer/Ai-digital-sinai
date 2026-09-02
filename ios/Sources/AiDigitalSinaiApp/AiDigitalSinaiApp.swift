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
                ContentUnavailableView("تعذر تحميل Marketplace", systemImage: "exclamationmark.triangle", description: Text(errorMessage))
            } else if products.isEmpty {
                ContentUnavailableView("لا توجد منتجات منشورة", systemImage: "shippingbox")
            } else {
                List(products) { product in
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
