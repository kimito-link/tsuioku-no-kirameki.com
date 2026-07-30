# 引き継ぎ: 過去ログ一括取得(backfill)の退行修正 — 段1(計器)実装済み・段2実装待ち

_作成: 2026-07-03 / 司令塔Claude(Opus 4.8) / 段階1(会議)+段階2(Fable設計)完了_
_更新: 2026-07-03 / ★段1(走行中スループット計器)実装・commit 3c447c51・v0.1.1045・push済・C:\nicolive-ext 反映済_

## ★★ 次にやること(段2の前に): 実機で計器を見て律速を確定
1. Chrome で拡張リロード(chrome://extensions の🔄)→ watch タブ F5(反映3手順の2・3。pull と copy:ext は済)。
2. 途中参加の配信で状態速報を開き、概要の「⏱ 取得速度(走行中)」行を読む。
3. GO判定(本文§4): fg=1 かつ bridgingSteps≥dataSegs×0.7 かつ yields≈genSteps/6 かつ yieldWaitMsTotal/elapsedMs≥0.3 → yield bridging律速確定 → 段2 GO。
   - fg=0 なら真犯人は裏タブペース → 段2中止、前面判定の再設計へ(本文§段1分岐表)。
   - bridgingSteps≫dataSegs だが待ち小 → reseed/seek律速 → 別の一手。
4. 段2実装は本文§2の設計どおり(segmentsSinceYield を実データのみ加算+FORCE_YIELD_MS=2000)。

## 段1で実装済みのもの(commit 3c447c51)
- storageKeys.js: KEY_BACKFILL_LIVE_METRIC 新設(popup非依存の別キー)。
- content-entry.js: consumer で実区画/橋渡し/yield を数え、publishBackfillLiveMetric で1Hz別キー書込。finally で running:0 force締め。★segmentsSinceYield 加算ロジックは未変更(段2)。ndgrBackfillCrawl.js は無変更(固着回帰面ゼロ)。
- status-entry.js: loadBackfillLiveMetricSafe 追加。running=1&&15秒以内で「⏱ 取得速度(走行中)」表示。
- backfillRinkuNarration.js: backfillLiveThroughputLine 純関数(+test7件)。約1区画は実区画で割る。
- popup が新キーを読まないこと grep 機械確認済(src/dist とも0件)。テスト136件green・typecheck green。

---

## このタスクは何か
ユーザー証言「1ヶ月前(v0.1.657時代)はローディングなしで過去ログを数秒で一気に全件取得できていた」体験が退行した。今は86分・公式181件の配信を途中参加で開くと「取得率39%・0.5件/秒」と遅い。これを取り戻す。ただし固着(ハング)を再発させない。**推測で犯人を叩かず、まず計器で実機裏取りしてから本修正**する2段構え。

## 進め方の約束(ユーザー方針)
- まず実機数値で律速を裏取り(段1計器)→ 数値で確認できてから本修正(段2)。
- 実装は別モデル(このチャットのClaudeは設計まで)。
- %表示(取得率39%等)の件は**別レーンの課題**。今回のエンジン設計には含めない(スコープ外)。完全性スコアの%(達成率)は council/completeness-diagnosis-SYNTHESIS.md で「隠蔽防止のため正直に%で出す」と決定済み=触るな。

---

## 確定した真因(実コード+git履歴で裏取り済み)
- v0.1.657: 単一タブなら reached_start まで一気に掘る。実測2695件を約2.5秒。進捗実況(popup)がうるさいとされ KEY_BACKFILL_PROGRESS への橋渡しを【完走(done=1)時だけ】に絞った(content-entry.js:15691)。
- v0.1.759/761: 1区画先読みパイプライン+前面タブ低遅延(FETCH_GAP_MS=6, EMPTY_RESEED_PAUSE_MS=24)。理論12-15区画/秒。
- v0.1.946(退行の疑い・**未実測**): 入口探索中に seekingEvent() を yield する「yield bridging」追加。目的=genSteps=0でstall watchdog誤発火→abort を防ぐ。副作用(推定)=consumer が segmentsSinceYield を**イベント種別を見ずに**+1するため、bridging(空chat)混入で約2倍カウント→scheduler.yield()が約2倍頻繁→0.5件/秒(理論の約1/4)。

## ★Fableが発見した第3の真犯人候補(会議は見落とし)
`isForegroundWatchTab`(content-entry.js:16030-16033)が `document.hasFocus()` を使うため、「タブは前面だが別アプリにフォーカス」で false → gap15ms/pause150ms の**裏タブペーシング**に落ち、yieldと無関係に約6倍遅くなる。**段1計器に fg フィールドを必ず入れ、fg=0 なら段2(yield修正)は中止して前面判定の再設計へ分岐**する。これが「推測で叩かない」の技術的担保。

---

## 段1: 走行中スループット計器(先行リリース)

### 新キー(既存キーに一切触れない)
- storageKeys.js に `KEY_BACKFILL_LIVE_METRIC = 'nls_backfill_live_metric_v1'` 追加。
- **なぜ別キーか**: popup のリスナー(popup-entry.js:8628-8641)は `changes[KEY_BACKFILL_PROGRESS]` の存在だけで発火し done=0 でも実況を描く。相乗りするとv0.1.657で殺した実況が復活(批判の穴1)。別キーなら popup はコード変更ゼロで無反応。
- **担保**: popup-entry.js に KEY_BACKFILL_LIVE_METRIC の import が無いことを grep で確認。JSDocに「⚠️ popupは絶対読まない」明記。

### 書く内容(形)
`{ lid, running:0|1, seg, rows, genSteps, dataSegs(chats>0のyield数・新), bridgingSteps(bridging yield数・新), yields(backfillYieldToPage呼数・新), yieldWaitMsTotal, elapsedMs, fg:0|1(★裏タブ判定), ts }`
律速を1画面で判別する最小集合:
- yield bridging律速 → bridgingSteps/dataSegs≈1 かつ yieldWaitMsTotal/elapsedMs 大
- reseed/seek律速 → bridgingSteps ≫ dataSegs なのに yieldWaitMsTotal 小
- fetch律速 → genSteps増加が周期停止(elapsedMsだけ伸びる)
- fg=0 → 裏タブペース(yieldと無関係に遅い)

### 書き込み場所/頻度
- consumer ループ内 `publishBackfillProgress()`(content-entry.js:16155)直後に `publishBackfillLiveMetric()`(新設ローカル関数)。finally(:16195以降)で running:0 を1回。
- **min-gap 1000ms**(storage書込多発は固着史の主犯・flush O(N²)。status更新は2秒周期なので1Hzで十分)。`setStorageLocalSilent` で fire-and-forget。
- 観測のみ担保: rows を pending に積み終えた後に書く/contentはこのキーを読まない(制御分岐に使わない)/失敗黙殺/段1は ndgrBackfillCrawl.js に**一切触れない**(750/758/760/814の回帰面ゼロ)。

### status表示
- status-entry.js:825 loadBackfillProgressSafe と並置で loadBackfillLiveMetricSafe 新設。
- backfillRinkuNarration.js に `backfillLiveThroughputLine(metric)` 新設(既存 backfillThroughputLine:427 の隣)。表示条件: running===1 && Date.now()-ts<15000(古い走行中を残さない=固着時に嘘の走行中を出さない) && elapsedMs>0 && dataSegs>0。
- 出力例: `⏱ 取得速度(走行中): 経過X.Xs・実区画Y・橋渡しZ・yield W回(計Vms)・fg=1 → 約1区画Ums`
- statusFormat.js:174 buildBackfillProgressLine は**変更せず**別行併記(既存bp表示を1ビットも変えない)。

---

## 段2: 本修正(案B + 時間ベース強制yield) ※段1の数値でGO判定後のみ

### GO判定ゲート(段1実機スクショで)
- fg=1 であること(fg=0なら段2中止→前面判定再設計へ)
- bridgingSteps ≥ dataSegs×0.7 かつ yields≈genSteps/6 かつ yieldWaitMsTotal/elapsedMs ≥ 0.3 → yield bridging律速確定 → 段2 GO。

### isBridgingSegment 判定(consumer側・content-entry.js:16129 の ev 取得直後)
`const isBridgingSegment = ev.bridging === true || !(Array.isArray(ev.chats) && ev.chats.length > 0);`
- 一次判定は typedef の bridging(ndgrBackfillCrawl.js:230)。現行は「実データyieldは必ず chats.length>0」(:710/:968/:1422/:1469で裏取り)なので空chat=橋渡しは恒等。将来エンジンがbridgingフラグ付け忘れても空イベントで膨らむ退行を防ぐ安全側フォールバック。

### 加算条件変更(当て所)
- content-entry.js:16180 を `if (!isBridgingSegment) segmentsSinceYield += 1;` に。**これ以外触らない**。
- ★:16131 `_backfillLastProgressAt = Date.now();` は**全イベントで更新のまま維持**(v0.1.814/946のstall watchdog誤殺対策の本体=yield bridgingの目的側。触ると814再発)。
- generator(ndgrBackfillCrawl.js)は段2でも**無変更**(bridging yield自体は残す=単純revert禁止の遵守)。

### FORCE_YIELD_MS 安全ガード(批判の穴2)
- content-entry.js:15822 NDGR_BACKFILL_YIELD_EVERY_SEGMENTS の直下に `NDGR_BACKFILL_FORCE_YIELD_MS = 2000` 新設。
- ループ開始前(:16049付近)に `let lastYieldAt = Date.now();`。
- 条件(:16181置換): `if (segmentsSinceYield >= YIELD_EVERY_SEGMENTS || Date.now()-lastYieldAt >= FORCE_YIELD_MS) { segmentsSinceYield=0; lastYieldAt=Date.now(); ...既存backfillYieldToPage()... }`
- なぜ必要: 空reseed連続で加算しないとyieldが一度も呼ばれず、(a)CDN即答時のマイクロタスクスピン、(b)updateBackfillThrottleStateがyield時しか餌をもらえず多タブ降格判定が飢える、を2秒周期で下限保証。FORCE_YIELD_MS=2000 は per-request timeout10s/stalledEmpty60s/stalledMidRun150s より十分小さく相互作用なし。

### 推奨: 純関数抽出(codebase慣習)
`src/lib/backfillYieldPacing.js` に `createBackfillYieldPacer({everyNSegments, forceYieldMs, now}) → { onEvent(ev):boolean, onYielded():void }` を抽出。content-entry側は3行の呼び出しに。content-entry.js(1.6万行)は単体テスト不能なので、この repo の流儀(純関数+libテスト)に乗せて回帰を機械的に守る。

---

## 回帰テスト設計(backfillYieldPacing.test.js・fake clock)
1. 実データのみ加算: [data,bridging,data,...] で onEvent が true になるのは data 6個目(=12イベント目)。現行バグの「6イベント目でtrue」にならないことをassert。
2. 空chat連続の強制yield: bridgingのみ+clock進めて now-lastYield>=2000 でtrue。1999msでfalse。
3. リセット: onYielded()後にカウンタ・時刻**両方**リセット(片方だけだと二重発火/永久沈黙)。
4. フォールバック: bridgingフラグ無し chats:[] は加算しない/chats:[{...}]あればフラグ無くても加算。
5. 境界: ev.chats undefined/null で throw せず bridging扱い。

### 既存地雷の機械的防衛(diffスコープ制約をacceptanceに)
- 814(疎区間stalled誤殺): ndgrBackfillCrawl.test.js:540-577 が既に固定。段2はgenerator無変更なので必ずgreen。
- 946(seek中genSteps=0): ndgrBackfillCrawl.test.js:245-266 固定済み。無変更でgreen。
- 750/758/760: stalledEmpty/stalledMidRun(content-entry.js:16613-16631)はdiff外。
- 458(per-request timeout): backfillFetchBinary(:15745-15760)はdiff外。
- **段2の変更ファイルは content-entry.js(consumer5行前後)+ backfillYieldPacing.js(+test)のみ。`git diff --stat` で ndgrBackfillCrawl.js が出ないこと**をacceptanceに。

---

## 段1数値が仮説を否定した場合の分岐
| 観測 | 代替仮説 | 次の一手 |
|---|---|---|
| fg=0 | document.hasFocus()が別窓でfalse→裏ペース | 前面判定再設計(visibilityStateのみ等)を別PR |
| yieldWaitMsTotal小・bridgingSteps≫dataSegs | reseed/seek過多 | seed候補列(ndgrBackfillCrawl.js:771-782)・RESEED_BUCKET_STEP_SEC設計 |
| genSteps増加が周期的に~10s停止 | per-request timeout到達/prefetch不発 | REQUEST_TIMEOUT_MS系・prefetch(:907-966)診断計器追加 |

---

## 実装役が最初に開くべき座標(v0.1.1044時点・Fable裏取り済み)
- content-entry.js:16180(加算行)・16052-16054(ループ)・16129-16131(evフィールドとwatchdog更新)・15822(定数)・15670-15717(publishBackfillProgressとdone=1ゲート)・16030-16033(isForegroundWatchTab)・16195以降(finally)
- ndgrBackfillCrawl.js:220-232(bridging typedef)・883-891(空reseed bridging)・545-554/570/804(seekingEvent)・710/968/1422/1469(実データyieldはchats.length>0ガード内)
- popup-entry.js:8628-8641(**触ってはいけない実況リスナー**)
- storageKeys.js / backfillRinkuNarration.js:427 / status-entry.js:825

## 未確定点(正直な申し送り)
1. 「約2倍カウント」は構造的には正しいが比率は未実測。bridging:data比はコメント密度/reseed頻度依存。0.5件/秒がどのfg/密度だったか不明。段1数値が唯一の真実。
2. scheduler.yield 1回コストが律速か未確定。yieldWaitMsTotalが直接測る(軽いページなら数msで仮説崩れる)。
3. isForegroundWatchTab の実機値(fg)。document.hasFocus()の別アプリフォーカス問題。段1のfgが必須なのはこのため。
4. 決定論エンジン(opt-in・既定OFF)は同consumerを通るので対象内だが実機検証外。

## 素材の所在
- 会議お題: council/backfill-instant-restore-question.txt
- 会議回答: council/backfill-instant-restore-answers.json / ログ council/backfill-instant-restore-log.txt
- 調査A(退行特定)/調査B(%表示洗い出し)の結論は本ファイルと上記メモリに集約済み。
