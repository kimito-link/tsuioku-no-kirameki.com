# 批判役 deepseek-r1:14b を単独で取りに行く（フル便で abort したため）。ASCII only。
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$repoTsuioku = Split-Path $PSScriptRoot -Parent
$githubRoot  = Split-Path $repoTsuioku -Parent
$council     = Join-Path (Join-Path $githubRoot 'surechigai-romi.link') 'council'

$env:MEETING_LOCAL_MODELS = 'deepseek-r1:14b'

$brief = Join-Path $council 'romi-spec-brief.md'
$out   = Join-Path $council 'romi-spec-answers-critic.json'
$log   = Join-Path $council 'romi-spec-run-critic.log'

node (Join-Path $PSScriptRoot 'meeting.mjs') $brief --out $out *>&1 | Tee-Object -FilePath $log
Write-Output ("EXIT_CODE=" + $LASTEXITCODE)
