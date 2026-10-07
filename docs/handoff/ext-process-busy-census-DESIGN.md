# 設計書: 拡張プロセスCPU占有(黒い幕・popup真っ黒・status重い)を「ページを開かなくても」直す

設計=Fable(claude-fable-5-1) / 実コード裏取り=司令塔(Claude) / 日付 2026-10-08 / 3段構えの手順2の産物。
素材・会議の結論・観測表は `ext-process-busy-census-IMPLEMENTATION-HANDOFF.md` §3 と会議(5体)の統合。会議の結論は参考で、本書は司令塔が実コードで裏取りしたもの。

## 司令塔の裏取り(2026-10-08・実コードで確認済み)
- 会場(venueBar.js)は【拡張プロセスではなく】watch タブの content script 内で動く(`content-entry.js:9` で import・`:14190 mountVenueBarButton()`)。131%の内訳ではない。standalone の venue.html だけが拡張プロセス。
- 速報の「拡張の処理時間 153ms/5,283ms(3%)」は【最後に書いた1つの popup の起動からの経過】(`popup-entry.js:595 _autoSectionStartedAt`・`:18706` で `KEY_AI_SHARE_POPUP_DIAG` を後勝ちで set)。長時間動いている popup の数字ではない=既存計器は実機の犯人を測れていない。
- popup 文書は同時に複数種類(`popup-entry.js:986-1003`): INLINE_EMBED_WATCH(watch タブ埋め込み iframe)/ INLINE_SIDE_PANEL / INLINE_PASSIVE(status 埋め込み・読むだけ)/ 単独タブ。非 passive は全て refresh・heavy read・レーン描画・鏡 publish を各自行う(leader 判定なし)。
- 会議の「Chrome は onChanged で差分だけ配る」は誤り(onChanged は oldValue+newValue 全文)。

## 前提訂正(Fable が実コードで確認・司令塔が上3点を再確認)
1. 会場の群衆canvas/pollSpeech は拡張プロセスの131%の内訳ではない(browser 61% への storage IPC の一因としては残る)。
2. 「全文配信×ページ数」は測定でも CPU を直接は説明しない。測定の遅れ(0.9→5.7ms・最大449ms)は「コメントチャンク書き込み→popup の refresh(heavy read+描画)」。主犯は「配られること」でなく「配られて各 popup が動くこと」と、それ以外(ヒープ1,470MBのGC・DevTools接続・多重インスタンス)の可能性。onChanged は old+new を両方運ぶのでバイト数は素材の2倍。
3. 既存計器にインスタンス識別が無い(last-writer-wins)=実機の犯人を測れていない。
4. `laneMirrorPerLivePublish.js:55` は hash 比較なしで毎回 set。`popup-entry.js:7117-7118` で `snap.contentHash` を既に計算している=比較は新規計算ゼロで入る。描画 sig 一致より前に publish する順序(`:6491→:6499`)は「鏡が656秒凍結した」実損への意図的な修正なので壊さない。
5. SW の onChanged は2つとも1キー判定で軽い。sidepanel-entry.js は onChanged を持たない。status は接頭辞2種。
6. `memoryPressureProbe.js` の配線は content-entry.js:339 のみ=拡張プロセスのヒープは誰も測っていない。

## A. 理想の体験フロー
1. ユーザーは配信を見ているだけ。サイドパネルは黒くならず、status.html を開いても数秒で描ける。
2. 重くなり始めたら、サイドパネル自身(既存 `renderSelfDiagOverlay` の1行枠)に「拡張が重い: 犯人=〈面〉〈処理〉〈%〉」が出る。タスクマネージャーも診断ページも開かない。
3. 司令塔は `npm run status:live` で同じ1行と内訳表(面ごと・処理ごと・ヒープ・起動回数)を読む。ユーザーにコピペを頼まない。
4. 司令塔は表の上位1件を潰す版を出す。次の配信で同じ表の数字が下がったことが「直った」の証拠(体感報告に頼らない)。
5. コメント記録は全工程で一切触らない(記録経路 `content-entry.js persistCoalescer→flushBatchViaTail` は読みも書きも変えない)。

