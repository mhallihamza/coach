# Evolve AI — launch everything as detached processes (stay alive after console closes).
# Usage:  .\launch-evolve.ps1
#         .\launch-evolve.ps1 -Ngrok   (also expose MCP via ngrok)
# Requirements: Node 20+, Python 3.15, MongoDB Atlas reachable, ngrok authtoken configured.

param([switch]$Ngrok)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Start-Detached($title, $workdir, $command) {
    Write-Host "Starting $title ..."
    $log = "$env:TEMP\evolve-$($title.ToLower() -replace '[^a-z0-9_-]', '-').log"
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', "cd /d `"$workdir`" && start /B $command > `"$log`" 2>&1" `
        -WindowStyle Hidden | Out-Null
}

Start-Detached 'CV-Service'   "$root\coach-cv-service" 'py -m uvicorn app.main:app --port 8300'
Start-Detached 'Coach-MCP'    "$root\mcp-server"       'node src\http.js'
Start-Detached 'Backend'      "$root\backend"           'py -m uvicorn app.main:app --port 8001'
Start-Detached 'Frontend'     "$root\web"               'npm start'

if ($Ngrok) {
    Write-Host "Starting ngrok → 8310 ..."
    $log = "$env:TEMP\evolve-ngrok.log"
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "cd /d `"$root`" && start /B npm exec -- ngrok http 8310 > `"$log`" 2>&1" -WindowStyle Hidden | Out-Null
    Start-Sleep -Seconds 6
    Write-Host "ngrok public URL (from 127.0.0.1:4040):"
    try {
        $t = Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 6
        $t.tunnels | ForEach-Object { Write-Host "   $($_.public_url)  ->  $($_.forwarding)" }
    } catch { Write-Host '   (ngrok API not ready — check ngrok config: npm exec -- ngrok config check)' }
}

Start-Sleep -Seconds 10

Write-Host ''
Write-Host '--- Status ---'
$ports = @{ 3000 = 'Frontend'; 8001 = 'Backend'; 8300 = 'CV Service'; 8310 = 'coach-mcp (HTTP)' }
foreach ($p in (3000, 8001, 8300, 8310)) {
    $c = (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Host ("{0,-24} {1}" -f "port $p ($($ports[$p]))", $(if ($c -gt 0) { 'LISTENING' } else { 'DOWN' }))
}
Write-Host ''
Write-Host 'Landing : http://localhost:3000'
Write-Host 'Backend : http://127.0.0.1:8001   (health: /api/health)'
Write-Host 'MCP HTTP: http://localhost:8310/mcp  (ready for Langflow)'
Write-Host ''
Write-Host "To stop everything: .\stop-evolve.ps1"
