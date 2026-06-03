# 北極星レーン描画の「出たり消えたり・白くなる」根治: 改修A(アトミック差し替え+差分スキップ) v0.1.618

> フルAI会議(ディープリサーチ2系統)の結論にもとづく第1段。TDD・段階実装(Strangler)。
> 依頼書: `memory/reference_north_star_lane_repaint_refactor_meeting_v0617.md`。

## 1. 症状(実機・lv350672510・5時間超/コメント9700件)
- 北極星レーン(ランキング帯)が**出たり消えたりする**。
- **スクロールする瞬間にパネルが白くなる**。
- パネルごと空白になることがある。

## 2. 真因(ディープリサーチで断定)
外部OSS調査(web.dev/MDN/Chrome公式)+ 自コード調査の一致結論:
- 30秒/3秒ポーリング(safeRefresh)で各レーンを **`innerHTML` 全置換**(全レーン共通の
  `paintTopSupportRankStyleIntoElement` が `el.innerHTML = html`)。
- `innerHTML` 全置換 = 既存ノードを**全破棄**(一瞬空=白)→ パース → reflow → repaint を毎回フル実行。
  スクロール中に重なると frame budget(16ms)超過 → 白飛び・カクつき。
- さらに**同じデータでも毎回再描画**(差分なし)していたため、変化のないポーリングでも
  全置換のフラッシュが発生 → 「出たり消えたり」。

## 3. 改修A(本PR): アトミック差し替え + 差分スキップ
`paintTopSupportRankStyleIntoElement`(popup-entry.js)の `el.innerHTML = html` を:

1. **差分スキップ**: 生成した本体 HTML(`nextHtml`)を要素ごとに WeakMap(`_topSupportRankLastHtmlByEl`)
   へ記録。**前回と同一 HTML かつ既に描画済みなら、本体 DOM を一切触らずスキップ**(画像 guard
   再バインドも省く)。→ 変化のないポーリングでのちらつき源を断つ。
2. **アトミック差し替え**: 変化があるときだけ、`<template>` でメモリ上に組んでから
   `el.replaceChildren(tpl.content)` で**1回でアトミックに差し替え**。`innerHTML` 全置換と違い
   「一瞬空(白)」の中間状態が画面に出ない(MDN replaceChildren / web.dev 実証)。
3. 本体を貼り替えた時だけ画像 load guard を再バインド。`isNorthStarBody` の後処理
   (gadget 同期 / ギフト要約 / 縦レール整理)は別 DOM 領域なので従来どおり毎回実行(冪等)。

### 機能後退ゼロの担保
- **出力 DOM は完全同一**: HTML 生成ロジック(escapeHtml/escapeAttr による XSS 安全含む)は無変更。
  `<template>.innerHTML` はパースのみで script を実行しない(innerHTML と同じ安全性)。
- e2e parity 確認: nicoad-ad-ranking(×2)/ support-activity-timeline が緑(painter 出力が正しい DOM)。
  ※ event-broadcasters-lane spec は**純master でも落ちる documented flaky**(headless でモック
  snapshot が間に合わない)。本改修起因ではないことを master baseline で実証済み。
- 差分スキップは「同一 HTML」のときだけ。1文字でも変われば従来どおり全部描き替える(取りこぼし無し)。

## 4. 併せて(v0.1.617 から継続のイベントレーン即畳み)
- `hideNorthStarEventLanesIfNotParticipating` を refreshAllNorthStarMirrorLanes の**最初**に実行
  (イベント参加シグナル皆無なら event 2レーンを即 hide+待機UI撤去)。重い連鎖で hide まで
  到達しない問題を断つ。
- syncKokenGiftHistoryForPopup(9.4秒)を await 連鎖から外し fire-and-forget 化。

## 5. テスト
- `npm run verify` 全緑(4901 tests・lint・typecheck・build)。
- painter 系 e2e(nicoad / support-timeline)緑で DOM parity 確認。

## 6. 変更ファイル
- `src/extension/popup-entry.js`: paintTopSupportRankStyleIntoElement を差分スキップ+
  `<template>`+replaceChildren に(改修A)。
- `extension/manifest.json` / `package.json` / `src/lib/changelog.js`: v0.1.618 bump。

## 7. 次段(会議計画の続き・別PRで段階的に)
- **改修C**: storage 直読み(1 tick 9-10回)→ in-memory キャッシュ + chrome.storage.onChanged
  購読(write-time 更新)。描画ホットパスの直列 await 連鎖を消す。
- **改修D**(C後): レーン/行に content-visibility:auto + contain-intrinsic-size(画面外スキップ)。
- **コンポーネント化**: view-model 変換の純関数抽出 + ユニットテスト、レーン単位 render IF へ
  Strangler 移行。plan_popup_entry_componentization.md に沿う。
- 別系統: コメント送信11.3秒 / iframe warmup 撤去 / 記録が伸びない(取り込み層)。
