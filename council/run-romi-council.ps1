# 会議ハーネス実行用ラッパ。User スコープの env(APIキー)を現プロセスへ流し込んでから node を起動する。
# COUNCIL-HOWTO.md の手順「PowerShell が User スコープを現プロセスに流し込んでから node」に従う。
$ErrorActionPreference = 'Continue'
foreach ($n in 'GROQ_API_KEY','NVIDIA_API_KEY','OPENROUTER_API_KEY','GEMINI_API_KEY','OLLAMA_HOST') {
  $v = [Environment]::GetEnvironmentVariable($n, 'User')
  if ($v) { Set-Item -Path "Env:$n" -Value $v }
}
Set-Location 'C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com'
node scripts/meeting.mjs council/romi-shisou-question.txt --out council/romi-shisou-answers.json 2>&1 | Tee-Object -FilePath council/romi-shisou-log.txt