## B. 統合アーキ(4コンポーネント)
```
[各拡張文書] sidepanel / popup×N / status / comeview / live-view / venue(standalone) / offscreen
   └ ①DocBusyCensus(boot) … 文書ごとの「忙しさ台帳」をメモリに持つ(書かない)
          │ 60秒に1回・≤400B・runtime.sendMessage
          ▼
[Service Worker] ②ProcessCensusAggregator … 面×インスタンス別に合流し、60秒に1回だけ
          │ nls_ext_process_census_v1 を set(変化が無ければ書かない)
          ▼
[status.html] ③既存 EXTRAS_BATCH に +1キー(読み取り回数は増えない)→ 速報1行+内訳表 → status:live
[sidepanel]   ③' 既存 selfDiag overlay の line に「重い」判定を1行追加(異常時のみ表示)

[popup] ④MirrorWriteGate … 配信別鏡(v2)+受領証の set を「contentHash 不変かつ60秒未満ならスキップ」
        (①が犯人を名指しした後の第2版。①の表で効果を読む)
```
原則: ①は測るだけ・書かない。書くのは②の1キーだけ。③は新規 read を足さない(同じ get に同梱)。④は読者(会場・status・live-view)を無変更に保つ。

## C. 具体機構
### ① DocBusyCensus
- 純関数 `src/lib/extDocBusyCensus.js`(新規)。既存 `autoSectionCensus.js` の `noteAutoSection/formatAutoSectionLines` と `storageRefreshTriggerKey.js#normalizeStorageKeyForCensus` を再利用。popup-entry.js の `_measuredSection`(`:608`)はこの lib の薄い呼び出しに置換(行数は増えず減る)。
- 副作用 boot `src/lib/extDocBusyCensusBoot.js`(新規)。全拡張エントリ(sidepanel/popup/status/comeview/live-view/venue/offscreen)から1行 import。
- 1文書が持つ値(メモリ内・≤400Bに要約): `instanceId`(起動時乱数)・`surface`(popup は `_inlineFlags` から sidepanel/inline-watch/status-passive/standalone、他は文書名)・`bootAt`・`docAgeMs` / `sections`: 名前→{ms累計,回数,最悪ms}(囲む対象は既存の囲み+onChanged リスナー本体+refresh 本体+3秒 poll tick の4系統。推測で増やさない。カバー率が低ければ「測れていない」と出す=`autoSectionCensus` 既存判定を流用) / `onChanged`: キー族別の受信回数。バイトは族ごと30秒に1回だけ `JSON.stringify(newValue).length`(毎イベント測ると計器が負荷になる) / `heartbeat`: 既存 `mainThreadBlockerBoot` の250msハートビート遅れ合計(可視中のみ。hidden のタイマー間引きは忙しさではない) / `heap`: `performance.memory.usedJSHeapSize/jsHeapSizeLimit`(30秒ごと採取・最大値保持。同一プロセスの全文書で同じ値=プロセス値。SW・offscreen は na)。
- 送信: 60秒ごと+pagehide時に `runtime.sendMessage({type:'NLS_DOC_CENSUS',…})`。失敗は握る。bootCount: ②が surface ごとに「新しい instanceId を見た回数」を数える=prewarm/再生成ループの検出。
### ② ProcessCensusAggregator(SW)
- `extension/background.js` に受信ハンドラ1つ。メモリ上 `Map<instanceId, 要約>`、最終受信から3分無音は stale として落とす。
- 書き込み: `nls_ext_process_census_v1`、60秒に最大1回・内容が前回と同じなら書かない・上限 10インスタンス×400B ≈ 4KB(onChanged 負荷は 4KB×2/60秒で無視できる。比較: fastDiag 40KB/1.5秒)。SW が死んでも台帳は storage にあるので bootCount は storage 値から継続。
- 登録: `selfWrittenStorageKeys.js` に `/^nls_ext_process_census_v\d+$/` を追加(未登録だと popup 全インスタンスが60秒ごとに無スロットル refresh する)。`statusExtrasBatch.js EXTRAS_BATCH_KEYS` に追加(同じ get に同梱・read回数不変)。
### ③ 表示
- status 速報: 「拡張プロセス: ヒープ xx%(最大) / 面別 busy 上位3(surface・instanceId末尾4桁・docAge・カバー率・top section)/ bootCount(面別/10分)/ onChanged 上位3族(回数・推定KB)」。
- サイドパネル overlay(`sidepanel-entry.js:720` の line に連結): 「busy≥50%が5分継続」または「heap≥70%」のときだけ1行。正常時は何も出さない(既存の掟)。
- 「ページを開かなくても」の到達範囲: 人間=サイドパネル overlay。AI=status:live(現状 status.html を開いている間のみ cloud publish)。SW から直接 POST する経路は第3版以降の候補(ingestKey の供給が build define 依存=未検証)。
### ④ MirrorWriteGate(第2版)
- `laneMirrorPerLivePublish.js` に「前回書いた hash と lid」を注入可能な状態として追加。`snap.contentHash` が前回と同じかつ前回 set から60秒未満なら set しない(`written:false, reason:'同内容'`)。60秒超なら同内容でも書く(会場の鏡有効窓180秒(`venueBar.js:5765` 注釈)を絶対に下回らない鮮度床=凍結の再発を構造で防ぐ)。鏡と受領証は従来どおり同じ set。
- 削減見込み(実機値から): per-live 書き込みは renderStoryUserLane 呼び出しごと≈ sig-same 2,391+実描画1,237=約3,600回/観測窓 → 内容変化時+60秒床のみ。1回 ≈ 62KB×2キー×(old+new)=約250KB/受信文書 → 受信文書4〜6本で約1GB級/窓の逆シリアライズと browser プロセスの IPC が消える。

