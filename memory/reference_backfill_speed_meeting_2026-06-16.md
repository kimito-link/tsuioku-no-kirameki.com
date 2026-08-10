# backfill 速度を根底から立て直す 会議+真因調査 結論(2026-06-16)

司令塔=Opus 4.8。ユーザー根底要求=「そもそも%という概念がおかしい。ローディングなしで一気に撮れる前提なので。」= AB両方(A=速度を根底から / B=%表示を不安にさせない形へ)。
会議=scripts/meeting.mjs(無料LLM全員集合・12体投げ5体応答: groq gpt-oss-120b/llama-3.3-70b・gemini(部分)・openrouter gpt-oss-120b・local qwen3:14b。reasoning系は cold-load/abort で欠席=既知の罠)。真因調査=Explore サブエージェント。**素材は実コードで全部裏取り済み**。

## ⭐最重要の構造事実(実コードで確認・会議の誤りを訂正)
- 内側の区画ウォーク(ndgrBackfillCrawl.js:833-883)は **`nextUri` が現区画の復号バイト内にある**(L847 `decodePackedSegmentNav(bwRes.bytes)` → L883 `backwardUri = nextUri`)=**連結リスト**。だから「同一 backward チェーンを 8-12 本並列 fetch」(会議 openrouter/gpt-oss が推した)は**原理的に不可能**(N+1 の URI は N を取得+復号するまで分からない)。→ **会議のこの案はそのまま採用しない**。
- 律速: `fetchWithThrottle`(L254)が毎 fetch 前に `await ctx.sleep(ctx.gapMs)`=**15ms の固定 gap**(L73 `NDGR_BACKFILL_FETCH_GAP_MS=15`)→ その後 `await ctx.fetchBinary`。**完全直列**: 総時間 ≒ Σ(15ms gap + RTT + 復号)。数時間配信=数千区画 → gap だけで数千×15ms=数十秒の純粋な空待ち。
- ⚠️ ただし gap は **429/403 回避の安全弁**(L66-71: 200ms だと 18h 配信 39% 止まり→30→15ms に下げた経緯あり。NDGRClient 参考実装は 10ms。403/429 受けたら NDGR_BACKFILL_BACKOFF_MS=[2s,4s,8s] で必ず減速)。**むやみに 0 にはできない**。
- **外側の reseed ループ(L757)は INDEPENDENT**: seedAtSec を 50s バケット(L110)ずつ過去へ下げて別の backward チェーンを張る=各チェーンは独立=**ここは安全に並列化できる**(内側チェーンと違う)。

## 速度を上げる安全なレバー(効果×安全 順・全部 実コードで実在確認)
1. **gap-sleep を復号/persist と重ねる(pipeline)**: 現状 `sleep(15ms)` が直列に挟まる。区画を取得したら**次の fetch の gap 待ちと、今の区画の decode/yield/persist を重ねる**(gap は rate-limit 用なので待つ必要はあるが、その間 CPU を遊ばせない)。最小改修・取りこぼし無し・429 リスク不変(レートは変えない)。**まずこれ**。
2. **gap を 15→10ms**(NDGRClient 同値)+ 429 backoff 安全網は不変: 直列のまま 1.5倍。最小の1行・ロールバック容易。ただし効果は限定的。
3. **外側 reseed チェーンを N=2-3 並列**(内側 next.uri チェーンはそのまま直列): 独立な seedAtSec チェーンを並列レーンで張る。順序は vpos で保証。**effort 大・最も効くが最危険**(429/前面固まり/visited 競合)→ TDD + 実機計測必須・段階導入。トークンバケットで合計レート上限を守る。
4. (調査agentの他案=COLD_RETRY_MAX 40→15・transient backoff 短縮・yield頻度・resume書き込み頻度)は**起動latency/堅牢性のトレードオフ**で、一気取得の主律速ではない。触るなら慎重に(v0.1.749/750 の経緯=空区画跨ぎ・stalled 根治とトレードオフ)。

## B(%表示を「一気に撮れた」体感へ)
- 「%取得中」の実況は popup 側 backfillRinkuNarration(content-entry.js:15117/15143-15146 に v0.1.657「ローディングなしで一気に取る」設計・ユーザーの『ローディングいらない・一気に』が既に引用済)。
- 会議全会一致(gpt-oss/llama/openrouter/qwen3)=**「%」は廃止 or 非表示**。代わりに「取得完了の一瞬の演出(光の粒子/トースト)」だけ。途中%を見せない=「一瞬で入った」体感。
- ⚠️ ただし**速度(A)を直さず B だけで%を隠すと「遅いのを隠しただけ」=ユーザーの根底要求に反する**。A を主、B は仕上げ。

