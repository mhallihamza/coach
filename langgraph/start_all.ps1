#langgraph/start_all.ps1 — starts the full local LangGraph agent system
# Usage:  powershell -ExecutionPolicy Bypass -File start_all.ps1
# Ports:  supervisor=8020  self_discovery=8501  skills_assessment=8502  development_planner=8503
#         progress_reflection=8504  cv_gap_analysis=8505  quality_gate=8506  knowledge_rag=8507
# MCP (tool layer) expected on 8310 (node src/http.js).

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PYTHONPATH = $root

function Start-Agent($name, $port) {
  $env:AGENT_SERVICE_NAME = $name
  Start-Process -FilePath py -ArgumentList '-m','uvicorn','agents.service:app','--port',"$port" -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  Write-Host ("  started {0,-24} :{1}" -f $name, $port)
}

# start MCP first if not already running
$mcp = $null
$mcp = Get-NetTCPConnection -LocalPort 8310 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
if ($mcp) {
  Write-Host "MCP already listening on 8310 (pid $($mcp))" -ForegroundColor Green
} else {
  Write-Host "starting MCP on 8310..."
  Start-Process -FilePath node -ArgumentList 'src/http.js' -WorkingDirectory "C:\Users\PC\Desktop\Coach\mcp-server" -WindowStyle Hidden | Out-Null
}

# start backend + CV service if not already running
$be = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
if ($be) {
  Write-Host "backend already listening on 8001 (pid $be)" -ForegroundColor Green
} else {
  Write-Host "starting backend on 8001..."
  Start-Process -FilePath py -ArgumentList '-m','uvicorn','app.main:app','--port','8001' -WorkingDirectory "C:\Users\PC\Desktop\Coach\backend" -WindowStyle Hidden | Out-Null
}
$cvs = Get-NetTCPConnection -LocalPort 8300 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
if ($cvs) {
  Write-Host "CV service already listening on 8300 (pid $cvs)" -ForegroundColor Green
} else {
  Write-Host "starting CV service on 8300..."
  Start-Process -FilePath py -ArgumentList '-m','uvicorn','app.main:app','--port','8300' -WorkingDirectory "C:\Users\PC\Desktop\Coach\coach-cv-service" -WindowStyle Hidden | Out-Null
}

# start one uvicorn per agent
$agents = @(
  @{ n='self_discovery'; p=8501 },
  @{ n='skills_assessment'; p=8502 },
  @{ n='development_planner'; p=8503 },
  @{ n='progress_reflection'; p=8504 },
  @{ n='cv_gap_analysis'; p=8505 },
  @{ n='quality_gate'; p=8506 },
  @{ n='knowledge_rag'; p=8507 }
)

foreach ($a in $agents) {
  Start-Agent $a.n $a.p
}

# start the supervisor
$env:AGENT_SERVICE_NAME = 'supervisor'
Start-Process -FilePath py -ArgumentList '-m','uvicorn','supervisor.main:app','--port','8020' -WorkingDirectory $root -WindowStyle Hidden | Out-Null
Write-Host "  started supervisor           :8020"

Start-Sleep -Seconds 8

try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8001/api/health' -UseBasicParsing -TimeoutSec 6; Write-Host "  8001 backend            OK $($r.StatusCode)" } catch { Write-Host "  8001 backend            FAILED" -ForegroundColor Red }
try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8300/health' -UseBasicParsing -TimeoutSec 6; Write-Host "  8300 CV service         OK $($r.StatusCode)" } catch { Write-Host "  8300 CV service         FAILED" -ForegroundColor Red }

Write-Host ""
Write-Host "Verifying agents + supervisor..." -ForegroundColor Cyan
foreach ($item in $agents) {
  $url = "http://127.0.0.1:$($item.p)/health"
  try { $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5; Write-Host ("  {0,-22} OK {1}" -f $item.n, $r.StatusCode) } catch { Write-Host ("  {0,-22} FAILED" -f $item.n) -ForegroundColor Red }
}
try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8020/health' -UseBasicParsing -TimeoutSec 5; Write-Host ("  8020 supervisor          OK {0}" -f $r.StatusCode) } catch { Write-Host "  8020 supervisor          FAILED" -ForegroundColor Red }
