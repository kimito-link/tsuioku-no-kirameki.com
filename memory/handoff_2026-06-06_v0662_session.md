# 引き継ぎ 2026-06-06（v0.1.645→662・18版出荷）

次セッションでこのプロンプトをそのまま貼れば続きから始められます。

---

## 次セッション入口プロンプト（コピペ用）

```
追憶のきらめき拡張の続き。前セッションで「一気に取れない」の真因を7つ根治し
(v0.1.642〜662)、診断JSON共有フローを確立、独自コメビュ(comeview.html)の土台と
本体も実装した(memory/handoff_2026-06-06_v0662_session.md に全経緯)。

# 最重要・進行中タスク: 複数タブ並列backfill(会議完了・PR1から実装)
ユーザー要求(絶対)=「一気に取れなきゃダメ・%(途中経過)はダメ」。単一タブなら
708件/秒で数秒完走するが、6配信を同時に開くと rotation_yield(90秒譲り合い)で
各配信が9件/秒に薄まり32%等で止まって見える=これが残る真因。
ユーザー承認済み方針=「開いてる配信を並列で一気に取る」。

## 3視点会議 wf_154e2c9a-2ef 完了・結論(3視点完全一致):
**グローバルロック1本→並列度Nスロットプール化 + rotationゲートを「空きスロット無い時だけ譲る」に条件強化。完全並列(N=6一斉)でなくN=2上限から開始し、前面タブ固まり(v0.1.631)と429を実機で潰しながらN=3→6へ。** crawlは既にper-tab AbortControllerで並走可・persistはlv別で無競合=唯一の直列化器ロックだけを段階的にゆるめる。「単一タブ掘り切り(v0.1.642)」を1bitも壊さない。

### PR分割(各1commit/push・2変数同時に動かさない):
- **PR1(最初)**: N=2上限スロット + rotationスロット化 + 429観測のみ
  - 新規純関数 `src/lib/backfillSlotPool.js`(test必須): BACKFILL_PARALLEL_SLOTS=2、
    backfillSlotLockNames(n)=['nls-heavy-backfill-0','nls-heavy-backfill-1']。N=1で現状と完全同一(巻戻し可flag)
  - `backfillRotationGate.js:34` に shouldFireBackfillRotationWithSlots({waitingLiveIds,selfLiveId,parallelSlots})追記
    (既存 shouldFireBackfillRotation 不変=後方互換)。判定=others.length>=parallelSlots。
    parallelSlots=1で既存とビット同値=単一タブは絶対譲らない(v0.1.642温存)。test追記
  - `content-entry.js:15765` の runWhileGlobalLeader(GLOBAL_BACKFILL_LOCK,...)を
    「スロット名を順に ifAvailable で試し取れた枠で実行・全埋まりなら ran:false→既存待機登録」に差替
  - `content-entry.js:15240-15258` rotation呼び出しをslots版に・parallelSlots=2渡す
  - 429観測カウンタを _backfillProgress.diag に積み status.html 表示(診断のみ・挙動不変)
- **PR2(重ければ)**: 動的throttle純関数 backfillSlotAutoThrottle.js
  (resolveEffectiveBackfillSlots=yield復帰遅延EWMAが閾値超で有効スロットN→1自動降格・軽くなれば復帰)
- **PR3**: per-lvロック runIfTabLeader('nls-backfill-'+lv) を外側に・内側Nスロットの二段で
  同一放送多タブの nls_cchunk_index_<lv> race 根絶(別lvでは即起きないので後回し可)
- **PR4**: tokenBucket.js(実装済み未配線)を session storage共有でbackfill fetch経路に配線・
  合計req/sを単一タブ相当から開始→429ゼロ確認後にN=3→6へレート上げ

### 触らない(7根治を壊さない):
crawl本体(ndgrBackfillCrawl.js の forceFullSweep/time-flush/backoff)・persist flush await・
グローバルenabled撤去・no_progress自動リトライ・タイムシフト入口探索・aborted自動再開・
visibility_paused再アーム を1つも変更しない。変更はロック層(tabLeaderLock.js)とrotationゲート
(backfillRotationGate.js)に限定。全新規分岐は parallelSlots=1/スロット1本で既存挙動とビット同値に縮退。
**hidden即abort(content-entry.js:15230)は温存**(hidden継続化はv0.1.633/661と干渉するので単独PRで・PR1ではやらない)。

### 検証(chrome-devtools-mcp 実機):
①verify全緑 ②extension install→高速配信2タブ同時(NHK総合+BS実況等) ③各タブ status.html で
storage読み→両タブ同時にrows伸長・数秒でreached_start=並列成功 ④429観測カウンタ=0 ⑤単一タブ回帰
(1配信で一気に掘り切る・rotation不発・v0.1.642温存) ⑥前面固まり回帰(7000件級タブがrows伸長中に
2本目開いて前面記録が止まらない=hidden即abort有効。止まれば即PR2)

### 会議出力の場所:
C:\Users\info\AppData\Local\Temp\claude\...\tasks\wdnf92obt.output
(消えていれば parallel-backfill-design-meeting 再実行)

### 関連file:line:
tabLeaderLock.js:94(GLOBAL_BACKFILL_LOCK)/:107(runWhileGlobalLeader)=スロット化差替先・
backfillRotationGate.js:34=slots版追記・content-entry.js:15765(ロックwrap)/:15240-15258(rotation)/
:15229-15231(hidden abort温存)・ndgrBackfillCrawl.js:73(gap15ms)/:258-266(429backoff)・
globalBackfillQueue.js:15(ROTATION_MS=90000)・tokenBucket.js(未配線=PR4)・
新規 backfillSlotPool.js(PR1)/backfillSlotAutoThrottle.js(PR2)

# 検証フロー(確立済み・必ず使う)
- ユーザーが status ページの「fastDiag 診断JSON」をスクショ/貼付で共有してくれる。
  romiDebug.backfill.stopReason が真因特定の鍵(reached_start=完走/no_progress=疎区間/
  backward_exhausted=入口無し/aborted=複数タブ中断/cap_*=上限)。
- 私の環境(chrome-devtools-mcp)では大規模配信が再現しづらい。ユーザー実機の
  診断JSONが唯一の確実な手がかり。推測で版を重ねず、stopReasonを断定してから直す。
- status.html(v0.1.659)に stopReason 表示済み・status経由で chrome.storage 読むのが
  SWビジー時も安定。

ブランチ=fix/koken-contrib-hidden-tab-stuck。1抽出=即commit/push。
承認フロー(AskUserQuestion)は重要分岐だけ。verify全緑+実機/診断で実証してから報告。
```

