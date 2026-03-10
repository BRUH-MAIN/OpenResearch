[CmdletBinding()]
param(
    [string]$InterfaceAlias = 'Wi-Fi',
    [int]$ClientPort = 3000,
    [int]$ServerPort = 3001,
    [int]$AiPort = 8000,
    [switch]$Raw
)

$ErrorActionPreference = 'Stop'

function Get-PreferredIPv4 {
    param([string]$PreferredInterfaceAlias)

    $preferred = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.InterfaceAlias -eq $PreferredInterfaceAlias -and
            $_.IPAddress -notmatch '^127\.' -and
            $_.IPAddress -notmatch '^169\.254\.'
        } |
        Select-Object -First 1

    if ($preferred) {
        return $preferred
    }

    $fallback = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPv4DefaultGateway -ne $null -and
            $_.IPv4Address -ne $null -and
            $_.NetAdapter.Status -eq 'Up'
        } |
        ForEach-Object {
            [PSCustomObject]@{
                InterfaceAlias = $_.InterfaceAlias
                IPAddress = $_.IPv4Address.IPAddress
            }
        } |
        Where-Object {
            $_.IPAddress -notmatch '^127\.' -and
            $_.IPAddress -notmatch '^169\.254\.'
        } |
        Select-Object -First 1

    return $fallback
}

$match = Get-PreferredIPv4 -PreferredInterfaceAlias $InterfaceAlias

if (-not $match) {
    throw "No active LAN IPv4 address found. Reconnect Wi-Fi and try again."
}

$hostIp = $match.IPAddress
$clientUrl = "http://${hostIp}:${ClientPort}"
$serverUrl = "http://${hostIp}:${ServerPort}/health"
$aiUrl = "http://${hostIp}:${AiPort}/health"
$restartCommand = "powershell -ExecutionPolicy Bypass -File .\scripts\start-multiuser-chat.ps1 -PublicHost ${hostIp}"

if ($Raw) {
    Write-Output $clientUrl
    exit 0
}

Write-Host "Interface: $($match.InterfaceAlias)" -ForegroundColor Cyan
Write-Host "IP:        $hostIp" -ForegroundColor Cyan
Write-Host "" 
Write-Host 'Use these URLs from your phone:' -ForegroundColor Green
Write-Host "  Client:     $clientUrl"
Write-Host "  Server:     $serverUrl"
Write-Host "  AI Service: $aiUrl"
Write-Host ""
Write-Host 'If the Wi-Fi IP changed, restart the stack with:' -ForegroundColor Yellow
Write-Host "  $restartCommand"