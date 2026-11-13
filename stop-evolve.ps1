# Evolve AI — stop everything started by launch-evolve.ps1.
# Usage:  .\stop-evolve.ps1
# Kills PIDs listening on 3000/8001/8300/8310 + any ngrok process.

foreach ($p in @(3000, 8001, 8300, 8310)) {
    $procIds = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
               Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique
    foreach ($procId in $procIds) {
        Write-Host "Stopping PID $procId on port $p ..."
        try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {}
    }
}
Get-Process -Name ngrok -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Stopping ngrok PID $($_.Id) ..."; Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Write-Host 'Done.'
