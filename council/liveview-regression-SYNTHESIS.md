# SYNTHESIS: 応援プレビュー「ローディングなし・爆速」退行の正体と戻し方

会議 2026-06-26(council/liveview-regression-question.txt)。発散役(deepseek系)+爆速役(llama-3.3-70b)とも一致。

## 裁定(A: 退行の正体)
**「iframe+passive 方式そのもの」ではなく「passive が数字カードを埋める経路を持たないだけ」。**
- iframe 化(v0.1.929)は popup の CSS/JS を流用して保守コストを下げる正しい選択。
- 問題は `INLINE_PASSIVE` フラグが「データ取得経路を完全に遮断する壁」として働き、
  上段3カードを storage から埋める applyLightweightPanelSummaryCards() が一度も呼ばれなくなったこと。
- ★ただし「polling 内に1行足す」発想は根本解決でない。polling は passive で張らない設計(軽さのため)。
  polling 依存から脱却し、イベント駆動にするのが「爆速・ローディングなし」に最も合致する。

## 戻すべき設計(B/C: 最小修正・イベント駆動ミラー)
passive のとき、storage から上段3カードを即時に埋める軽量経路を【polling と無関係に】1本入れる。
発散役の推奨「Event-Driven Mirror + Optimistic 即表示」を採る:

1. **開いた瞬間に1回 applyLightweightPanelSummaryCards() を呼ぶ**(initPopup 末尾の passive 分岐)。
   = panel_summary_<lv>(content が常時更新)を read だけして記録/同接/来場を即セット。fetch しない・書かない。
2. **chrome.storage.onChanged を passive 専用に張る**(polling の代わり)。
   panel_summary_<lv> / watch_snapshot_<lv> が変われば applyLightweightPanelSummaryCards() を1回呼ぶ。
   = イベント駆動でゼロポーリング・更新の瞬間だけ動く=軽い+即時。status の setupStorageChangeListener と同型(実績あり)。
3. **ローディングを出し続けない**: 値が取れない項目(同接の実測など watch 問い合わせ必須のもの)は、
   storage に無ければローディングを外して「—」または公式値(下段)で代替し、待ち続けない。
   syncLiveStatThreeCardsCharLoadingOverlays が「数値未確定」でローディングを出し続けるのを、
   passive では「storage read 完了後はローディングを畳む」よう一度だけ確定させる。

## 触らない(制約・確認済み)
- popup の refresh()/paint の read path は触らない(v0.1.948 で2回却下された地雷)。
  → applyLightweightPanelSummaryCards() は refresh とは独立した storage read 関数(v0.1.606 から実績)。これを呼ぶだけ。
- content-entry.js(記録の心臓部)は触らない。
- passive 原則(書かない/watch 注入しない/外部 fetch しない)を守る。storage read のみ。
- 純Web版(app/live-view.js)は別エントリ=対象外。

## 実装接点(具体)
- popup-entry.js: initPopup の末尾 or bootstrap の passive 分岐に、
  `if (INLINE_PASSIVE) { void applyLightweightPanelSummaryCards(); /* + onChanged 配線 */ }` を追加。
  ※ polling の `if(!INLINE_PASSIVE)` ブロックには触らない。新たに passive 専用の軽量配線を足す。
- applyLightweightPanelSummaryCards()(7351)= 既存・再利用(似せて自作しない)。
- watchPopupLastPaintedLiveId は passive でも paint 経路(1142)でセットされる=lv は入る(初回 paint 後に呼ぶ)。

## PR 分割
- PR1(本丸): passive 専用に init 時1回 + onChanged 配線で applyLightweightPanelSummaryCards() を呼ぶ。
  → 上段3カードが storage から即埋まり、ローディングが消える。
- PR2(任意): ローディング畳みの確定(storage read 完了後に overlay を必ず外す)。値が無い項目の「—」確定。

## 検証ゲート(D・MEMORY 規約=pure test 緑で完了報告しない)
ユーザー実機手順:
1. chrome://extensions で 🔄 更新。
2. 記録 ON で配信を見ている状態で、ちくらんカードの「🔥 応援ライブビューを開く」でプレビューを開く。
3. ★開いた瞬間、上段3カード(記録/推定同接/来場者数)に数字が即出る・ローディング(キャラ重ね)が出ない。
4. 配信が進んで記録が増えると、プレビューの記録件数も追従して増える(onChanged 駆動)。
実機で 3〜4 を確認するまで「直った」と言わない。