---

## このセッションの成果（v0.1.645→662・全push済み）

### 🔴 「一気に取れない」の7真因を根治（最重要）
ユーザーの粘り強い実機指摘+診断JSON共有で、別々の7つの穴を順に潰した:
| 版 | 真因 |
|---|---|
| v0.1.642(前) | rotation_yield が単一タブでも打ち切り→単一タブは掘り切るよう修正 |
| v0.1.647 | 完走後の persist flush 漏れ(await persistCoalescer.flush 追加) |
| v0.1.651 | 完走時にグローバル KEY_BACKFILL_ENABLED=false→別配信に波及 |
| v0.1.654 | persistバッファ8000→2000+時間flush2.5s(中断でpending消失) |
| v0.1.658 | no_progress(疎区間)が自動リトライ対象外→official 95%未満なら継続 |
| v0.1.660 | タイムシフトで入口探索が現在時刻ズレ→programStart複数オフセット候補 |
| v0.1.661 | 複数タブで互いをabort→aborted も自動再開対象に(visibility_paused合流) |

### ✅ 表示・即時化(数値ズレ/ローディング)
- v0.1.645 コメント数ズレ(単調増加ゲート monotonicCommentCount.js)
- v0.1.646 来場者数ズレ(同接/累計混在解消 resolveVisitorCount.js)
- v0.1.648 スクロール白化(content-visibility撤去)
- v0.1.649 POPスクロール重さ(defer+参照メモ化)
- v0.1.650 **JSONキャッシュ即時表示**(storage.session・開いた瞬間に全部)
- v0.1.653 公式値レーンのローディング全廃(待機UI mount撤去)
- v0.1.656 CSS ::after の「取得待ち」文言全廃(消し残し)
- v0.1.657 取得の途中経過実況やめ「黙って一気に取り完成だけ」(done!=1 return)

### 🌟 独自コメビュ「KIRAMEKI Comment View」
- v0.1.652 comeview.html + comeview-entry.js(読みやすい普段使い・別窓・OBS透過?obs=1)
- 土台: danmakuLaneScheduler.js(弾幕)・comeviewRows.js(表示行)・両方テスト済
- v0.1.655 応援タイムラインの匿名アイコンを identicon に
- 会議正本=[[reference_kirameki_comebyu_meeting]]

