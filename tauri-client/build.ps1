param(
    [Parameter(Mandatory)]
    [ValidateSet('windows', 'android')]
    [string]$Platform,

    # Optional: the Convex deployment a pasted website sign-in link pairs
    # with. The Mac's pairing code names its own deployment.
    [uri]$ConvexUrl,

    [switch]$DebugBuild,
    [switch]$SkipInstaller,

    [ValidateSet('aarch64', 'x86_64')]
    [string[]]$AndroidTarget = @('aarch64')
)

$ErrorActionPreference = 'Stop'
if ($ConvexUrl -and (!$ConvexUrl.IsAbsoluteUri -or $ConvexUrl.Scheme -ne 'https' -or $ConvexUrl.UserInfo -or
    $ConvexUrl.Query -or $ConvexUrl.Fragment -or $ConvexUrl.AbsolutePath -ne '/')) {
    throw "$ConvexUrl must be an HTTPS origin."
}
if ($SkipInstaller -and $Platform -ne 'windows') {
    throw 'SkipInstaller applies to Windows builds only.'
}

function Invoke-Tauri {
    & npm.cmd run tauri -- @args
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri exited with code $LASTEXITCODE."
    }
}

Push-Location $PSScriptRoot
try {
    if (!(Test-Path 'node_modules/.bin/tauri.cmd')) {
        throw 'Run npm ci --prefix tauri-client from the repository root first.'
    }
    if (!(Test-Path '../node_modules/vite')) {
        throw 'The screens build with the repository''s own packages: run npm ci at the repository root first.'
    }
    if ($Platform -eq 'android' -and !(Test-Path 'src-tauri/gen/android/gradlew.bat')) {
        Invoke-Tauri android init --ci
    }
    if ($Platform -eq 'android') {
        Copy-Item -Path 'android/*.kt' -Destination 'src-tauri/gen/android/app/src/main/java/io/github/eeharumt/threadbear/tauri/'
        # Dictation (android/Dictation.kt) needs the microphone, and to see
        # the phone's speech recognizer, which Android 11 hides otherwise.
        $manifest = Join-Path $PSScriptRoot 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'
        $xml = [IO.File]::ReadAllText($manifest)
        if ($xml -notmatch 'RECORD_AUDIO') {
            $internet = '<uses-permission android:name="android.permission.INTERNET" />'
            if (!$xml.Contains($internet)) { throw "$manifest has no INTERNET permission to add the microphone's after." }
            $xml = $xml.Replace($internet, $internet + @'

    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <queries>
        <intent>
            <action android:name="android.speech.RecognitionService" />
        </intent>
    </queries>
'@.TrimEnd())
            [IO.File]::WriteAllText($manifest, $xml)
        }
    }
    Invoke-Tauri icon '../shared/icons/threadbear.png'

    # The screens (phone/), built by tauri.conf.json's beforeBuildCommand.
    $env:VITE_CONVEX_URL = if ($ConvexUrl) { $ConvexUrl.AbsoluteUri.TrimEnd('/') } else { '' }
    $flags = @()
    if ($DebugBuild) { $flags += '--debug' }
    if ($Platform -eq 'android') {
        Invoke-Tauri android build --apk --split-per-abi --target $AndroidTarget @flags
    } elseif ($SkipInstaller) {
        Invoke-Tauri build --no-bundle @flags
    } else {
        Invoke-Tauri build --bundles nsis @flags
    }
} finally {
    Pop-Location
}
