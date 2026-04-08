# visual-explainer（開発者向け）

[nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer)（MIT）を、このリポジトリでは **Cursor 用プロジェクト Skill** として [`.cursor/skills/visual-explainer/`](../.cursor/skills/visual-explainer/) に同梱しています。

## Cursor での使い方

チャットで次のような依頼をすると、Skill の説明に沿って **自己完結型の HTML**（図・表・スライド風レイアウトなど）が生成されやすくなります。

- アーキテクチャ図・フロー・Mermaid
- diff / コードレビューの可視化
- 実装計画とコードベースの突き合わせ
- プロジェクトの要約（引き継ぎ用）
- 行・列が多い比較表（ASCII 表ではなくブラウザ向け HTML）

生成物の保存先は **リポジトリルートからの相対パス** `docs/.visual-explainer/` です（`.gitignore` 済み。コミットしない想定）。

ブラウザで開く例は [`.cursor/skills/visual-explainer/README.nicolivelog.md`](../.cursor/skills/visual-explainer/README.nicolivelog.md) を参照してください。

## upstream の更新を取り込む

```bash
npm run vendor:visual-explainer
```

`LICENSE` と `VENDOR_REVISION.txt` が Skill ディレクトリに含まれます。

## Claude Code を使う場合

公式の marketplace 手順（upstream README と同じ）でプラグインを入れても構いません。Cursor 用の同梱 Skill と競合しません。

```text
/plugin marketplace add nicobailon/visual-explainer
/plugin install visual-explainer@visual-explainer-marketplace
```

コマンド名は環境により ` /visual-explainer:...` のように名前空間付きになることがあります。

## 任意機能

- **Vercel 共有**（`share.sh`）や **surf-cli** による画像生成は、トークン・API キーをリポジトリに含めず、手元の環境だけで使う前提としてください。

## 注意

生成内容は AI 出力です。**事実関係は git・ソースと必ず照合**してください。
