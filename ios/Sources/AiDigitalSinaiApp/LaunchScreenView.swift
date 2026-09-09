import SwiftUI

struct LaunchScreenView: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 9/255, green: 15/255, blue: 28/255), Color(red: 16/255, green: 22/255, blue: 34/255)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            VStack(spacing: 18) {
                Image("LaunchScreen")
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 300, maxHeight: 540)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityLabel("AI DIGITAL SINAI — NOCTURNE SIGNAL")
    }
}
