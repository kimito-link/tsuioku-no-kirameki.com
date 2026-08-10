# ローカル(Ollama)だけで会議を回す再実行用。クラウドは前回取得済みなのでキーを渡さない。
# 欠けている役(批判 deepseek-r1 / 統括 gemma4 / 発散 qwen3 / 実装 coder / 別系統 gpt-oss)を埋める。
# パスは $PSScriptRoot 相対(非ASCII直書きの文字化け回避)。
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$repoTsuioku = Split-Path $PSScriptRoot -Parent
$githubRoot  = Split-Path $repoTsuioku -Parent
$council     = Join-Path (Join-Path $githubRoot 'surechigai-romi.link') 'council'

# クラウドキーは敢えて未設定(このプロセスに流し込まない)→ ローカルのみ参加。
$env:MEETING_LOCAL_MODELS = 'deepseek-r1:14b,gemma4:31b,qwen3:14b,qwen2.5-coder:14b,gpt-oss:20b'

$brief = Join-Path $council 'romi-spec-brief.md'
$out   = Join-Path $council 'romi-spec-answers-local.json'
$log   = Join-Path $council 'romi-spec-run-local.log'

node (Join-Path $PSScriptRoot 'meeting.mjs') $brief --out $out *>&1 | Tee-Object -FilePath $log
Write-Output ("EXIT_CODE=" + $LASTEXITCODE)
