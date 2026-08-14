#Requires -Version 5.1
<#
  Diagnostic tool: talks to the installed native host directly over its real
  stdio protocol, exactly the way Chrome/Edge would - but without Chrome in the
  loop. This tells us definitively whether the problem is in the host process
  itself, or in how the browser launches/registers it.

  Usage: powershell -ExecutionPolicy Bypass -File test-connection.ps1
#>

$ErrorActionPreference = "Stop"
$HostName = "com.autodownloadconverter.host"
$InstallDir = Join-Path $env:LOCALAPPDATA "AutoDownloadConverterHost"
$WrapperPath = Join-Path $InstallDir "run.cmd"

Write-Host "==> Looking for the installed host at $WrapperPath"
if (-not (Test-Path $WrapperPath)) {
  Write-Host "FAIL: $WrapperPath does not exist. Run install-windows.ps1 first." -ForegroundColor Red
  exit 1
}
Write-Host "OK: found run.cmd"

Write-Host "==> Starting the process exactly as Chrome would (redirected stdin/stdout, no window)..."
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $WrapperPath
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$proc = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Milliseconds 300

if ($proc.HasExited) {
  Write-Host "FAIL: the host process exited immediately (exit code $($proc.ExitCode))." -ForegroundColor Red
  Write-Host "---- stderr ----"
  Write-Host $proc.StandardError.ReadToEnd()
  Write-Host "----------------"
  Write-Host "This means the host crashes on startup regardless of Chrome - the stderr above is the real cause."
  exit 1
}
Write-Host "OK: process started and is still running (PID $($proc.Id))"

Write-Host "==> Sending a real length-prefixed native-messaging ping..."
$json = '{"type":"ping","id":"diag1"}'
$jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$lenBytes = [System.BitConverter]::GetBytes([int32]$jsonBytes.Length)  # little-endian uint32, matches the protocol

$stdin = $proc.StandardInput.BaseStream
$stdin.Write($lenBytes, 0, 4)
$stdin.Write($jsonBytes, 0, $jsonBytes.Length)
$stdin.Flush()

Write-Host "==> Waiting for a response (up to 5 seconds)..."
$stdout = $proc.StandardOutput.BaseStream
$readTask = $null
$respLenBytes = New-Object byte[] 4
$totalRead = 0
$deadline = (Get-Date).AddSeconds(5)
while ($totalRead -lt 4 -and (Get-Date) -lt $deadline) {
  if ($stdout.DataAvailable -or $true) {
    $n = $stdout.Read($respLenBytes, $totalRead, 4 - $totalRead)
    if ($n -gt 0) { $totalRead += $n } else { Start-Sleep -Milliseconds 50 }
  }
}

if ($totalRead -lt 4) {
  Write-Host "FAIL: no response received within 5 seconds." -ForegroundColor Red
  Write-Host "---- stderr so far ----"
  Write-Host $proc.StandardError.ReadToEnd()
  Write-Host "------------------------"
  $proc.Kill()
  exit 1
}

$respLen = [System.BitConverter]::ToInt32($respLenBytes, 0)
$respBytes = New-Object byte[] $respLen
$read = 0
while ($read -lt $respLen) {
  $n = $stdout.Read($respBytes, $read, $respLen - $read)
  if ($n -le 0) { break }
  $read += $n
}
$respJson = [System.Text.Encoding]::UTF8.GetString($respBytes, 0, $read)

Write-Host ""
Write-Host "==> Raw response:" -ForegroundColor Cyan
Write-Host $respJson

if ($respJson -match '"type"\s*:\s*"pong"') {
  Write-Host ""
  Write-Host "SUCCESS: the native host responds correctly to the real wire protocol." -ForegroundColor Green
  Write-Host "This means the host itself is fine - if Chrome still shows 'disconnected unexpectedly',"
  Write-Host "the problem is specifically in how Chrome is launching/registering it (see below)."
} else {
  Write-Host ""
  Write-Host "FAIL: got a response but it wasn't a pong - see the raw response above." -ForegroundColor Red
}

$proc.Kill()
