# 会議起動: User スコープ env のキーを現プロセスに流し込んでから node を起動する。
# グローバルルール: $_/{}/日本語リテラルを直書きせず .ps1 化して -File 実行。
$ErrorActionPreference = 'Stop'
$keys = @(
  'GROQ_API_KEY','GEMINI_API_KEY','NVIDIA_API_KEY','OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY','OLLAMA_HOST','MEETING_LOCAL_MODELS'
)
foreach ($k in $keys) {
  $v = [Environment]::GetEnvironmentVariable($k, 'User')
  if ($v) { Set-Item -Path "Env:$k" -Value $v }
}
# 品質モード(批判役が他案を読んで1往復)で実行。
$env:COUNCIL_QUALITY = '1'
$repo = 'C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com'
Set-Location $repo
node scripts/meeting.mjs "council/pop-foundation-then-parity-question.txt" --out "council/pop-foundation-then-parity-answers.json" 2>&1 | Tee-Object -FilePath "council/pop-foundation-then-parity-log.txt"
