# Threadbear Tauri

One app for Windows and Android. It bundles its own screens from `phone/`, a
port of the native Android app's screens (`android-native/`) drawn in React.
They use the website's logic from `web/src` and talk to Convex directly with the
phone API. Pairing, the inbox, a new thread, Settings, and the thread screen
(transcript, cards, reply box, photos, dictation, and menu) are done.

The screens fit the window's width. Below 840px, they show the list or a thread,
one at a time, as the phone does. From 840px, the list and the open thread sit
side by side.

Links out of a thread open in the system browser through the opener plugin. The
`bundled` capability grants the screens `opener:allow-open-url` and
`core:app:default`, so Settings can read the app version.

## Build on Windows

Install Node.js, Rust, the MSVC C++ build tools, and WebView2. For Android, also
install a JDK, the Android SDK and an NDK. Set `JAVA_HOME`, `ANDROID_HOME`, and
`NDK_HOME` for the build shell. Run these commands from the repository root with
PowerShell.

```powershell
npm ci
npm ci --prefix tauri-client
./tauri-client/build.ps1 -Platform windows

rustup target add aarch64-linux-android
./tauri-client/build.ps1 -Platform android -DebugBuild
```

The Windows installer is under `src-tauri/target/release/bundle/nsis/`.
The Android command makes a debug-signed arm64 APK under
`src-tauri/gen/android/app/build/outputs/apk/`. For an x64 emulator, install
the Rust target `x86_64-linux-android` and add `-AndroidTarget x86_64`.
All paths are relative to this directory. The build generates the icons and
Android project locally.

The build copies `android/MainActivity.kt` into the generated Android project.
It reserves room for the system bars, display cutout, and software keyboard.

Pair by pasting the pairing code from the Mac's Settings, Phone & browser. A
website sign-in link also works if the build was given the Convex deployment it
belongs to with `-ConvexUrl`.

On Windows, open the View menu to choose a zoom level between 80% and 150%.
Choose 100% (Actual size) to reset it.

## Develop

`npm run tauri dev`, run in this directory, opens the app on Windows with the
screens served by Vite, so a change to them shows at once.

To look at the screens in a browser, run
`npx vite --config tauri-client/phone/vite.config.mts` from the repository root.
Open `/demo.html` to see the inbox with sample rows and no server. Add `?thread`
to open a thread, and `&card=asks`, `approval`, or `working` to change what it
waits on. Make the window wider than 840px to see both panes.
After the native app's `Icons.kt` or `ShellIcons.kt` changes, run
`node tauri-client/phone/scripts/icons.mjs` to regenerate the icons.

The Android emulator can't resolve tailnet names such as `*.ts.net`. To reach a
self-hosted backend on the tailnet from an emulator with a Google APIs image,
add the name to its hosts file after each boot:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb root; & $adb wait-for-device
& $adb shell "cp /system/etc/hosts /data/local/tmp/hosts && echo '<tailnet IP> <name>' >> /data/local/tmp/hosts && chcon u:object_r:system_file:s0 /data/local/tmp/hosts && mount --bind /data/local/tmp/hosts /system/etc/hosts"
```

Android background push and the QR scanner still need native integration
before this can replace the native Android app.

[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
