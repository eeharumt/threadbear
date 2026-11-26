param(
    [Parameter(Mandatory)]
    [ValidateSet('windows', 'android')]
    [string]$Platform,

    [Parameter(Mandatory)]
    [uri]$Site,

    [switch]$DebugBuild,
    [switch]$SkipInstaller,

    [ValidateSet('aarch64', 'x86_64')]
    [string[]]$AndroidTarget = @('aarch64')
)

$ErrorActionPreference = 'Stop'
if (!$Site.IsAbsoluteUri -or $Site.Scheme -ne 'https' -or $Site.UserInfo -or
    $Site.Query -or $Site.Fragment -or $Site.AbsolutePath -ne '/') {
    throw 'Site must be the HTTPS origin of your hosted Threadbear web app.'
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

$configPath = Join-Path ([IO.Path]::GetTempPath()) "threadbear-tauri-$([guid]::NewGuid()).json"
Push-Location $PSScriptRoot
try {
    if (!(Test-Path 'node_modules/.bin/tauri.cmd')) {
        throw 'Run npm ci --prefix tauri-client from the repository root first.'
    }
    if ($Platform -eq 'android' -and !(Test-Path 'src-tauri/gen/android/gradlew.bat')) {
        Invoke-Tauri android init --ci
    }
    Invoke-Tauri icon '../shared/icons/threadbear.png'

    @{ build = @{ frontendDist = $Site.AbsoluteUri } } |
        ConvertTo-Json -Compress | Set-Content -LiteralPath $configPath -Encoding utf8

    $flags = @('--config', $configPath)
    if ($DebugBuild) { $flags += '--debug' }
    if ($Platform -eq 'android') {
        Invoke-Tauri android build --apk --target $AndroidTarget @flags
    } elseif ($SkipInstaller) {
        Invoke-Tauri build --no-bundle @flags
    } else {
        Invoke-Tauri build --bundles nsis @flags
    }
} finally {
    Remove-Item -LiteralPath $configPath -ErrorAction SilentlyContinue
    Pop-Location
}
