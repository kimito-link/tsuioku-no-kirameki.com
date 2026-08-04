# 会議ハーネス（役割注入版）実行ラッパ。COUNCIL-HOWTO.md 準拠。
# User スコープの APIキーを現プロセスへ流し込んでから node を起動する（meeting系は process.env のみ参照）。
# パスは $PSScriptRoot 相対で組む（非ASCIIデスクトップ直書きの文字化け回避）。
$ErrorActionPreference = 'Continue'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$council = $PSScriptRoot                                   # ...\tsuioku-no-kirameki.com\council
$repo    = Split-Path $council -Parent                     # ...\tsuioku-no-kirameki.com
$scripts = Join-Path $repo 'scripts'

foreach ($n in 'GROQ_API_KEY','NVIDIA_API_KEY','OPENROUTER_API_KEY','GEMINI_API_KEY','OLLAMA_HOST') {
  $v = [Environment]::GetEnvironmentVariable($n, 'User')
  if ($v) { Set-Item -Path "Env:$n" -Value $v }
}

Set-Location $repo
$q   = Join-Path $council 'romi-doin-question.txt'
$out = Join-Path $council 'romi-doin-answers.json'
$log = Join-Path $council 'romi-doin-log.txt'

node (Join-Path $scripts 'meeting-roles.mjs') $q --out $out 2>&1 | Tee-Object -FilePath $log
Write-Output ("EXIT_CODE=" + $LASTEXITCODE)