## D. 偽陽性・副作用を潰す具体ロジック
- hidden の遅れを busy に数えない(既存 `mainThreadBlockerBoot.js:88-89` と同じ判定)。hidden 中は section 実測だけを信じる。
- カバー率で断言を止める: 既存 `AUTO_SECTION_COVERAGE_WARN_PCT=30` を流用。30%未満の面は「測れていない」と出し、犯人に挙げない。
- インスタンス識別: last-writer-wins を廃し、面×instanceId で持つ。
- bootCount の起動直後除外: 既存 `AUTO_SECTION_BOOT_SETTLE_MS=3000` を流用。起動3秒未満の面は busy 判定から外す。
- heap はプロセス値: 面ごとに差が出たら(=別プロセス)それ自体を表に出す。
- 計器自身の負荷の上限を計器が証明する: onChanged 族に `nls_ext_process_census_v1` 自身が載る。≤1回/60秒でなければ赤(自己検査)。stringify は族×30秒上限、合計時間も section として積む。
- stale 落とし: 3分無音のインスタンスは表から消す。
- ④の鮮度床60秒: per-live の capturedAt は60秒床で必ず更新される。受領証の domSelf 変化は contentHash に含まれないので、60秒床で吸収(受領証の用途はタイル寸法突合=分単位で十分)。
- 記録不干渉: ①②④のどれも `nls_ctail_/nls_comments_/nls_cchunk_/nls_csummary_` を読まない・書かない・触る関数を import しない(wiring テストで import 行を固定)。

## E. MVP(最初の1版 = v0.1.1580)
**①+②+③(status 行のみ。overlay は含めない)+ selfWritten/EXTRAS 登録。④は含めない。**
理由: 131%は実機でしか出ておらず、犯人が「多重popup / ヒープGC / 再生成ループ / status / DevTools」のどれかを現状の計器は区別できない(インスタンス識別が無い)。④を先に出すと、効果の有無を測る物差しが無いまま1版使う。
- TDD: `extDocBusyCensus.test.js`(集計・stale・bootCount・要約≤400B・stringify 上限)、`processCensusAggregator.test.js`(60秒1回・同内容は書かない・10インスタンス上限)、selfWritten 登録の機械照合テスト、wiring テストで7エントリ全部が boot を import していることを固定。
- 変異テスト(最低2): (a)「同内容なら書かない」判定を反転 (b) instanceId を surface で潰す(last-writer-wins に戻す) (c) hidden の遅れを busy に加算。
- 実機証拠の取り方(ユーザーに操作を頼まない): `/nicolive-ship`→reload_extension→次の配信中に `npm run status:live --watch 60` を10分。**合格=次のいずれか1つを名指しできる**: 面別 busy 上位1件がカバー率≥50%で出る / heap≥70% / bootCount≥3回/10分 / 計器自身の書き込み≤10回/10分。**不合格=全面がカバー率<30%**(犯人は main thread 外=GC/SW/compositor と確定し、次版は DevTools 切断状態でのタスクマネージャー再サンプル+SW 区間計測へ。計器版を続けて2つ出さない)。
- **スパイラル禁止契約**: v1580 の次(v1581)は必ず「削減」の版。表が決め手を出さなければ v1581=④(決定論的にバイトが減り、表で減少量を読める)。計器だけの版は連続不可(MEMORY 25版の再発防止)。

## F. 捨てた案と理由
- chrome.storage.session へ鏡を移す: session も onChanged を全文書へ全文配信=構造が同じ。読者(会場=content script・status・live-view)全部の読み替えが要り爆風半径が大きい。
- BroadcastChannel で鏡を配る: content script の BroadcastChannel はページオリジン。会場(鏡の第一読者)に届かない。
- runtime.sendMessage で見ている面だけに配る: SW 経由で idle 問題、受信側の逆シリアライズは減らない、配達の順序保証が storage より弱い。
- LoAF: 非表示文書・SW・content で拾えない可能性が高いと観測済み(測定用 Chrome で拡張ページの150ms同期処理が記録されず、記録された約985msのエントリは scripts が空)。区間実測に劣る。
- 書き込み側に全 set を包むメーター: popup-entry の行数上限と set の散在で網羅できない。受信側サンプリングは1文書1箇所で済む。
- onChanged を「可視面だけ」に全体ゲート: hidden でも会場が開いていれば鏡を書く既存裁定(`hiddenPublishPolicy.js`・`popup-entry.js:21317`)と衝突。
- fastDiag(40KB/1.5秒)の間引き: 過去却下(鮮度低下)。④の後に残る最大の定期バイトなので、表が fastDiag 族を上位に出したときだけ「lite だけ毎回・full は10秒」の分割を検討(今は入れない)。
- IndexedDB 化・Offscreen 書き込み・read キャッシュ・並列 get: 全部過去却下。

