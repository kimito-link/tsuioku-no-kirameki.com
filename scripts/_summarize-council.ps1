$ErrorActionPreference = 'Stop'
$repoTsuioku = Split-Path $PSScriptRoot -Parent
$githubRoot  = Split-Path $repoTsuioku -Parent
$p = Join-Path (Join-Path $githubRoot 'surechigai-romi.link') 'council\romi-spec-answers.json'

if (-not (Test-Path $p)) { Write-Output 'JSON_NOT_FOUND'; exit 0 }

$j = Get-Content $p -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Output ('TOTAL: ' + $j.results.Count)
foreach ($r in $j.results) {
  if ($r.error) { $status = 'FAIL: ' + $r.error }
  else          { $status = 'OK ' + $r.answer.Length + 'chars' }
  Write-Output ($r.label + ' [' + $r.role + '] ' + $r.ms + 'ms -> ' + $status)
}
