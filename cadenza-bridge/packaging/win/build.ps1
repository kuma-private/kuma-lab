# Build a signed Cadenza Bridge .msi on Windows.
#
# Env / params:
#   WINDOWS_CODESIGN_PFX     Path to .pfx  (optional — skip codesign if absent)
#   WINDOWS_CODESIGN_PASSWORD Password for the .pfx
#   BRIDGE_VERSION           Override version string (default 0.1.0)
#   SKIP_MSI=1               Produce just the exe pair, no MSI
#
# Runs on Windows (PowerShell) with cargo, signtool, and WiX (candle/light)
# available on PATH. The WiX bits are optional — if candle is missing the
# script still produces a zip bundle that can be dragged into the Run key.

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$BridgeRoot = Join-Path $Root "cadenza-bridge"
$Pkg = Join-Path $BridgeRoot "packaging\win"
$Build = Join-Path $BridgeRoot "target\release-win"
$Version = if ($env:BRIDGE_VERSION) { $env:BRIDGE_VERSION } else { "0.1.0" }
$Msi = Join-Path $Build "Cadenza-Bridge-$Version.msi"

Write-Host "[build.ps1] ROOT=$Root"
Write-Host "[build.ps1] VERSION=$Version"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "cargo not in PATH. install Rust first."
}

Set-Location $BridgeRoot

Write-Host "[build.ps1] cargo build --release (x86_64-pc-windows-msvc)"
cargo build --release --target x86_64-pc-windows-msvc --bin cadenza-bridge
if ($LASTEXITCODE -ne 0) { throw "cargo build (cadenza-bridge) failed" }
cargo build --release --target x86_64-pc-windows-msvc --bin cadenza-watchdog
if ($LASTEXITCODE -ne 0) { throw "cargo build (cadenza-watchdog) failed" }

New-Item -ItemType Directory -Force -Path $Build | Out-Null

$BridgeExe = Join-Path $BridgeRoot "target\x86_64-pc-windows-msvc\release\cadenza-bridge.exe"
$WatchdogExe = Join-Path $BridgeRoot "target\x86_64-pc-windows-msvc\release\cadenza-watchdog.exe"
$StageBridge = Join-Path $Build "cadenza-bridge.exe"
$StageWatchdog = Join-Path $Build "cadenza-watchdog.exe"

Copy-Item -Force $BridgeExe $StageBridge
Copy-Item -Force $WatchdogExe $StageWatchdog

if ($env:WINDOWS_CODESIGN_PFX) {
    Write-Host "[build.ps1] codesigning binaries"
    if (-not (Get-Command signtool -ErrorAction SilentlyContinue)) {
        throw "signtool not in PATH — install the Windows SDK"
    }
    signtool sign /f "$($env:WINDOWS_CODESIGN_PFX)" /p "$($env:WINDOWS_CODESIGN_PASSWORD)" `
        /tr http://timestamp.digicert.com /td sha256 /fd sha256 $StageBridge
    if ($LASTEXITCODE -ne 0) { throw "signtool failed for cadenza-bridge" }
    signtool sign /f "$($env:WINDOWS_CODESIGN_PFX)" /p "$($env:WINDOWS_CODESIGN_PASSWORD)" `
        /tr http://timestamp.digicert.com /td sha256 /fd sha256 $StageWatchdog
    if ($LASTEXITCODE -ne 0) { throw "signtool failed for cadenza-watchdog" }
} else {
    Write-Host "[build.ps1] WINDOWS_CODESIGN_PFX not set — skipping signtool"
}

if ($env:SKIP_MSI -eq "1") {
    Write-Host "[build.ps1] SKIP_MSI=1 — finished with exes at $Build"
    exit 0
}

$Candle = Get-Command candle -ErrorAction SilentlyContinue
$Light = Get-Command light -ErrorAction SilentlyContinue
if (-not $Candle -or -not $Light) {
    Write-Host "[build.ps1] WiX (candle/light) not found — packaging as zip instead"
    $Zip = Join-Path $Build "Cadenza-Bridge-$Version.zip"
    if (Test-Path $Zip) { Remove-Item $Zip }
    Compress-Archive -Path $StageBridge, $StageWatchdog -DestinationPath $Zip
    Write-Host "[build.ps1] wrote $Zip"
    exit 0
}

Write-Host "[build.ps1] running WiX candle/light"
$Wxs = Join-Path $Pkg "installer.wxs"
$Wixobj = Join-Path $Build "installer.wixobj"
& $Candle.Source -dBridgeExe="$StageBridge" -dWatchdogExe="$StageWatchdog" `
    -dVersion="$Version" -out "$Wixobj" "$Wxs"
if ($LASTEXITCODE -ne 0) { throw "candle failed" }

& $Light.Source -ext WixUIExtension -out "$Msi" "$Wixobj"
if ($LASTEXITCODE -ne 0) { throw "light failed" }

if ($env:WINDOWS_CODESIGN_PFX) {
    signtool sign /f "$($env:WINDOWS_CODESIGN_PFX)" /p "$($env:WINDOWS_CODESIGN_PASSWORD)" `
        /tr http://timestamp.digicert.com /td sha256 /fd sha256 $Msi
    if ($LASTEXITCODE -ne 0) { throw "signtool failed for msi" }
}

$Size = (Get-Item $Msi).Length
Write-Host "[build.ps1] done: $Msi ($Size bytes)"
