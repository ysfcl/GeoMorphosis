<#
dev-start.ps1

Starts frontend (Next.js), ai-engine (FastAPI) and worker (Node) in separate PowerShell windows.
Usage:
  ./dev-start.ps1            # start services (skips installs if node_modules/venv exist)
  ./dev-start.ps1 -Install   # create venv / install Python & Node deps before starting

# Run this from the repo root or double-click the script. It uses absolute paths based on
# the script location so it works from any cwd.
#>

param(
    [switch]$Install
)

function Load-EnvFile {
    param([string]$path)
    if (-not (Test-Path $path)) { return }
    Get-Content $path | ForEach-Object {
        $_ = $_.Trim()
        if (-not $_ -or $_.StartsWith('#')) { return }
        $parts = $_ -split '=', 2
        if ($parts.Count -lt 2) { return }
        $k = $parts[0].Trim()
        $v = $parts[1].Trim().Trim('"')
        [Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Load env files if present
Load-EnvFile (Join-Path $root '.env')
Load-EnvFile (Join-Path $root 'frontend' '.env')

# Ensure shared SQLite dir (frontend/data) is used by default if GEOMORPHOSIS_DATA_DIR not set
if (-not [Environment]::GetEnvironmentVariable('GEOMORPHOSIS_DATA_DIR', 'Process')) {
    $dataDir = Join-Path $root 'frontend' 'data'
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    [Environment]::SetEnvironmentVariable('GEOMORPHOSIS_DATA_DIR', (Get-Item $dataDir).FullName, 'Process')
}

# Helper to open a new PowerShell window running a command
function Start-Window {
    param([string]$title, [string]$cmd)
    $escaped = $cmd -replace '"', '""'
    Start-Process -FilePath powershell -ArgumentList "-NoExit","-Command","Write-Host '[$title] starting...'; $cmd" -WindowStyle Normal
}

# AI Engine command
$aiPath = Join-Path $root 'ai-engine'
if ($Install) {
    $aiCmd = "cd '$aiPath'; python -m venv venv; .\venv\Scripts\python.exe -m pip install -r requirements.txt; .\venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"
} else {
    $aiCmd = "cd '$aiPath'; if (-not (Test-Path .\venv\Scripts\python.exe)) { Write-Host 'venv missing - consider running with -Install' } ; .\venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"
}

# Frontend command
$fePath = Join-Path $root 'frontend'
$feCmd = "cd '$fePath'; if (-not (Test-Path node_modules)) { npm install } ; npx prisma generate || Write-Host 'prisma generate failed or already done'; npm run dev"

# Worker command
$wkPath = Join-Path $root 'worker'
$wkCmd = "cd '$wkPath'; if (-not (Test-Path node_modules)) { npm install } ; $env:REDIS_HOST='localhost'; $env:AI_ENGINE_URL='http://localhost:8000'; npm start"

Write-Host 'Starting services in new PowerShell windows...'
Start-Window 'AI Engine' $aiCmd
Start-Window 'Frontend' $feCmd
Start-Window 'Worker' $wkCmd

Write-Host 'All start commands launched. Check the new windows for logs.'
