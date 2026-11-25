# Threadbear for Windows with Tauri

This Windows app opens your existing Threadbear web deployment in WebView2.
Sign in as you would in the browser. The runner continues to run separately,
and the app uses the web deployment's features. The web page has no native
Tauri capabilities.

Install Node.js, Rust with the MSVC toolchain, Microsoft C++ Build Tools with
the Desktop development with C++ workload, and WebView2. From the repository:

```powershell
.\windows-shell\build.ps1 -WebUrl https://your-threadbear-web-deployment.example
```

The NSIS installer is built under `windows-shell/src-tauri/target/release/bundle/nsis/`.
Build again if your web deployment's address changes.
