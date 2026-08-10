# 引き継ぎ: 過去ログ取得(backfill)が rows:0/seg:0 で「コメントが取れる量が少ない」(2026-06-17)

> このファイルは次セッション(新チャット)への引き継ぎ。会話全文は貼らない。要点のみ。
> 司令塔 Claude Code 本体が読む前提。COUNCIL-HOWTO / AGENTS.md / memory/MEMORY.md を先に読むこと。

## ユーザーの訴え(最新)
「コメントが取れる量が少ない」。実機状態速報(2026-06-17T11:18・v0.1.814 反映状態は要確認)で、
**2配信とも過去ログ(backfill)が rows:0・取得率 2〜7%** と極端に低い。リアルタイムは取れている。

## 実機データの決定的事実(状態速報 fastDiag より・推測でない)
- lv350535063: 記録193 / 公式8,104(**2%**)・経過1:18・来場5043(大配信)
- lv350772253: 記録135 / 公式1,827(**7%**)・経過20分・来場1606
- **両方とも `romiDebug.backfill = { running:true, rows:0, seg:0, done:0, stopReason:"", fullSweepForced:true, gapRearmCount:0, resumeFromVpos:null }`**
  = 過去ログ取得が走行中なのに【1セグメントも取れず1行も取れていない】。
- `commentObservability.commentIngestBySource = { backfill:0, deep:118, mutation:264, ndgr:29, visible:390 }`
  = backfill 由来が完全に0。記録はリアルタイム(visible/deep/mutation/ndgr)だけで積んでいる。
- `ndgrViewBaseObserved: true`(NDGR view base は観測済=入口の素はある)。
- networkErrorProbe: ndgrConnectStatus "connected"・ndgrLastError null(NDGR 接続自体は生きている)。
- multiTabDiag: eventDomLvCount 31・staleDomBundleSuspected true(過去配信キャッシュ蓄積はまた出ている)。
- 2配信同時視聴(タブ2)・大配信(8104件)あり=スロット競合の可能性。

## v0.1.814(直前にやったこと)との関係=要切り分け
- v0.1.814(5bf40fbf)は「rows>0 で橋渡し中に 150秒 stall watchdog が誤殺」を直した(空 reseed で
  bridging:true を yield)。**だが今回は rows:0・seg:0=【橋渡しに入る前・入口で0件】の別問題**。
  v0.1.814 は「進み始めた後の失速」を直したが、今回は「そもそも1セグメントも取れない(入口を取れない)」。
- ⚠️まず確認: ユーザーが v0.1.814 を反映済みか(ビルド番号 b0617-2010 以降か)。未反映なら古いコードの観測。

## 過去の同系統の知見(memory・必ず読む)
- handoff_2026-06-15_backfill_stalled.md / handoff_2026-06-16_backfill_2pct_regression.md /
  handoff_2026-06-17_backfill_background_tabs.md
- reference_backfill_cold_retry_meeting_2026-06-15.md: **COLD_RETRY_MAX(everMadeProgress=false の
  入口空振り上限)** が真因だったことがある(12→40 に調整済・ndgrBackfillCrawl.js:191)。
  若い配信/序盤空区画/並列で巨大裏配信にスロットを食われると入口に届く前に backward_exhausted。
- reference_backfill_speed_meeting_2026-06-16.md: 「取得率は分母過大(gift/system 混在)で見かけ低い」。
  だが今回は 2%/7% は明らかに低すぎる=分母問題だけでは説明つかない=本当に backfill が取れていない。
- reference_backfill_sw_migration_pr1b.md: SW crawl 経路・スロットプール(N配信並走)。
- ⚠️教訓(何度も): **会議/探索AIは backfill の真因を毎回ハルシネ→実コードで裏取り必須**。
  「maxGapRearms 上限」「COLD_RETRY 枯渇」など断定されたが実コードで誤りだったことが複数回。

## 真因の候補(司令塔が実コードで裏取りして1つに絞ること)
1. **入口(seekBackwardUri/initialBackwardUri)が取れていない**: seg:0 = 最初の backward URI すら
   取れていない。`ndgrViewBaseObserved:true` なのに入口0=view→backward の seek が空振り。
   ndgrBackfillCrawl.js の reseed=0 経路(initialBackwardUri)と seekBackwardUri を実コードで追う。
2. **スロット競合で起動を譲り続けている**: shouldYieldBackfillToWatchedTab(content-entry.js:16361)で
   大配信(8104件)にスロットを取られ、両タブとも起動見送り→rows:0。runInBackfillSlot/runIfTabLeader。
   だが running:true なので「起動はしたが入口0」の可能性の方が高い=要確認。
3. **fullSweepForced:true なのに resumeFromVpos:null で毎回最初から空振り**: 何かが crawl を即終了
   させて running フラグだけ立っている(=running:true だが実際は回っていない)可能性。
4. **COLD_RETRY_MAX(40)を使い切って backward_exhausted→running リセット待ち**: ただし stopReason は
   ""(空)なので「まだ走行中」表示=④なら stopReason に何か入るはず=要確認。

## 次セッションの進め方(COUNCIL-HOWTO 手順)
1. まず **v0.1.814 反映済みか**確認(ビルド番号)。未反映なら反映後の再観測を待つ。
2. ndgrBackfillCrawl.js の【入口取得(reseed=0・initialBackwardUri・seekBackwardUri)】と content-entry.js の
   【backfill 起動ゲート(runNdgrBackfillOnce/shouldYieldBackfillToWatchedTab/runInBackfillSlot)】を実コードで確認。
   特に「running:true・seg:0・rows:0・stopReason空」がどの状態か(起動したが入口0 / スロット譲り / 即終了)を特定。
3. **お題を council/backfill-rows0-seg0-entry.md に書いて会議**(COUNCIL-HOWTO §B・User スコープ env キー必須・
   PowerShell ラッパで [Environment]::GetEnvironmentVariable(name,'User') を process env へ push)。
   会議結論は素材・司令塔が実コードで裏取りして1案に。
4. 記録の永続(IDB/chunk/テール)不変・新 storage 書き込みゼロ・純関数化+テスト・1変更=1patch。
5. 実装後 verify:cc 全緑→commit→push。version bump 3点同期(manifest/package/changelog・summary≤35字)。
   反映3手順併記(git pull→拡張リロード→watch F5)。

## このセッションで完了済み(参考・v0.1.805〜814・全 master push 済)
805 保存ダイアログ連発OFF / 806 HTML保存タイムアウト根治+完了音声 / 807 アバター/プロフィール解決chunk対応 /
808-812 星野ロミ式ファクタリング5部品(autoBackupState/eventSelfStatusHeaderHtml/eventRankingSectionHtml/
reportNextMemoSectionHtml/externalLinksSectionHtml・popup-entry 21217→21025行) /
813 スクロール重い(裏タブ重いpaint見送り) / 814 backfill stalled(橋渡し誤殺)根治。
⚠️cursor-agent CLI は認証未設定で起動不可・Codex CLI は usage limit(6/21 05:56 リセット)で外注不能=
司令塔直接実装に切替えた。6/21 以降は Codex で buildHtmlReportDocument 残りセクション外注可。

## 星野ロミ視点(ユーザーが繰り返し求める軸)
失敗体験の除去(「取り込み中と言って0件」は最大の失敗体験=最優先で潰す)・既にあるデータを活かす・
重くしない/有界/割り切る・計測志向(状態速報の実データ駆動)。ユーザーは「地味でも根を断つ」を支持。
