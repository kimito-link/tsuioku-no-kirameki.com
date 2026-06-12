# reference: 顔アバターB案 パーツ素材 完成済み・組み込み設計（正本）

> 2026-06-13 司令塔がユーザーの代わりに ChatGPT(gpt-image) でパーツ生成を完遂。
> 生成→背景除去→切り出しまで終わっており、**残タスクは拡張への組み込みのみ**。

## 完成済み素材（リポ内 `memory/avatar-parts/`）

- `hair-sheet-v1.png` / `face-sheet-v1.png` — 生成原本（1774x887）
- `*-alpha.png` — 偽市松背景を除去した透過版
- `parts/` — **切り出し済み22パーツ（全部透過PNG・検品済み）**
  - 髪8: `hair-{bob,short-flip,long,ponytail,twintail,mushroom,center-part,wolf}.png`（グレースケール=プログラム着色用）
  - 目6: `eyes-{open,smile,jito,sparkle,surprised,sleepy}.png`（左右ペア・茶虹彩+白ハイライト）
  - 口6: `mouth-{omega,smile,open,mu,pokan,smirk}.png`
  - チーク2: `cheek-{0,1}.png`
- 再生成パイプライン: `scripts/split-avatar-parts.mjs`（偽市松flood-fill除去+成分bbox切り出し。pngjs必要=`npm i --no-save pngjs`）

## 生成の知見（次回のため）

- 画像AIは「透過PNG」指示でも**市松模様を描いた不透過RGB**を返す（colorType=2）→ scripts のflood-fill（端から低彩度明色のみ除去・黒アウトラインで停止）で完全除去できた
- ChatGPTへのファイル添付はUI自動化で可能（postMessage中継方式・詳細はClaudeメモリ session_2026-06-13）
- 目のグルーピングは間隔分割でなく**横6等分セル割当**でないと左右ペアが割れる

## 組み込み設計（kit §受け取り後 を具体化）

1. パーツを `extension/images/avatar-parts/` に同梱（22ファイル・計約1MB→**要縮小**: 各パーツ128px程度にリサイズして同梱、計~100KB台に）
2. `anonymousIdenticonDataUrl`（単一正本）を canvas 合成版に拡張:
   - hash → 髪型(8)×髪色(12色 multiply/hue着色)×目(6)×口(6)×チーク(2) = **6,912通り**
   - 合成順: 肌色丸顔ベース(canvas描画) → チーク → 目 → 口 → 髪(着色済み・頭の外側に重ね)
   - アンカー: 頭円の中心基準で 目=中央やや上・口=下1/3・髪=頭円を覆うようスケール（**実機で目視調整必須**）
   - `toDataURL` キャッシュ（userKey→dataUrl・LRU）
3. **二段構え必須**: canvas+Image デコードは非同期 → 現行SVG版(v0.1.702)を即時表示し、合成完了後に差し替え。後退ゼロ
4. 決定論はハッシュ層で不変（同じ人はいつも同じ顔）
5. 着色は globalCompositeOperation='multiply' でグレー髪×色 → 'destination-in' で形を戻す

## 検証

- 既存テスト(anonymousIdenticon系6件)互換維持
- 実機: コメビュ24面プレビュー(前回手法)で全パーツ組合せ確認