### 📋 競合調査・追憶の道(reference化)
- [[reference_comebyu_competitors_and_oauth]]: ニコ生公式OAuthは個人に門が閉じてる
  (わんコメは事業者client_id)→追憶の無認証NDGR傍受が唯一現実解。ブラウザ単体では
  NDGR取れない(CORS)=拡張必須。ハイブリッド=取得は拡張・表示はWeb(配信者OBS用は
  サーバ不要・拡張無し公開だけサーバ必須)
- [[reference_comebyu_gaps_vs_competitors]]: 追憶に足りない機能(優先順)=①読み上げTTS
  ②NGワード③検索④コテハン⑤設定ページ。強み=backfill遡り全件/きらめき分析/3キャラ
- [[reference_comebyu_uiux_learnings]] [[reference_design_tokens_shadcn_socialxup]]:
  shadcn/SocialXupのUIUX学び(デザイントークン)。追憶は既にフラットでダサくない

---

## 並列backfill 会議の前提（次セッションの実装正本）

### ユーザー要求(絶対)
6配信を同時に開いても各配信が即座に(数秒で)100%取り切れるべき。「%はダメ・一気に取れ」。

### 現状の排他機構(なぜ1タブずつか・file:line)
- グローバルロック GLOBAL_BACKFILL_LOCK='nls-heavy-backfill'(tabLeaderLock.js:94)=
  Web Locks ifAvailable で全タブ横断「同時1タブのみ」。runWhileGlobalLeader(content-entry.js:15765)
- rotation_yield GLOBAL_BACKFILL_ROTATION_MS=90000ms(globalBackfillQueue.js:15)。
  発火=待機タブに自分以外(backfillRotationGate.js:34・単一タブは掘り切る=v0.1.642)
- 待機タブ管理=session storage nls_backfill_waiting_lvs_v1

### 1タブ排他にした理由(過去の実害)
- v0.1.606 長時間配信「ページが応答しません」対策で rotation 導入
- v0.1.631以前 per-liveIDロックだと複数タブ×複数放送で各タブが自分のリーダー→
  共有レンダラで同時フルbackfill→**前面タブが固まる(7800件順調タブが別放送開いた途端停止)**
- v0.1.632 グローバルロックで「全タブ横断・同時1本」に統一して根治

### 並列化で壊れうる4リスク(未検証)
1. 429: fetch gap=15ms(~33req/s・ndgrBackfillCrawl.js:73)。複数タブ同時で全体44req/s→
   429来るか不明。backoff=[2000,4000,8000]ms。1タブ429で rateLimited=true→巡回全体中断
2. ページ重さ: backfillYieldToPage(6区画ごとscheduler.yield)で複数タブ同時防げるか未確認
3. index競合: nls_cchunk_<lv>_<seq>(1000件/chunk)は lv/seq 違えば安全。だが
   nls_cchunk_index_<lv> 同一放送同時更新で race(最後writer勝ち=欠落)。別lvなら無競合
4. 前面タブ固まり: hidden化後crawl継続でレンダラ過負荷(v0.1.631実機報告)

### persist は lv 別なら安全
異なる放送=異なるchunk key→write競合なし。persistCoalescer(persistThrottle.js)は
per-tab独立・flushMutex直列化。

### 取得速度の事実
- 速い配信 lv350658453: 708件/秒で数秒完走(単一タブ相当)
- 遅い配信 lv350689733: 6タブ環境で90秒rotation→9件/秒→32%で止まって見える
- 速度差の主因=①コメント疎密度(疎な配信は幅広バケットで区画効率低)②多タブrotation
  (6タブで1cycle9分)③storage I/O O(N²)

---

## 状態
- ブランチ fix/koken-contrib-hidden-tab-stuck・HEAD=09a90ee(v0.1.662)・全push済
- PR #?(koken-contrib系)。今日の18版は未merge(このブランチに積層)
- 取得は単一タブでは完璧(708件/秒・100%完走)・複数タブ並列化が最後の残課題
- 検証環境: chrome-devtools-mcp(.mcp.json)で拡張自律ロード/リロード可・install_extension
  で extension/ 入れるとID同一。ただし大規模配信再現しづらく、ユーザー実機の診断JSONが鍵

## 次セッション最優先
1. 会議 wf_154e2c9a-2ef の結論確認→並列backfill 最初の1PR(安全な段階導入・前面タブ固まり
   再発させない)。会議出力が消えていれば parallel-backfill-design-meeting 再実行
2. (取得安定後)コメビュ機能拡充=読み上げTTS等([[reference_comebyu_gaps_vs_competitors]])
