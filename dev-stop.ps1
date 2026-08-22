<#
dev-stop.ps1
Stops GeoMorphosis services started by dev-start.ps1 or dev-start.sh.
- Attempts graceful stop, then forcefully kills if necessary.
#>

[CmdletBinding()]
param()

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Stop-ByCommandMatch {
    param(
        [string]$Name,
        [string[]]$Patterns
    )
    $found = $false
    foreach ($p in $Patterns) {
        # Use CIM to inspect process CommandLine
        $matches = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and ($_.CommandLine -match $p) }
        foreach ($m in $matches) {
            $found = $true
            $pid = $m.ProcessId
            Write-Host "Stopping [$Name] pid=$pid (`$m.CommandLine` truncated)..."
            try {
                Stop-Process -Id $pid -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
                if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
                    Write-Host "Process $pid did not exit, forcing..."
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                }
                Write-Host "Stopped $Name pid=$pid"
            }
            catch {
                Write-Warning "Failed stopping pid=$pid: $_"
            }
        }
    }
    if (-not $found) { Write-Host "No matching processes found for $Name" }
}

Write-Host "Stopping GeoMorphosis services..."

# ai-engine: look for uvicorn or python running main:app
Stop-ByCommandMatch -Name "ai-engine" -Patterns @("uvicorn", "main:app", "-m uvicorn")

# frontend: next dev or npm run dev
Stop-ByCommandMatch -Name "frontend" -Patterns @("npm run dev", "next dev", "\\bnext\\b")

# worker: npm start or node index.js inside worker folder
Stop-ByCommandMatch -Name "worker" -Patterns @("npm start", "node .*index.js", "\\bworker\\b")

# Additionally try to stop processes whose command line contains repository paths
$escapedRoot = [Regex]::Escape($root)
Stop-ByCommandMatch -Name "by-path-frontend" -Patterns @($escapedRoot + ".*frontend")
Stop-ByCommandMatch -Name "by-path-worker" -Patterns @($escapedRoot + ".*worker")
Stop-ByCommandMatch -Name "by-path-ai" -Patterns @($escapedRoot + ".*ai-engine")

Write-Host "Stop sequence complete."

Exit 0
