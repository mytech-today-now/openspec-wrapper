# Debug: test if Json switch gets set via hashtable splatting
Set-Content .beads/issues.jsonl ''
. "$PSScriptRoot\beads-helpers.ps1"

Write-Host '=== Create issue ==='
bd create 'Debug issue' -Priority 1

Write-Host '=== Direct script call with -Json ==='
$direct = .\scripts\beads-query.ps1 list -Json
Write-Host "direct type: $($direct.GetType().Name)"
Write-Host "direct: $direct"

Write-Host '=== bd list --json captured ==='
$via_bd = bd list --json
Write-Host "via_bd type: $(if ($via_bd -eq $null) { 'NULL' } else { $via_bd.GetType().Name })"
Write-Host "via_bd: $via_bd"

Write-Host '=== Hashtable splatting test directly ==='
$params = @{ Json = $true }
$result = .\scripts\beads-query.ps1 list @params
Write-Host "splat result type: $(if ($result -eq $null) { 'NULL' } else { $result.GetType().Name })"
Write-Host "splat result: $result"

Write-Host '=== Cleanup ==='
Set-Content .beads/issues.jsonl ''