## 進め方(Non-Negotiable・最危険境界)
1. **推測で直さない**: まず実機 fastDiag/romiDebug.backfill で **1区画あたりの実測時間・区画数・stopReason** を読む(律速が gap か RTT か復号か persist か確定)。これが無いと「15ms が効く」も仮説。
2. 1つずつ・TDD(red→green)・実機で「開いた瞬間に一気に入る(%が見えない)」をユーザー目視確認するまで完了と言わない。**verify緑≠動く**。
3. 並列化(レバー3)は段階導入: まず pipeline(1)→ gap(2)→ 効果不足なら reseed 並列(3)。各段で 429 ゼロ・前面固まり無し・取りこぼし無しを実機確認。
4. truly empty/若い配信/長尺(18h)の既存テスト(ndgrBackfillCrawl 71・gap-rearm 31)を壊さない。

## 🔴2回目の実機(v0.1.759反映済)= A1 では全然足りず=律速は別(2026-06-16)
- 実機: 公式11,415/記録2,675=**23%**・経過**6時間45分**・「最終取り込み4秒前・取り込み中」。A1(先読み)反映済でこれ=**per-segment の重なりは律速ではなかった**(推測が外れた・推測で直すなの典型)。
- ⚠️**ユーザーにコンソールを触らせない前提**(状態速報は会場パネルで完結させる)。`copy(romiDebug...)` 依頼は筋違い=禁止。
- 真因調査(Explore)+実コードで判明した**構造上の天井**:
  - 単一 crawl は **elapsedMs=900_000(15分)** 上限(ndgrBackfillCrawl.js:58)。コメント曰く「18h配信でも1巡回で遡り切る」設計=本来 6h45m は**1巡回で数秒**で終わるはず(v0.1.657: **2,695件で約2.5秒**)。
  - なのに6h45m wall-clock で23% = **1巡回が完走していない/頻繁に中断され、re-arm に頼っている**。re-arm は **OFFICIAL_GAP_DEEP_TIMING.cooldownMs=36_000(36秒)× maxGapRearms=40 = 24分ぶん**(timingConstants.js:122/142)で**有界**=長尺はここで頭打ちの疑い濃厚。
  - resume は機能(resumeFromVpos で続きから・content-entry:15440/15483)=restartではない。だが「1巡回が完走しない理由」が未確定(中断源=rotation_yield 90s? visibility? 今セッションの v0.1.751/758 priority 系? cold-seek が長い? cap_elapsed?)。
- **スモーキングガン**: v0.1.657 設計『2,695件=2.5秒で一気・popup へは done=1 時だけ橋渡し(途中%を見せない)』(content-entry.js:15145-15157)。実機は2,675件で**止まって**いる→「取り込み中」は RT 記録で、backfill は進んでいない疑い。`data-nls-backfill`(html属性・常時更新・content-entry:15136)に **stopReason** が出ているはずだが**パネルに見えない**。
- **次の一手(推測で直さない)= まず律速を"パネルで見える化"**(コンソール禁止前提): backfill が記録≪公式で止まっているとき、stopReason/seg/rows/rearmCount を**ユーザーがスクショする会場パネルに小さく出す**(KEY_BACKFILL_PROGRESS は done=1 時だけ書く設計なので、stuck 時の diag 専用フィールドを足すか、別 diag キーで橋渡し)。これで次スクショが「23%で何の stopReason か」を一発で示す→真の律速を確定してから cooldownMs/中断源/cap を直す。
- ⚠️候補(調査agentのrank1)=cooldownMs 36s→短縮は**band-aid**(なぜ1巡回が完走しないかを直さないと不十分)。確定後に。

## ✅根治(v0.1.760・7f10fdfc・master push済)= 真因は「再開の間隔が36s固着」(調査agentの40-cap説は誤り)
- **調査agentは『maxGapRearms=40 上限で頭打ち』と断定したが実コードで誤りと判明**: v0.1.665(content-entry.js:15684-15693)が『進捗(rows>0)があれば再アーム/transient 予算を全回復』するので、前進し続ける限り40上限には達しない(shouldResetBackfillRetryBudgetAfterRun=rows>0でtrue・backfillTransientRetry.js:66-69)。→ **エージェントの結論は鵜呑みにせず実コードで裏取りすべし**(今回も裏取りで救われた)。
- **真の律速=再開の【間隔】**: maybeRearmBackfillForGapCatchup(content-entry.js:15739-)は通常 cooldownMs=36秒間隔。ただし `_backfillPriorityBoostUntil` が新鮮な間だけ 5秒(BACKFILL_PRIORITY_COOLDOWN_MS)に短縮(:15749-15752)。その boost を立てるのは onTabVisibleForCommentHarvest(=visibilitychange・:11895)だけ=**2h+ visible のまま開きっぱなしの単一タブは boost が120秒で失効→以後ずっと36秒間隔**。長尺は cap_elapsed(15分)で1巡回を区切り resumeFromVpos で続きから何度も再開する設計なので、36秒×多数回=数時間でも23%で止まって見える。**v0.1.758(2%固着)と同型 disease=『visibilitychange でしか更新されない印が安定単一タブで失効する』**。
- 修正=maybeAutoStartBackfill(毎tick)で前面(hasFocus)+記録+visible タブは `_backfillPriorityBoostUntil` を毎tick更新→続きからの再開を常に5秒間隔に保つ。裏/非前面は従来36秒(負荷不変)。
- ⚠️**注意=5秒×多数回でも長尺は数分かかり得る**(1巡回15分cap内でどれだけ深く遡れるか次第)。もし実機で体感不足なら次段=①cap_elapsed内で1巡回をより深く(seek/empty-reseed の無駄を削る)②B(%表示を出さず完了演出)。**まず v0.1.760 の効果をユーザー実機で確認**(6h45m級で23%が解消し一気に追いつくか)。
- 教訓(20年後らく)=「visibilitychange 起因の印」は安定タブで失効する罠が再発した(v0.1.758→760)。**今後 priority/boost/freshness 系を足すときは『安定した単一タブでも毎tick自己更新される』ことを必ず担保**(visibilitychange 単独依存にしない)。

