# 会議起動: User スコープ env のキーを現プロセスに流し込んでから node を起動する。
$ErrorActionPreference = 'Stop'
$keys = @(
  'GROQ_API_KEY','GEMINI_API_KEY','NVIDIA_API_KEY','OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY','OLLAMA_HOST','MEETING_LOCAL_MODELS'
)
foreach ($k in $keys) {
  $v = [Environment]::GetEnvironmentVariable($k, 'User')
  if ($v) { Set-Item -Path "Env:$k" -Value $v }
}
$env:COUNCIL_QUALITY = '1'
$repo = 'C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com'
Set-Location $repo
node scripts/meeting.mjs "council/popup-entry-refactor-question.txt" --out "council/popup-entry-refactor-answers.json" 2>&1 | Tee-Object -FilePath "council/popup-entry-refactor-log.txt"
