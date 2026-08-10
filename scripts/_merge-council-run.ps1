# ASCII only. Derive council dir from script location, run the node merger.
$ErrorActionPreference = 'Stop'
$repoTsuioku = Split-Path $PSScriptRoot -Parent
$githubRoot  = Split-Path $repoTsuioku -Parent
$council     = Join-Path (Join-Path $githubRoot 'surechigai-romi.link') 'council'
node (Join-Path $PSScriptRoot '_merge-council.mjs') $council
Write-Output ("EXIT_CODE=" + $LASTEXITCODE)
