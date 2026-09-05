# User スコープの API キーを現プロセスに流し込んでから meeting.mjs を起動する。
# meeting.mjs は process.env しか見ない（古い bash 環境を引き継がないため）。
#
# パスは $PSScriptRoot から相対で組み立てる。非ASCII(デスクトップ)をスクリプト本文に
# 直書きすると、bash 経由起動時の encoding 不一致で文字化けして失敗するため。
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot          # ...\tsuioku-no-kirameki.com\scripts
$repoTsuioku = Split-Path $PSScriptRoot -Parent          # ...\tsuioku-no-kirameki.com
$githubRoot  = Split-Path $repoTsuioku -Parent           # ...\github
$repoRomi    = Join-Path $githubRoot 'surechigai-romi.link'
$council     = Join-Path $repoRomi 'council'

foreach ($k in 'GROQ_API_KEY','GEMINI_API_KEY','NVIDIA_API_KEY','OPENROUTER_API_KEY') {
  $v = [Environment]::GetEnvironmentVariable($k, 'User')
  if ($v) { Set-Item -Path ("Env:" + $k) -Value $v }
}

$brief = Join-Path $council 'romi-spec-brief.md'
$out   = Join-Path $council 'romi-spec-answers.json'
$log   = Join-Path $council 'romi-spec-run.log'

node (Join-Path $PSScriptRoot 'meeting.mjs') $brief --out $out *>&1 | Tee-Object -FilePath $log
Write-Output ("EXIT_CODE=" + $LASTEXITCODE)
