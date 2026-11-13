# Evolve AI — start everything (backend, frontend, CV LangGraph service, MCP-over-HTTP)
# Usage: .\start-all.ps1        (ngrok optional: .\start-all.ps1 -WithNgrok)
param([switch]$WithNgrok)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Start-Service($name, $dir, $arguments) {
    $log = Join-Path $env:TEMP "$name.log"
    Write-Host "Starting $name ..."
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $arguments) -WorkingDirectory $dir -WindowStyle Hidden | Out-Null
    Start-Sleep -Seconds 2
}

Start-Service 'coach-backend' "$root\backend" 'py -m uvicorn app.main:app --port 8001'
Start-Service 'coach-cv-service' "$root\coach-cv-service" 'py -m uvicorn app.main:app --port 8300'
Start-Service 'coach-mcp-http' "$root\mcp-server" 'node src\http.js'
Start-Service 'coach-web' "$root\web" 'npm start'

if ($WithNgrok) {
    Write-Host 'Starting ngrok -> http://localhost:8310 ...'
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm exec -- ngrok http 8310' -WorkingDirectory $root -WindowStyle Hidden | Out-Null
    Start-Sleep -Seconds 4
    Write-Host 'ngrok URL: http://127.0.0.1:4040/api/tunnels'
    try {
        $t = Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 6
        $t.tunnels | ForEach-Object { Write-Host "  $($_.public_url)  ->  $($_.forwarding)" }
    } catch { Write-Host '  (ngrok API not ready — requires authtoken configured: ngrok config add-authtoken <TOKEN>)' }
}

Start-Sleep -Seconds 6
Write-Host ''
Write-Host '--- Ports ---'
foreach ($p in @(3000, 8001, 8300, 8310)) {
    $c = (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Host ("{0,-8} {1}" -f $p, $(if ($c -gt 0) { 'LISTENING' } else { 'down (check logs in %TEMP%)' }))
}
Write-Host ''
Write-Host 'Landing  http://localhost:3000   API http://localhost:8001   MCP-HTTP http://localhost:8310/mcp'
Write-Host 'Langflow endpoint_name : supervisor  (import flows in this order: quality_gate -> specialists -> knowledge_rag -> knowledge_ingest -> supervisor)'
