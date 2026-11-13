# langgraph/stop_all.ps1 — stops every LangGraph process on the configured ports
$ports = 8020, 8501, 8502, 8503, 8504, 8505, 8506, 8507
foreach ($port in $ports) {
  $procs = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
  if ($procs) { Stop-Process -Id $procs -Force -ErrorAction SilentlyContinue; Write-Host "  stopped :$port" }
}
Write-Host "All LangGraph services stopped."
