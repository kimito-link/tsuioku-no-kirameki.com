# 引き継ぎ (2026-06-30) — 状態速報の計器整備・記録>本家の誤検知/本物二重の決着・複数配信の重さ緩和

> 新チャットへ。会話全文不要。正本ルール= ~/.claude/CLAUDE.md(§1 ツール文字列を本文に書かない・§4 長セッション) +
> プロジェクト CLAUDE.md→AGENTS.md。詳細経緯は memory/handoff_2026-06-30_*.md(下記)が正本。

## 0. 現在地(一行)
- master HEAD = **v0.1.1013 (a4a75a5a)**・origin 同期 **0/0**・C:\nicolive-ext も v0.1.1013。
- 作業ツリーの未コミットは **dist のビルドIDノイズ(NL_BUILD_ID だけ変わる)+ scripts/meeting.mjs(セッション開始時から)** のみ=捨ててよい。

## 1. このセッションで出荷した16版(v0.1.998〜1013・全 push 済み)
状態速報(status.html)の診断計器の整備と、ユーザー実機スクショを毎回もらって真因確定→出荷、を繰り返した。
- **描画の実機verify**: ②応援ライブビュー(extension/live-view.html)・③WEB(app/live-view.html)に①と同一フル状態速報が出ることを確認(セッション最初)。
- **記録>本家コメ(誤検知)を完全決着**: 998(欠落の一時二重)→1001/1002(欠落割合の内訳計器)→1003(鮮度クロック取り違え=
  コメ取込時刻でなく公式統計更新時刻 officialCommentStatsAgeMs で判定)→1007(時系列デルタ 本家Δ/記録Δ の見える化)→
  1008(時系列ガード=過剰増が無ければ normal)。
- **記録>本家(本物の二重計上)を根治**: 1012(チャンク read の部分失敗=非配列を黙ってスキップ→keySet 不完全 seed→
  再到来コメントを新規誤判定→二重。complete フラグで requeue)→1013(さらに【合計件数 < index.total】も部分読み扱いに強化)。
- **読み上げ追従🔴**: 1004(synthesizeVoice の arrayBuffer() タイムアウト無し→await_prefetch 永久固着。Promise.race で打ち切り+
  会場非稼働時の stale voiceDiag を na に)。
- **応援レーン🔴誤報**: 1006(匿名主体=userId付き率<10% は顔タイル0が正常。empty_source_anonymous で🔴にしない)。
- **貢献度鏡🔴誤検知**: 1000(鏡は設計上10件 cap。生API深度42 と突合してたのを cap でクランプ)。
- **計器**: 999(backfill スループット=経過秒/再シード回数/約1区画ms)・1005(更新所要 計器をコピー本文にも)・
  1011(チャンクモードで uid 集計が totalSaved:0 になる誤集計を running 集計で根治)。
- **診断ページの重さ**: 初期ロードはコードは無罪(実測 LCP 42〜54ms・データ量無関係)=環境(Claude多重/Chrome)が主因
  (claude-health-check で確認・整理で開けた)。更新サイクルは 1009/1010(所要比例の間引き=頻度を下げる)+
  1013(timeline mirror の無変化 set スキップ=書込競合を減らす)。

## 2. 次の一手(ユーザーが最後に見ていた残課題・最優先順)
ユーザーは状態速報スクショを見ながら進める。直近スクショ(3配信同時記録中)の残課題:
1. **更新所要の【1回の重さ】**: 3配信+backfill で 11694ms まで膨れる(fastDiagLite/popupDiag/backfill が各2-3秒=単一
   LevelDB の書込競合で read が待たされる)。1013 の timeline skip は書込の一部を減らすだけ=まだ重ければ次の安全レバー
   (Explore 提案・効果順): (A)panel_summary/各鏡も無変化skip (B)backfill staging 周期(2500ms)を content persist(1500ms)と
   ずらす (C)KEY_AUTO_BACKUP_STATE を per-liveId 分割(SW改造・会議級)。**ユーザーが「おすすめ(A)で」と言っていた**=次は(A)。
2. **二重がまだ出るか確認**: 1012/1013 で部分読みを断ったので、次の高負荷スクショで時系列計器が「過剰増なし(本家Δ≈記録Δ)」に
   戻れば二重根治の確認。もし まだ 本家+0/記録+N が出るなら、ensureLiveDedupeStateSeeded の **storedTotal===myTotal skip
   (content-entry.js:10168)** を Explore 案A(write 前に liveChunkIndex を更新)で詰める(今回は readChunkedComments の件数欠け
   検出が主因と判断し先に断った)。
3. **会場座席(venue-seats)**: 完全性スコアの最後の不合格(75%・あと1項目で100%)。会場モード使用時に切り分け。未着手。

## 3. 既知だがバグでないもの(誤って直さない)
- popup診断「🔴別配信」・応援者ランキング「🟡別配信の古い鏡」= **複数配信視聴で popup が別 lv を映している正常な検知**
  (watch F5 で直る・状態速報自身が案内)。これは仕様どおりの動作=バグでない。
- 北極星 貢献度の 拡張N≠鏡M が**出たり消えたり**= API 更新の谷間の**一時的な鮮度差**の可能性。安定再現したら
  publishNorthStarMirror/refreshNorthStar*LaneAsync を調査。大差が居座るなら本物(過去 1000 で cap 誤検知は解消済)。
