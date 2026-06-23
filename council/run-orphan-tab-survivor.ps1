# 会議ハーネス実行用ラッパ(orphan-tab-survivor)。User スコープの env(APIキー)を現プロセスへ流し込んでから node を起動。
$ErrorActionPreference = 'Continue'
foreach ($n in 'GROQ_API_KEY','NVIDIA_API_KEY','OPENROUTER_API_KEY','GEMINI_API_KEY','OLLAMA_HOST') {
  $v = [Environment]::GetEnvironmentVariable($n, 'User')
  if ($v) { Set-Item -Path "Env:$n" -Value $v }
}
Set-Location 'C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com'
node scripts/meeting.mjs council/orphan-tab-survivor-question.txt --out council/orphan-tab-survivor-answers.json 2>&1 | Tee-Object -FilePath council/orphan-tab-survivor-log.txt
