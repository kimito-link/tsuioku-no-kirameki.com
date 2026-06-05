---
name: handoff-2026-06-04-web-version-and-whiteflash-session
description: 2026-06-04 夜セッション引継ぎ — Web版(スマホ閲覧)素地 + 白フラッシュ/複数タブ調査 + 自動テスト方針転換
metadata:
  type: project
---

# 2026-06-04 夜セッション引継ぎ

ブランチ `fix/koken-contrib-hidden-tab-stuck`(PR #219・未merge)に積層。全部 push 済み。

## ✅ 完成したもの(コミット順)

1. **Web版(スマホ閲覧)素地** — ChatWork型(録る=拡張/見る=どこでも)。
   - `api/status.js`(Upstash Redis REST 直叩き・POST保存/GET取得・依存ゼロ)
   - `app/index.html` + `app/app.js`(?v=トークンでGET→整形描画・60秒ポーリング・複数配信を並べる)
   - `src/lib/statusFormat.js`(整形純関数を status-entry から切り出し・拡張とWeb版で共用・test)
   - status.html に「📱スマホへ送信」ボタン + status-entry に POST handler(NL_STATUS_* キーは .env から build define 注入・未注入時ボタン無効)
   - manifest host_permissions に `https://app.tsuioku-no-kirameki.com/*` 追加
   - `vercel.json`: host==app.tsuioku-no-kirameki.com→/app/index.html rewrite、それ以外は /tsuioku-no-kirameki/ redirect。build.mjs に app/app.js バンドル target 追加。
   - **DNS全部済**: Cloudflare で app. CNAME→cname.vercel-dns.com。**残: Vercel で Upstash追加 / STATUS_INGEST_KEY env / app ドメイン紐付け / .env にキー→再build でボタン有効化**。詳細 [[reference-web-version-status-sharing-plan]] [[reference-dns-cloudflare-migration-kirameki]]

2. **白フラッシュ修正(3段)** — 1タブは「かなり良い」まで改善・実機確認済み:
   - `.nl-main` に background:var(--nl-bg)(popup.html・スクロールコンテナの白抜け)
   - paintWatchPopupUi: renderUserRooms を scroll 中 defer(同 liveId 描画済みのみ・_lastUserRoomsPaintedLiveId)
   - shouldDeferHeavyPopupPaintNow の defer 180→400ms + renderCharacterScene も同条件で defer

3. **見える化(2段)** — status の ⚙ 行で複数タブ負荷を計測表示:
   - `src/lib/perfDiag.js`(nls_perf_diag_<lv>・tabCount/lastPaintMs/commentCount/deferActive/paintCount/tabVisible・test)
   - popup: paintWatchPopupUi の paint 区間を performance.now 計測→2秒間引きで storage 書き込み
   - status/Web版: 「⚙ paint Nms / 描画N回 / 裏タブ / タブN / コメントN」表示

4. **⚠終了マーク** — `src/lib/liveEndedFlag.js`(nls_live_ended_<lv>・test)。content の detectWatchProgramEndedFromDom 終了検知時にフラグ書込→status が ⚠終了 表示。

## 🔴 未解決 + 教訓

- **複数タブで2つ目以降が白くなる**。実機計測で確定: アクティブ=描画241回、裏タブ=描画1〜4回。
- **真因判明(Plan調査)**: 裏タブでパネル未描画は**バグでなく省電力仕様**(content-entry.js:6930 visibilityState==hidden で renderPageFrameOverlay skip・多タブCPU比例増を避ける・visible復帰で確実再描画)。**白いのは裏タブにいる間だけ・前面で直る**。記録(録る)は裏でも無事。
- ❌ **「省電力中」プレースホルダを content に入れたら実機で両タブ白化→ revert(commit 7ba8711)**。DOM挿入が既存描画と干渉した模様。**教訓: content の描画初期化に手を入れるのは回帰リスク大。安易に触らない**。
- 既存のローディング表示(`.nls-inline-loading`「こん太がコメント集めてるよ」submsg content-entry.js:3074)が裏タブで出て「読み込み中」に見え紛らわしい、というのが元の不満。
- status の「配信ごとカード分け」表示改善は **stash に退避中**(白化と無関係・表示だけ・未コミット)。白化が落ち着いたら戻す。

## 🎯 方針転換(ユーザー判断)
「条件が多すぎて手で特定するの疲れた」→ **自動テスト(E2E/スモーク/モンキー)で複数タブ白化を自動検出する方向へ**。さらに「世界中の同種拡張の事例をディープリサーチしてから」→ **deep-research 実行中(run wf_ab3da391-972)**。
- 既存基盤: package.json に `test:e2e` / `test:e2e:smoke` / `test:e2e:monkey` / `test:e2e:smoke-monkey`(Playwright・scripts/run-e2e.mjs・PW_HEADLESS=1 で実拡張ロード)。
- 次: ディープリサーチ結果を見て「複数タブ+白化検出のビジュアル回帰/モンキーテスト」を既存基盤に追加。

## 次セッション入口
1. deep-research wf_ab3da391-972 の結果を読む(自動テスト世界事例)
2. 複数タブ白化を自動検出する E2E/モンキーを設計・追加(手で特定する消耗を無くす)
3. 白化revert後の実機確認(両タブ白化が直ったか)
4. Web版の Vercel 設定(Upstash/env/ドメイン)→ スマホ閲覧を通す
