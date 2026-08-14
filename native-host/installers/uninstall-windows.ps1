$ErrorActionPreference = "SilentlyContinue"
$HostName = "com.autodownloadconverter.host"

Remove-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName" -Recurse -Force
Remove-Item -Path "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName" -Recurse -Force
Remove-Item -Path (Join-Path $env:LOCALAPPDATA "AutoDownloadConverterHost") -Recurse -Force

Write-Host "Done."
