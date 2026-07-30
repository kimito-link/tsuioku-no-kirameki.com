# 引き継ぎ 2026-07-11: 会場=①完全一致シリーズ完結目前(v0.1.1126〜1131)・masterマージ待ち

> 前チャットの続き。この1枚+メモリ(venue-exact-copy-design-2026-07-11 / venue-cleanup-2026-07-10)で着手できる。
> リポ=tsuioku-no-kirameki.com・ブランチ **feat/venue-lane-mirror-parity**(現行 v0.1.1131・7743f4a3・全push/copy:ext済・**未マージ**)。
> 検証=`npm run verify:cc`(素のverifyはハング)・1変更=1patch bump 3点同期・reality-checker→commit直列・push報告に反映3手順併記。

## 今日(7/11)出荷済みのもの(全て reality-checker pass・push・copy:ext済)

| 版 | 内容 |
|---|---|
| v0.1.1126 (24d173e7) | ①「詳しい状況」診断を会場へ転写(新鏡 nls_story_diag_mirror_v1・書込増ゼロ・Codex実装) |
| v0.1.1127 (6bfcee3a) | 会場フッター/ガイド帯を①一致で復活(⚠v0.1.1120を意図的に覆す・`VENUE_LANE_GUIDES_EXACT_COPY` 1行でrevert可) |
| v0.1.1128 (03b4c523) | **会場点滅の根治**=会場open中のhost移設凍結(実測 reloadCount=276/venueOpenMoves=275 の anchored⇄dock無限ピンポンを、3条件ANDの凍結+発火点ゲートで停止・venueSkipCount計器) |
| v0.1.1129 (bb20884d) | 会場スクロールバー非表示+**ロビー巨大タイル根治**(実測: ロビーは寸法CSSゼロで画像naturalが素通し→lobbyListにスタッククラス併記=38px) |
| v0.1.1130 (aab1c77e) | ③WEB専用エラーレポータ(Sentry envelope直POSTの自前~100行・SDK/依存ゼロ・PII=URLquery全落とし・1ページ8件cap・test11件) |
| v0.1.1131 (7743f4a3) | DSN設定で有効化(wire形式は実弾HTTP200で受理確認済み・停止=DSN空文字1行) |

実機確認済み: 会場=①の完全一致(りんく12/広告10/たぬ姉グリッド199が同順同顔・ガイド帯/フッター出現)。

## ★次アクション(この順)

1. **実機の最終4点確認**(ユーザーに依頼。反映3手順=pull→拡張リロード🔄→watchタブF5 を先に):
   (a) 会場を開いて点滅しない (b) ロビーの顔が普通サイズ (c) 会場に「①の診断(N秒前)」パネル+①と同じフッター (d) 状態速報1枚で hostMoveDiag.reloadCount が起動時の1のまま(venueSkipCountは0でも正常=発火点ごと止めたため)
2. **masterマージ+Webデプロイ**(ユーザーの「マージして」を待つ): v0.1.1112〜1131 を一括。これで③本番(app.tsuioku-no-kirameki.com)に Sentry 稼働・全会場修正が反映される(branch pushはpreviewのみ・本番はmasterから)。マージ後 Sentry Issues(besttrust.sentry.io・javascript-reactプロジェクト)に本番エラーが届き始める。
3. マージ後の残課題(優先順):
   - **鏡の心拍問題**: 長時間配信でコメントが疎→①の鏡更新が間遠(実測75秒前)→会場が鮮度窓を超え「①と同期待ち」fallbackへモード揺れ(ロビーへ匿名が一斉流入)。①側の定期publish(心拍) or 窓緩和の設計が必要(未着手・会議/Fable向きのお題)
   - **jsonBlob 114%超過**(585KB/512KB・長時間配信でprune押し切られ)=棚上げ中の B-2 書き手スリム化の出番(メモリ robust-architecture 参照)
   - **ギフト効果音の鳴り漏れ**(演出38→音10 等・状態速報の対処候補に常連)
   - **Patch C**(venueBar wrapTileEl の detach席素通し)=実配信の状態速報で unexplained.sampleKeys が DOM欠型と確定してから(設計正本 reference_venue_exact_copy_SYNTHESIS.md §C-4)
   - **Vercel重複プロジェクト**: team KimitoLink の `tsuioku-no-kirameki-com`(ドメイン無し)が同リポに接続されたままで push毎に失敗メール(clone直後926ms即死=インフラ系・実害ゼロ)。本命は `-i5pp`(tsuioku-no-kirameki.com 配信・全Ready)。ユーザー指示があればGit連携切断 or `vercel project rm`(削除は明示指示必須)
   - **ガイド帯の採否最終判断**(現状=①一致で復活中。不要なら VENUE_LANE_GUIDES_EXACT_COPY=false か、フッターだけ残す opts.foot 分割を後送)

## 地雷(絶対)

- ローディング表示・iframeリロード誘発(host移設/display:none)は全面禁止。会場凍結(3-B)を壊さない。
- 新計器は statusFastDiagLite の passthrough 必須(メモリ fastdiag-lite-is-the-printer-subset)。
- R-1: 鏡にHTML文字列を載せない。storage書込は既存min-gap/prune設計に同乗。
- reality-checker等の検証エージェント並走中に commit しない。commit直後は `git show HEAD:<file>` で核心確認。
- 別件WIP `src/lib/avCue*.js`(未追跡)は触らない。sound作業は stash@{0}(pachinkoブランチ)退避中。

## 正本

- 設計: memory/reference_venue_exact_copy_SYNTHESIS.md(会場=①・Fable) / reference_venue_cleanup_SYNTHESIS.md(ちかちか)
- 計画: C:\Users\info\.claude\plans\robust-pondering-fountain.md(Step3-A dedupe安定化は duplicateSeen=0 のため不発のまま棚上げ)
- メモリ索引: venue-exact-copy-design-2026-07-11 / venue-cleanup-2026-07-10
