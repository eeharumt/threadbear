param(
    [Parameter(Mandatory)]
    [uri]$WebUrl
)

$ErrorActionPreference = 'Stop'
if (-not $WebUrl.IsAbsoluteUri -or $WebUrl.Scheme -ne 'https' -or $WebUrl.UserInfo -or $WebUrl.Query -or $WebUrl.Fragment) {
    throw 'Supply the HTTPS address of the Threadbear web deployment, without credentials, query or fragment.'
}

$configPath = Join-Path ([IO.Path]::GetTempPath()) ("threadbear-tauri-{0}.json" -f [guid]::NewGuid())
$config = @{
    build = @{ frontendDist = $WebUrl.AbsoluteUri }
    app = @{
        windows = @(@{ label = 'main'; title = 'Threadbear'; url = $WebUrl.AbsoluteUri; width = 1200; height = 800 })
    }
}

Push-Location $PSScriptRoot
try {
    [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 5))
    & npx.cmd --yes '@tauri-apps/cli@2.12.6' build --config $configPath
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri build failed (exit code $LASTEXITCODE)."
    }
} finally {
    Pop-Location
    Remove-Item -LiteralPath $configPath -ErrorAction SilentlyContinue
}