- backfill 律速そのもの(取得が遅い・取得率%)= 999 で計器を入れた。**次に長く配信を開いたときの「⏱ 取得速度」実測待ち**
  (seek が律速か)。これは「取り込み中に診断が重い(1013で緩和)」とは別系統。

## 4. 地雷マップ(このセッションで踏んだ/学んだ)
- ★**Explore サブエージェントは今セッションで6回根拠を外した**(cleanNdgrChatRows の text 差・lid 取り違え・同タブ race 等)。
  **結論は必ず実コードで裏取りする**。特に dedup(buildDedupeKey は内部で normalizeCommentText するので text 正規化差はキーに
  出ない)・keySet の seed/共有・persist の直列化(persistCommentRowsChain で同タブ並行 flush は起きない)は実コード確認必須。
- ★**「正常を🔴/🟡にする診断バグ」が頻発**(読み上げ stale・応援レーン匿名・貢献度cap・記録>本家遅延)。新しい診断を足すときは
  「正常な状態を異常表示しないか」を必ず確認。母数/鮮度/上限の前提を診断側と producer 側で一致させる。
- ★**チャンクモードの集計/dedup は「next=新規行だけ」**(全件配列は作らない・content-entry.js:11461)。全件母数が要る集計は
  running aggregate(seed1回+加算)にする。全件 read を毎フラッシュ足さない(O(N)で重くなる=今セッションの重さの元)。
- ★**単一 LevelDB は並行 read で stall**(status-entry.js:317)。status の read を雑に Promise.all しない(v0.1.867 で退行・撤回済)。
  重さ対策は「書込競合を減らす」or「read 頻度を所要比例で間引く」。書込側を触るときは記録を壊さない(無変化skip・周期ずらしは安全/
  AUTO_BACKUP 分割は会議級)。
- **表示が出ないときは間引き/whitelist/lite 層を疑う**: 計器を足しても出ないことが2回あった(throughput=loadBackfillProgressSafe の
  whitelist・内訳=buildStatusFastDiagLite の lite 間引き)。status は full でなく lite(~1KB)を読む。
- **max-lines ラチェット(eslint.config.js)**・**feature-map/tree-map/site-health の drift**: 新 export を足すと verify:cc の
  tree-map が落ちる→`npm run tree-map && feature-map && site-health` 再生成してコミット同梱。changelog summary は35字以内。
- **版間でテストの前提が変わる**: 1008 で 1007 のテスト(遅延寄りでも check)が陳腐化→新仕様(normal)に更新した。前版の自分の
  テストが新版で矛盾したら更新する。

## 5. 実機検証の確立手法(超重要・有効)
- ユーザー配信に触れず chrome-devtools MCP の別Chrome で検証: `npm run build`→`install_extension('...repo.../extension')`→
  `new_page('chrome-extension://<id>/status.html')`→ service worker/page で `chrome.storage.local.set` で seed→`evaluate_script` で
  DOM/probe 観測→`uninstall_extension`。拡張ID=edpellgokebgpjboflekdmmlnjgajnfn(再install で変わり得る・list_extensions で確認)。
- **純関数の出荷バンドル probe**: `node --input-type=module -e "import {...} from './src/lib/...'; ..."` で「出荷される実モジュール」の
  挙動を確認(毎版やった=実装と乖離しない)。DOM 不要な diag/集計はこれで十分、表示プラミング(whitelist/lite)が絡むものだけ実拡張 install。
- 初期ロード重さの実測: performance_start_trace で空/8000件/33MB をトレース=どれも LCP 42〜54ms(コード無罪を実証)。
- マシンが重い時: `powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\info\OneDrive\デスクトップ\claude-health-check.ps1"`
  (-Kill で放置MCP停止)。鉄則=Claude Code 同時1セッション(~/.claude/CLAUDE.md §8)。

## 6. 開発フロー(AGENTS.md §12.5)
1変更=patch 1つ。version 三者同期(package.json/extension/manifest.json/src/lib/changelog.js)= verify:bump が verify:cc に内包。
実装→`npm run verify:cc`(ハング回避・失敗時 .artifacts/verify-cc.log を Read)→ tree-map/feature-map/site-health 再生成→
明示パス stage→commit(末尾 Co-Authored-By: Claude Opus 4.8)→ master 直push→`npm run copy:ext`(C:\nicolive-ext へ)→
memory に handoff 1枚。ユーザー反映3手順= push 報告のたびに併記: **pull は司令塔代行・ユーザーは「拡張🔄リロード→watch F5」**。
③純Web は Vercel デプロイ別途。

## 7. このセッションの memory(正本・必要な行だけ読む)
- handoff_2026-06-30_chunk_partial_read_double_count_fix.md (1012・本物の二重の真因と計器3点の完成形)
- handoff_2026-06-30_multistream_contention_and_double_count_v1013.md (1013・3配信重さ+二重再発)
- handoff_2026-06-30_record_over_official_timeseries_guard.md (1008・記録>本家 誤検知の決着)
- handoff_2026-06-30_status_proportional_backoff.md / _status_backfill_contention_relief.md (1009/1010・更新の重さ)
- handoff_2026-06-30_uid_stats_chunkmode_totalsaved0_fix.md (1011・集計母数0)
- handoff_2026-06-30_voice_await_prefetch_stall_fix.md (1004・読み上げ固着)
- handoff_2026-06-30_lane_anonymous_false_red.md (1006) / _contrib_mirror_false_mismatch.md (1000)
- handoff_2026-06-29_3screen_status_parity_verified.md (②③描画verify) / _backfill_throughput_instrument.md (999)
