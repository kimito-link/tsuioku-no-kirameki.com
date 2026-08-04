# 会議ハーネス実行用ラッパ(ghost-tab-open)。User スコープの env(APIキー)を現プロセスへ流し込んでから node を起動。
$ErrorActionPreference = 'Continue'
foreach ($n in 'GROQ_API_KEY','NVIDIA_API_KEY','OPENROUTER_API_KEY','GEMINI_API_KEY','OLLAMA_HOST') {
  $v = [Environment]::GetEnvironmentVariable($n, 'User')
  if ($v) { Set-Item -Path "Env:$n" -Value $v }
}
Set-Location 'C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com'
node scripts/meeting.mjs council/ghost-tab-open-question.txt --out council/ghost-tab-open-answers.json 2>&1 | Tee-Object -FilePath council/ghost-tab-open-log.txt
