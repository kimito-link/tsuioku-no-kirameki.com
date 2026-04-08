# visual-explainer（nicolivelog 向けメモ）

このディレクトリは `npm run vendor:visual-explainer` で [visual-explainer](https://github.com/nicobailon/visual-explainer) から同期されています。MIT License（同梱の LICENSE を参照）。

## 生成 HTML の出力先

Skill の指示どおり **リポジトリルートからの相対パス** `docs/.visual-explainer/` に保存します（`.gitignore` 済み）。

## ブラウザで開く

- **Windows（cmd）**: `start "" "docs\\.visual-explainer\\your-file.html"`
- **Windows（PowerShell）**: `Start-Process "docs/.visual-explainer/your-file.html"`
- **macOS**: `open docs/.visual-explainer/your-file.html`
- **Linux**: `xdg-open docs/.visual-explainer/your-file.html`

## Vercel / surf-cli

共有用デプロイや画像生成は任意です。トークンや API キーをリポジトリに含めないでください。
