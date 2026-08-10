# 3ラウンド分の JSON を1つの Markdown 議事録に統合する。
# 同一 label の重複は「最も長い有効回答」を採用(中断/失敗を捨てる)。
$ErrorActionPreference = 'Stop'
$repoTsuioku = Split-Path $PSScriptRoot -Parent
$githubRoot  = Split-Path $repoTsuioku -Parent
$council     = Join-Path (Join-Path $githubRoot 'surechigai-romi.link') 'council'

$files = @(
  (Join-Path $council 'romi-spec-answers.json'),
  (Join-Path $council 'romi-spec-answers-local.json'),
  (Join-Path $council 'romi-spec-answers-gemma.json')
)

$best = @{}   # label -> 最良の result オブジェクト
foreach ($f in $files) {
  if (-not (Test-Path $f)) { continue }
  $j = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($r in $j.results) {
    $len = if ($r.answer) { $r.answer.Length } else { 0 }
    $cur = $best[$r.label]
    $curLen = if ($cur -and $cur.answer) { $cur.answer.Length } else { -1 }
    if ($len -gt $curLen) { $best[$r.label] = $r }
  }
}

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('# 会議議事録: 「ロミ」が喜ぶ次の目玉機能')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('> COUNCIL-HOWTO.md の汎用会議ハーネス(meeting.mjs)を役割注入ONで3ラウンド実行し、')
[void]$sb.AppendLine('> 各モデルの最良回答を統合。最終統合は司令塔(Claude)が担当。')
[void]$sb.AppendLine('')
$ok = 0; $fail = 0
foreach ($label in ($best.Keys | Sort-Object)) {
  $r = $best[$label]
  if ($r.answer) {
    $ok++
    [void]$sb.AppendLine('## ' + $r.label + '  [' + $r.role + ']')
    [void]$sb.AppendLine('')
    [void]$sb.AppendLine($r.answer)
    [void]$sb.AppendLine('')
    [void]$sb.AppendLine('---')
    [void]$sb.AppendLine('')
  } else {
    $fail++
  }
}
[void]$sb.AppendLine('## 取得できなかったメンバー')
[void]$sb.AppendLine('')
foreach ($label in ($best.Keys | Sort-Object)) {
  $r = $best[$label]
  if (-not $r.answer) {
    [void]$sb.AppendLine('- ' + $r.label + ' [' + $r.role + '] — ' + $r.error)
  }
}

$outMd = Join-Path $council 'romi-spec-minutes.md'
[System.IO.File]::WriteAllText($outMd, $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
Write-Output ('WROTE: ' + $outMd)
Write-Output ('OK=' + $ok + ' FAIL=' + $fail + ' UNIQUE_LABELS=' + $best.Count)
