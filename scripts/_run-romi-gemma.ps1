# 統括役 gemma4:31b だけを単独で取りに行く(2回とも abort したため)。
# 単独なら他モデルとGPU/CPUを取り合わず、完走しやすい。
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$repoTsuioku = Split-Path $PSScriptRoot -Parent
$githubRoot  = Split-Path $repoTsuioku -Parent
$council     = Join-Path (Join-Path $githubRoot 'surechigai-romi.link') 'council'

$env:MEETING_LOCAL_MODELS = 'gemma4:31b'

$brief = Join-Path $council 'romi-spec-brief.md'
$out   = Join-Path $council 'romi-spec-answers-gemma.json'
$log   = Join-Path $council 'romi-spec-run-gemma.log'

node (Join-Path $PSScriptRoot 'meeting.mjs') $brief --out $out *>&1 | Tee-Object -FilePath $log
Write-Output ("EXIT_CODE=" + $LASTEXITCODE)
