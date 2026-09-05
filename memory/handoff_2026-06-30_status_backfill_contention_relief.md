# 状態速報「取り込み中に重い」負荷適応で緩和 — v0.1.1009 (2026-06-30)

## 結論
master HEAD = **v0.1.1009 (207cdf04)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1009。
「過去ログ取り込み中に状態速報の更新が重い(1819ms)」を負荷適応スケジュールで緩和。

## 真因(計器が名指し→実コードで裏取り)
- 更新所要(計器・v0.1.1005)が取り込み中の配信で **1819ms**(重い順: backfill 640ms / summaries 439ms / popupDiag 391ms)。
- 3つとも**単一キーの小さな read**(loadBackfillProgressSafe/loadAllSummaries/loadPopupDiagSafe)。read サイズの問題ではない。
- backfill SW が単一 LevelDB に **最大2000行/2.5秒**の staged 書込(backfill-sw-entry.js: STAGING_WRITE_ROWS=2000/INTERVAL=2500)。
  その大きな構造化クローン書込と status の 2秒read が競合し 1 refresh が数百ms〜2秒に膨れる
  (status-entry.js:317「単一 LevelDB で並行 read が stall」の構造)。

## 修正(記録/取り込みには触らず status の更新スケジュールだけ)
- startRefreshLoop に2つ:
  (a) **再入防止** `_refreshInFlight`: 前回 refresh が終わるまで次 tick を走らせない(1819ms>2000ms 寸前で
     refresh が積み上がるのを断つ)。
  (b) **負荷適応 backoff** `_refreshBackoffTicks`: 前回が **REFRESH_SLOW_MS(500ms)** 超なら次の2 tick を間引く
     =取り込み中だけ自動で控えめ更新にし書込との競合頻度を下げる。
- 通常時(軽い)は 2秒のまま=コア鮮度不変。実測: 通常時「更新 5ms」で backoff 不発を実拡張で確認。

## 「診断ページが重い」全体の切り分け(この件で完結)
1. 初期ロード: 実測でコードは無罪(empty/8000/33MB いずれも LCP 42〜54ms)。→ **環境(Claude多重/Chrome)が主因**
   (claude-health-check で 2セッション/MCP多重を確認・整理で開けるようになった実績)。
2. 更新サイクル: 通常 0〜6ms=軽い。**取り込み中だけ backfill 書込と競合して 1819ms**→本件で負荷適応緩和。
→ 「重い」は (環境) + (取り込み中の競合) の二層で、両方に手当て済み。

## verify
- verify:cc 緑。実拡張 v0.1.1009 で status.html を開き通常時「更新 5ms」・refresh 積み上がらず描画を確認。
- ※実機の取り込み中 1819ms→改善は、ユーザーが次に取り込み中の配信で更新所要(計器)を見れば確認できる。

## 残(別系統・未着手)
- backfill 律速そのもの(取得が遅い)= v0.1.999 計器の実測待ち(seek 律速か)。本件は「取り込み中に診断が重い」緩和で別。
- 会場座席(venue-seats): 完全性スコアの最後の不合格。会場使用時に切り分け。
- ②北極星 広告の鏡取りこぼしは出たり消えたり=配信開始直後の一時鮮度差の可能性。安定再現したら publishNorthStarMirror 調査。

## 今セッション出荷(v0.1.998〜1009=12版・全 push 済み・同期0/0)
記録>本家 誤検知の完全決着(計器3点+時系列ガード)・読み上げ固着+stale・応援レーン匿名誤報・貢献度鏡誤検知・
backfill計器・更新計器をコピー本文・診断重さ(環境実測+取り込み中競合緩和)。

## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
