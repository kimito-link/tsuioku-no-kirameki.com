# マーケ分析HTML用にゆっくり立ち絵を 72x72 に縮小（System.Drawing）
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not (Test-Path (Join-Path $root "package.json"))) {
  throw "package.json not found under $root"
}
$outDir = Join-Path $root "extension\images\marketing-html-avatars"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Add-Type -AssemblyName System.Drawing

function Resize-One {
  param([string]$Src, [string]$DestName)
  $srcPath = Join-Path $root $Src
  if (-not (Test-Path $srcPath)) { throw "missing $srcPath" }
  $img = [System.Drawing.Image]::FromFile((Resolve-Path $srcPath).Path)
  try {
    $bmp = New-Object System.Drawing.Bitmap 72, 72
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($img, 0, 0, 72, 72)
    $out = Join-Path $outDir $DestName
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "OK $DestName" ((Get-Item $out).Length)
  } finally {
    if ($g) { $g.Dispose() }
    if ($bmp) { $bmp.Dispose() }
    $img.Dispose()
  }
}

Resize-One "extension\images\yukkuri-charactore-english\link\link-yukkuri-smile-mouth-open.png" "rink-72.png"
Resize-One "extension\images\logo\konta-yukkuri-icon-128.png" "konta-72.png"
Resize-One "extension\images\yukkuri-charactore-english\tanunee\tanuki-yukkuri-smile-mouth-open.png" "tanu-72.png"
