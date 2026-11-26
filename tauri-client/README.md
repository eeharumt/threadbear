# Threadbear Tauri

This project opens the same hosted Threadbear web app in WebView2 on Windows and
in Android WebView. The web deployment owns the UI, sign-in, and Convex connection.
The client has a separate application ID and grants the site no Tauri permissions.

## Build on Windows

Install Node.js, Rust, the MSVC C++ build tools, and WebView2. For Android, also
install a JDK, the Android SDK and an NDK. Set `JAVA_HOME`, `ANDROID_HOME`, and
`NDK_HOME` for the build shell. Run these commands from the repository root with
PowerShell and replace the example origin with your own Threadbear web origin.

```powershell
$site = 'https://threadbear.example.com'
npm ci --prefix tauri-client
./tauri-client/build.ps1 -Platform windows -Site $site

rustup target add aarch64-linux-android
./tauri-client/build.ps1 -Platform android -Site $site -DebugBuild
```

The Windows installer is under `src-tauri/target/release/bundle/nsis/`.
The Android command makes a debug-signed arm64 APK under
`src-tauri/gen/android/app/build/outputs/apk/`. For an x64 emulator, install
the Rust target `x86_64-linux-android` and add `-AndroidTarget x86_64`.
All paths are relative to this directory. The build generates the icons and
Android project locally.

The build copies `android/MainActivity.kt` into the generated Android project.
It reserves room for the system bars, display cutout, and software keyboard.

To sign in, paste a one-time link for the same site into the app's sign-in form.
Copy the link before opening it in another browser, since the link works once.

The prototype shares the functionality available on the web. Android background
push and any other native-only flows need separate integration and testing before
this can replace the native Android app.

[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
