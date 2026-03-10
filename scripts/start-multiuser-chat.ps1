[CmdletBinding()]
param(
    [switch]$Dev,
    [switch]$NoBuild,
    [switch]$Seed,
    [switch]$Verify,
    [switch]$Reset,
    [string]$PublicHost = 'localhost'
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot '.env.docker'
$composeFiles = @('-f', 'docker-compose.yml')

if ($Dev) {
    $composeFiles += @('-f', 'docker-compose.dev.yml')
}

Assert-Command 'docker'

if (-not (Test-Path $envFile)) {
    throw "Missing .env.docker. Copy .env.docker.example to .env.docker and fill in JWT secrets and GROQ_API_KEY first."
}

$env:PUBLIC_HOST = $PublicHost

Push-Location $repoRoot
try {
    if ($Reset) {
        Write-Step 'Stopping containers and removing volumes'
        & docker compose @composeFiles down -v
    }

    $composeArgs = @('compose') + $composeFiles + @('up', '-d')
    if (-not $NoBuild) {
        $composeArgs += '--build'
    }

    Write-Step "Starting stack ($([string]::Join(' ', $composeFiles))) for host '$PublicHost'"
    & docker @composeArgs

    Write-Step 'Current container status'
    & docker compose @composeFiles ps

    Write-Step 'Waiting for server health endpoint'
    $serverHealthy = $false
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        try {
            $response = Invoke-RestMethod -Uri 'http://localhost:3001/health' -TimeoutSec 5
            if ($response.status -eq 'healthy') {
                $serverHealthy = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 2
        }
        Start-Sleep -Seconds 2
    }

    if (-not $serverHealthy) {
        Write-Warning 'Server did not report healthy within the wait window.'
    }

    Write-Step 'Waiting for AI health endpoint'
    $aiHealthy = $false
    for ($attempt = 1; $attempt -le 90; $attempt++) {
        try {
            $response = Invoke-RestMethod -Uri 'http://localhost:8000/health' -TimeoutSec 5
            if ($response.status -eq 'healthy') {
                $aiHealthy = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 5
        }
        Start-Sleep -Seconds 1
    }

    if (-not $aiHealthy) {
        Write-Warning 'AI service did not report healthy within the wait window. Check: docker compose logs -f ai-service'
    }

    if ($Seed) {
        Write-Step 'Seeding deterministic multi-user test data'
        & docker compose @composeFiles exec server npm run db:seed:prod
    }

    if ($Verify) {
        Write-Step 'Running AI stack verification script inside Git Bash/WSL-compatible shell if available is recommended'
        Write-Host 'Manual verification URLs:' -ForegroundColor Green
        Write-Host "  Client:     http://${PublicHost}:3000"
        Write-Host "  Server:     http://${PublicHost}:3001/health"
        Write-Host "  AI Service: http://${PublicHost}:8000/health"
    }

    Write-Host ''
    Write-Host 'Stack startup complete.' -ForegroundColor Green
    Write-Host 'Recommended next steps:' -ForegroundColor Green
    Write-Host '  1. docker compose ps'
    Write-Host '  2. docker compose exec server npm run db:seed:prod   (if not already seeded)'
    Write-Host "  3. Open http://${PublicHost}:3000 and sign in as alice@example.com / password123"
    Write-Host '  4. Use a second browser profile with bob@example.com / password123'
}
finally {
    Pop-Location
}