## G. 地雷と回避策
- `selfWrittenStorageKeys` は every() 判定: 新キーを1つ登録し忘れると全部のスロットルが外れる(v1344 の実損)。→ 機械照合テストを MVP に含める。
- 実機の未登録キーのうち **`nls_instant_push_diag_v1` は popup 自身が10秒ごとに書く**(diagFlushThrottle)=自己フィードバックで popup 全インスタンスが無スロットル refresh。純診断なので登録して良い。`nls_venue_effect_sound_presence` / `nls_live_broadcaster_ctx_v1` は popup が挙動に使う可能性があり未裏取り → 登録しない。
- 測定用に開いた popup.html 単独タブは4本目の能動 popup になり症状を作る(MEMORY: 測定タブ自身が症状を作る)。実機証拠は単独タブを閉じて取る。
- DevTools 接続は被接続レンダラーの CPU・メモリを増やす。131%サンプル時の接続有無は不明。
- SW への sendMessage は SW を起こす(60秒ごと)。許容。SW が落ちていても台帳は storage に残す。
- popup-entry.js は行数上限: `_measuredSection` を lib 呼び出しに置換して減らす方向でしか触らない。
- dist の日本語は `\uXXXX`、CRLF で置換空振り、changelog summary 35字、tree-map は `git add` の後。
- `symptomVerdicts.js` に症状IDを足すなら ai-hub の triggers にも足す(`check-symptom-index`)。MVP では既存 `status-slow`/`panel-black` の cause 文言だけ更新し、新IDは作らない。

## H. 解釈が誤っていた場合の備え(MVP の表がそのまま分岐表)
| 表が示すもの | 意味 | 次版 |
|---|---|---|
| inline-watch と sidepanel の popup が両方 busy 上位 | 多重 popup が主犯 | 鏡 publish と heavy refresh の leader 1本化(可視かつ最前面の popup だけ publish。passive 化の既存裁定を再利用) |
| heap ≥70% | GC が主犯・区間計測に出ない | chrome-devtools MCP でヒープスナップショット。疑い所: `chrome.storage.session` の heavy 全件鏡(`popup-entry.js:15277-15354`)・累計診断リング |
| bootCount が高い | prewarm/iframe 再生成ループ | 再生成条件を実コードで特定(`schedulePrewarmInlinePopupIframe` の done flag) |
| status インスタンスが上位 | 2秒ループの24キー読み+描画 | EXTRAS の鏡を lite 化(既存 SYNTHESIS の型) |
| 全面カバー率<30%・heap 低 | main thread 外(SW/compositor/GC)か DevTools 由来 | DevTools 切断で再サンプル→SW 区間計測 |
| onChanged 族で `nls_ctail_` が回数・KB とも最大 | 全文配信説が部分的に正しい | ④+tail 書き込みは読者側(popup)の refresh 合流を 450→1,500ms(記録側は不変) |
どの行に落ちても記録経路は不変。

## I. 未確認事項(実機でしか分からないこと)
1. 131%サンプル時に開いていた面の組(inline watch iframe の有無・status・単独 popup タブ)と DevTools 接続の有無。
2. 1,470MB の内訳(performance.memory はプロセス合算で文書別は不可=ヒープスナップショットが要る)。
3. 速報の「5,283ms」が最後に書いた popup の文書齢である、という点はコードで確認済み。実機で instanceId 付きで確認するのが MVP の目的。
4. `AI_SHARE_FAST_DIAG_VISIBLE_MIN_MS` の実値(素材の1.5秒は未裏取り)。
5. `nls_venue_effect_sound_presence` / `nls_live_broadcaster_ctx_v1` の変化を popup が refresh トリガーとして必要としているか。
6. 測定ハーネスの7ページ(sidepanel3)は能動 popup 3本相当で 131% が出なかった=「多重 popup だけでは足りず、実データ量(heavy read 1,200行・タイル156)か GC が要る」可能性。
7. SW から /api/status へ POST するための ingestKey が SW バンドルで供給可能か。
