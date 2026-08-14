#Requires -Version 5.1
<#
  Installs the Auto Download Converter native messaging host for Chrome and/or
  Edge on Windows. Safe to re-run.
  Usage: powershell -ExecutionPolicy Bypass -File install-windows.ps1
#>

$ErrorActionPreference = "Stop"

$HostName = "com.autodownloadconverter.host"
$ExtensionId = "ffcbbkihmgommfpkcllgbciddbhnamol"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NativeHostRoot = Split-Path -Parent $ScriptDir
$InstallDir = Join-Path $env:LOCALAPPDATA "AutoDownloadConverterHost"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js (>=18) is required but was not found on PATH. Install it from https://nodejs.org and re-run this script."
  exit 1
}

Write-Host "==> Installing dependencies and building the native host..."
Push-Location $NativeHostRoot
npm install --no-audit --no-fund
npm run build
Pop-Location

Write-Host "==> Copying built host to $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Recurse -Force (Join-Path $NativeHostRoot "dist") $InstallDir

$WrapperPath = Join-Path $InstallDir "run.cmd"
$NodePath = (Get-Command node).Source
$IndexJs = Join-Path $InstallDir "dist\index.js"
@"
@echo off
"$NodePath" "$IndexJs"
"@ | Set-Content -Encoding ASCII $WrapperPath

$ManifestPath = Join-Path $InstallDir "$HostName.json"
$ManifestObj = [ordered]@{
  name             = $HostName
  description      = "Auto Download Converter native messaging host"
  path             = $WrapperPath
  type             = "stdio"
  allowed_origins  = @("chrome-extension://$ExtensionId/")
}
$ManifestJson = $ManifestObj | ConvertTo-Json
# IMPORTANT: Set-Content -Encoding UTF8 in Windows PowerShell 5.1 writes a UTF-8 BOM,
# which makes Chrome/Edge's native-messaging manifest JSON parser fail to read the file -
# this surfaces to the user as "Specified native messaging host not found", not as a
# JSON error, so it's easy to misdiagnose as a missing/wrong registration instead of an
# encoding bug. Write the file explicitly without a BOM instead.
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($ManifestPath, $ManifestJson, $Utf8NoBom)
Write-Host "==> Wrote manifest (UTF-8, no BOM): $ManifestPath"

function Register-NativeHost($RegRoot) {
  $keyPath = "$RegRoot\NativeMessagingHosts\$HostName"
  New-Item -Path $keyPath -Force | Out-Null
  # Set-ItemProperty -Name "(Default)" is unreliable across PowerShell versions for
  # setting a registry key's true (unnamed) default value - Set-Item is the documented,
  # reliable way to do this.
  Set-Item -Path $keyPath -Value $ManifestPath
  Write-Host "==> Registered under $keyPath"
}

Register-NativeHost "HKCU:\Software\Google\Chrome"
Register-NativeHost "HKCU:\Software\Microsoft\Edge"

Write-Host ""
Write-Host "==> Verifying installation..."
$verifyFailed = $false

if (-not (Test-Path $ManifestPath)) {
  Write-Host "  FAIL: manifest file missing at $ManifestPath" -ForegroundColor Red
  $verifyFailed = $true
} else {
  $bytes = [System.IO.File]::ReadAllBytes($ManifestPath)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Write-Host "  FAIL: manifest file still has a UTF-8 BOM" -ForegroundColor Red
    $verifyFailed = $true
  } else {
    try {
      Get-Content $ManifestPath -Raw | ConvertFrom-Json | Out-Null
      Write-Host "  OK: manifest is valid, BOM-free JSON"
    } catch {
      Write-Host "  FAIL: manifest is not valid JSON: $_" -ForegroundColor Red
      $verifyFailed = $true
    }
  }
}

foreach ($regRoot in @("HKCU:\Software\Google\Chrome", "HKCU:\Software\Microsoft\Edge")) {
  $keyPath = "$regRoot\NativeMessagingHosts\$HostName"
  $readBack = (Get-Item -Path $keyPath -ErrorAction SilentlyContinue).GetValue("")
  if ($readBack -eq $ManifestPath) {
    Write-Host "  OK: $keyPath -> $readBack"
  } else {
    Write-Host "  FAIL: $keyPath default value is '$readBack', expected '$ManifestPath'" -ForegroundColor Red
    $verifyFailed = $true
  }
}

if ($verifyFailed) {
  Write-Host ""
  Write-Host "Installation verification FAILED - see FAIL lines above before reporting the extension still can't connect." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Verified OK. Reload the extension, then check Options -> Engines to confirm the native host is detected."
Write-Host "If your extension ID differs from $ExtensionId, edit $ManifestPath's allowed_origins and re-run this script."
