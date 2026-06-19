# 統合: 「popup を開く手間すら無くす」をどう実現するか(1案)

> カラ会議(`popup-less-diag.md`・3体 deepseek-r1 批判 / qwen3.5 発散 / llama 総合)
> → 司令塔(Claude Code)が実コードで裏取りして1案に。2026-06-20。

## 会議の結論(3体一致)

**「popup を一切開かず・ユーザー操作ゼロで popup 固有診断を取ることは、MV3 + 描画値の性質上、原理的に不可能。」**
- 批判(deepseek-r1): 不可能。offscreen は表示領域が無く描画値が取れない・誤診リスク。
- 発散(qwen3.5): 完全自動化は不可能。折衷=status を開いた瞬間に裏で offscreen 1回。**ただし自ら
  「最大の弱点=誤診」「画像ロードが offscreen で無効なら案自体が機能せず C 案(切り捨て)に回帰」と明記。**
- 総合(llama): 難しい。status にボタン→押下時 offscreen。

## 司令塔の裏取り(会議が見落とした実コード事実 = 決定打)

1. **offscreen は chrome.storage を使えない**(公式仕様・`src/extension/offscreen-entry.js:13-14` に明記)。
   会議の全案「offscreen で診断→storage 保存」は**そのままでは不成立**。SW 経由中継が必須=想定より重い。
2. **描画依存値は offscreen で正しく取れない**(実コードで確認):
   - `avatarLoadDiag` = `supportGrowthAvatarLoad.js:getDiagnostics`(popup が実際に img を描画した load 成否)
   - `_northStarRenderProbe`(popup-entry.js:10647)・`watchMetaCache`(2928)= popup-entry のモジュール変数
   → offscreen(サイズ0・レンダリング最適化で画像非ロード)では本物とズレる=**誤診を status に流す**
   =星野ロミ式が最も嫌う「失敗体験を新規に作る」。
3. **発散役 qwen3.5 自身が保険(C 案回帰)をかけている** = 折衷案は技術的賭けの上。
4. **実証**: 今日のセッションで backfill 失速も会場の問題も **fastDiag(content診断)だけで真因特定できた**。
   popup診断が無くて困った場面は実際ゼロ。

## 採用する1案

### 大前提(正直に線を引く)
- **「popup を開かず・操作ゼロ」は不可能。** これは設計の限界でなく「描画値は描画しないと存在しない」物理。
- offscreen 自動化は **誤診リスク + chrome.storage 不可 + 電池/CPU + 複雑さ** で、得る(描画診断)より失う方が大。
  過去にこの拡張は「自動ダウンロード連発」「裏タブ重い描画」で実害を出した = 裏の自動処理は地雷。**不採用。**

### やるべきこと = 「操作を減らす」現実解(MVP)
今のユーザー手順: **拡張アイコン押す → popup 開く → 『AI診断コピー』ボタン押す**(3手)。
これを **2手以下**に縮める。一切 offscreen を使わず、誤診も生まない安全な最小変更:

- **MVP-1: popup を開いたら自動で popup診断を status キーへ書く**(『AI診断コピー』押下を不要に)。
  popup-entry の初期化(initPopup・popup-entry.js:20988)で、初期描画が落ち着いた後にアイドルで1回だけ
  `collectAiShareDevMonitorPayloadBundle`→`KEY_AI_SHARE_POPUP_DIAG` 書き込みを呼ぶ。
  → 手順が **「アイコン押す → popup 開く(だけ)」= 2手**に。診断は popup の本物の描画値=誤診ゼロ。
  初期表示を妨げないようアイドル遅延(requestIdleCallback 等)で実行。重い全件集計は呼ばない(popup診断のみ)。

- **MVP-2(任意): status に「鮮度」を出す**。popup診断が古い/未取得なら「popup を一度開くと更新されます
  (最終 N 分前)」と status に明記。ユーザーが「なぜ空か」で迷わない(失敗体験の除去)。

### やらないこと(過剰実装の回避)
- offscreen で popup を裏起動(誤診・storage 不可・電池)。
- popup を勝手に開く(MV3 で API 自体が無い)。
- 常時自動の重い処理(過去の実害の再来)。

## 検証観点(完成時)
「popup を開くだけで(『AI診断コピー』を押さなくても)status の AI共有まとめに popup診断が載る。
診断値は popup の本物の描画由来で誤診しない。初期表示は遅くならない。記録・取得に影響しない。」

## 残る正直な事実
ユーザーの「popup を開くことすら無くす」は、popup診断に関しては**満たせない**(物理)。
ただし fastDiag(content診断)だけで実際の問題の大半は切り分け済み=**普段は status1枚で足り、
popup診断は『開いたら自動で付く』にしておけば、わざわざ開く必要も実際ほぼ無い**。
