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

    private let api = PlatformAPI(baseURL: URL(string: "http://127.0.0.1:4173")!)

    var body: some View {
        NavigationStack {
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
            message = "HTTP \(result.statusCode) — token: \(session?.token.isEmpty == false ? "received" : "missing"), tenant: \(session?.tenantID ?? "missing")"
        } catch {
            message = "فشل الطلب: \(error.localizedDescription)"
        }
    }
}
