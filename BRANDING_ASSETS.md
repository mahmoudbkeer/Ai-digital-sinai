# Nocturne Signal mobile branding

The native mobile apps now use a single source-controlled Nocturne Signal mark: a cyan signal burst inside a gold rounded frame on a deep navy field. The source vectors are in `brand/` and the generated raster assets are checked in for deterministic builds.

## Android

`@mipmap/ic_launcher` and `@mipmap/ic_launcher_round` are adaptive icons with the Nocturne navy background and cyan/gold foreground mark. Android 12+ uses `windowSplashScreenBackground` and the branded foreground vector; older Android versions use the branded `windowBackground` layer-list. The application label is `AI DIGITAL SINAI`.

## iOS

The Swift Package executable processes `Resources/Branding`. `LaunchScreenView` provides the final branded launch surface and the app root presents it before the existing marketplace shell. The universal app-icon source and asset metadata are included under `Resources/Branding/AppIcon.appiconset`.

## Verification

Run `python3 scripts/generate-brand-assets.py` to reproduce the images, `./gradlew :app:assembleDebug` for Android, and `swift test` from `ios/` for the package tests. The generated preview is `brand/nocturne-signal-preview.png`.