## 第3回 会議(2026-06-16)= ユーザー「20分配信でも43%・%という概念がある=一気に取れる前提が崩れてる」
会議(無料LLM 12体投げ6体応答: groq gpt-oss-120b/llama・gemini(部分)・openrouter gpt-oss-120b・local qwen3.5:9b/qwen2.5:14b)。素材=.artifacts-bf-redesign.json。
### 会議の全会一致 #1 = 「区画入口の seek を毎回やり直しているのが真の律速」(gpt-oss-120b/openrouter/qwen3.5/qwen2.5 が揃って最致命と断定)
- 実コードで裏取り: `seekBackwardUri`(ndgrBackfillCrawl.js:586)は最大20hopのfetchを伴い、**reseed のたびに(:776)呼ばれる**。空区画には150ms pause(:984)。50秒バケットで遡るので reseed 回数=配信秒/50。各 reseed が seek(複数fetch)+pause → 「区画を辿る」より「入口を探す」方が重い。
### ⚠️会議の却下案(実コードと矛盾・LLMはNDGR構造を知らない)
- 「時刻→URI を直接生成して全区画を並列 fetch」(gpt-oss/openrouter/qwen 多数)=**不可能**。next.uri は各区画の復号バイト内の不透明値で時刻から予測できない(A1で確認済)。URI量産・大規模並列は誤り。
- 「一括取得API」(qwen2.5 が正直に『存在しない』と明言)=無い。
### 実コードで確定した症状の切り分け(エージェントの説2連続誤りを訂正)
- **20分配信で108行取れている=everMadeProgress=true → no_progress 予算は240(:154)で、20分(~24バケット)では到達不能。よって『COLD_RETRY=40 枯渇』(調査agent説)は誤り。** 残る候補=①reached_start 誤判定(:954-957 chainLooksLikeStreamStart・NEAR_START_VPOS_CS=3000=30秒) ②公式250が gift/system/広告/空本文を含む=**分母過大で43%は見かけ**(backfill は本文ありコメントのみ記録) ③まだ巡回中(リロード直後)。**この3つの切り分けが未確定=実機の stopReason が要る**。
### 次の実装方針(会議#1 を実コード制約内で・効果順・1つずつ実機確認)
1. **seek コスト削減(会議#1・最有力)**: reseed のたびの seek を減らす。具体=①空区画 pause(150ms)を前面タブで短縮/撤廃 ②reseed step を最適化し visited 重複 seek を減らす ③直前チェーンの終端 nextAt を次 seed のヒントに使い seek hop を減らす(seek 結果の部分キャッシュ)。連結リスト構造は変えない・取りこぼし無し。
2. **分母の正直化(B の正しい形)**: 公式 statistics.comments が非記録メッセージ(gift/system/広告/空本文)を含むなら「%」は見かけ。記録可能コメントの分母に補正 or %でなく「最新まで取得済み/さかのぼり中」の状態表示に。**速度(1)を直さず分母だけ触るのは逃げ=まず速度**。
3. (将来)cap_elapsed 内で1巡回をより深く・前面タブの seek/pause を最小化。
### 教訓
- LLM会議は『NDGR の next.uri が予測不能な連結リスト』を知らないので URI量産/大規模並列を推す→**司令塔が実コード(next.uri は復号バイト内)で必ず却下**。会議の価値は「seek 繰り返しが律速」という構造的気づき(これは正しい)。
- 調査エージェントは2回連続で根拠誤り(40-rearm cap・COLD_RETRY=40 枯渇)→**実コードで everMadeProgress/予算を必ず追う**。

## 関連(直近の経緯=壊さない)
- v0.1.749 COLD=40(若い配信序盤の空区画跨ぎ) / v0.1.750 stalled→backoff / v0.1.751 N=2スロット+前面譲らず / v0.1.758 前面タブ priority 再アサート(2%固着根治)。
- 「4万件一気取得」は git 17f02d33/v0.1.696 で実証=能力は実在。[[reference_backfill_cold_retry_meeting_2026-06-15]]
