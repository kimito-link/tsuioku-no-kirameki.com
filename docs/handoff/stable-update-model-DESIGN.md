# 拡張の「保存→通知→描画」を /live/ の安定モデルへ寄せる設計

> **設計=Fable / 裏取り=司令塔(Claude Opus) / 2026-10-08 / 3段構えの手順2の産物**(会議→Fable設計→実装引き継ぎ)。
> 前提: master=v0.1.1586。ファイル:行は実コードで確認済み(PE=src/extension/popup-entry.js、CE=content-entry.js、SE=status-entry.js、VB=venueBar.js)。
> 実機の数字で症状が消えるまで、どの版も「直った」と言わない。実装ハンドオフ=[stable-update-model-IMPLEMENTATION-HANDOFF.md](stable-update-model-IMPLEMENTATION-HANDOFF.md)。
> 会議の素材: council-question.txt / council-answers.json(スクラッチ。結論は鵜呑みにせず、却下理由は ハンドオフ §0 に記録)。

## 司令塔の裏取り結果(この設計に書かれた事実の確認)
| 主張 | 確認 | 結果 |
|---|---|---|
| `NLS_EXPORT_PANEL_METRICS` のハンドラが `persistPanelLiveSummaryIfDue(true)` を呼ぶ(CE:10381) | CE:10370-10382 を読んだ | ✅ 実在。他の force=true は CE:13431・14092。関数本体は CE:11392 |
| popup が refresh と3秒 poll で content へ要求(PE:15229・21290) | grep | ✅ 実在(`requestPanelMetricsFromWatchTab`) |
| ingest_log の source `tail` は有効 source に無く `unknown` に丸められる | commentIngestLog.js:20-30,84-90 | ✅ 実在(`INGEST_LOG_VALID_SOURCES` に tail 無し) |
| status の `setupStorageChangeListener` は SE:608 から呼ばれる | grep | ✅ 実在(SE:4409 に定義) |
| 拡張の文書で Web Locks が使える | 測定用ブラウザの拡張ページで `navigator.locks.request(ifAvailable)` を実行 | ✅ 使える(1つ目は取得・保持中の2つ目は取れず・解放後に残らない) |
| `chrome-extension://` で SW/content は Web Locks を共有しない(tabLeaderLock.js:15 の注意) | 未確認(既存コメントの引用) | 要確認(popup 文書だけ参加する設計なので影響は小さい) |
| 「census の bytes は族ごと30秒に1回のサンプル値」 | 調査済み(extDocBusyCensus.js:36) | ✅ |

## A. 理想の体験フロー(視聴者の目線)

1. **視聴ページを開く**: 記録は今までどおり content が黙って続ける(記録経路は本設計で1文字も変えない)。パネルを閉じている間、視聴ページ内の popup iframe(CE:3901 で `popup.html?inline=1`、CE:8147 で約2秒後に display:none のまま予備起動)は「描かない・鏡も書かない・何も要求しない」。視聴ページのタブ自体が重くならない。
2. **サイドパネルを開く**: 開いた瞬間に前回の鏡(storage の最新)で即描き(stale-while-revalidate)、1〜3秒以内に最新へ追いつく。以後は **可視の間だけ** 3秒周期+コメント到着の合流(既存 450ms)で更新。開いているサイドパネルが「この配信の鏡の書き手」になる(1配信=書き手1文書)。
3. **会場モードを開く**(パネルは隠れる): 会場は鏡(①の実 paint)を読む第一読者。パネルが隠れても会場が開いている間は、**書き手1文書だけ**が鏡を書き続ける(hiddenPublishPolicy の意味は変えない)。鏡の鮮度は常に 60 秒以内(laneMirrorWriteGate の床)で、会場の SOFT 窓 180 秒(venueLaneMirrorSupply.js:35)を割らない=フォールバック経路へ落ちて見た目が変わることがない。
4. **診断ページ(status)を開く**: 2秒周期の自前ループ(SE:276・716-734)だけで描く。誰かの storage 書き込みで「余分に」描き直すことがない。開いただけで他の画面(サイドパネル・会場)が重くならない。
5. **別の popup(ツールバー/タブ)を同じ配信で開く**: 描きはするが鏡は書かない(書き手は1つ)。閉じれば残った文書が数秒以内に書き手を引き継ぐ(ユーザーには見えない)。
6. **障害時**: 鏡の書き手が消えた/鏡が古い/storage が詰まった、のどれでも **前の表示を残す**(空白・「—」・点滅にしない)。会場は SOFT〜HARD 窓の既存挙動(古い鏡を描き続ける)を維持する。

## B. 統合アーキ(部品4つ・誰が書き誰が読むか)

### B-1 役割の固定(/live/ の「書き手1・読み手は引く・隠れたら止める」を拡張の言葉に翻訳)

| 役割 | /live/ | 拡張(本設計後) |
|---|---|---|
| 記録(一次データ) | サーバ | **content のみ**(ctail/csummary/cchunk/IDB)。不可侵 |
| スナップショット(鏡)の書き手 | cron 1か所 | **配信ごとに非受動 popup 文書 1つ**(=「書き手リース」保持者)。content は timeline 鏡の**代役**(書き手不在のときだけ) |
| 読み手 | ブラウザが 60 秒で引く | status=2秒自前ループ(通知で描かない)/受動 popup=通知の newValue をそのまま描く(再 get しない)/会場=通知の newValue 直採用+15秒無音時だけ自己修復 read |
| 隠れたら | 止まる | popup: 隠れたら描かない・要求しない。鏡は「書き手リース保持者かつ会場が開いている」ときだけ書く |
| 失敗したら | 前の表示 | 既存の stale-while-revalidate を維持。鏡が無い/壊れたら書く側に倒す(既存ゲートの fail-open を踏襲) |

### B-2 部品(新規は小さい lib 3つ+機械ゲート1つ。巨大機構は作らない)

| # | 部品 | 置き場所 | 役割 | 使う既存部品 |
|---|---|---|---|---|
| 1 | **要求ポリシー** `panelMetricsRequestPolicy.js` | src/lib(純関数・20〜30行) | popup が content へ `PANEL_METRICS` を**要求してよいか**(初回/配信切替/鮮度切れ 60 秒のときだけ)を決める | `isPanelLiveSummary`、`_panelMetricsAppliedForLv`(PE:9350) |
| 2 | **引き金の表** `storageTriggerPolicy.js` | src/lib(純関数) | 変更キー群→ `'never' \| 'throttle' \| 'immediate'` の 3 値に分類。popup の `scheduleCoalescedStorageRefresh`(PE:18223)と北極星 tick(PE:21441-21448)は**この1本**を通す | `selfWrittenStorageKeys.js`(データ源として import・重複定義しない)、`isHighFrequencyCommentRelatedStorageKey`(PE:18200、lib へ移す) |
| 3 | **書き手リース** `mirrorWriterLease.js` | src/lib(薄い I/O グルー・依存注入) | 配信ごとの鏡の書き手を Web Locks で 1 文書に固定。保持型(ifAvailable で取り、取れたら離さない)。fail-open | `tabLeaderLock.js`(`isWebLocksAvailable`。`runIfTabLeader` は fn 完了で解放する型なので**そのままは使えない**=保持型を同ファイルに1関数足す) |
| 4 | **不可侵ゲート** `recordPathUntouched.test.js` | src/lib(vitest) | 記録経路の関数本体の指紋を固定+本設計の新規 lib が記録系キーを参照しないことを機械照合 | `extCensusWiring.test.js:51-62` の `recordKeyRe` と同じ型 |

読み手側(status・受動 popup・会場)は**新部品を作らず既存コードの分岐を減らす**だけ(C-5〜C-7)。

### B-3 配線図(書く→通知→描く)

```
content(記録) ──set{ctail,csummary,panel_summary,(ingest_log)}──▶ storage ──onChanged──▶ 全拡張文書
      │                                                                   │
      │ PANEL_METRICS 応答(記憶から・force 書込しない)                     ├─ popup[書き手] ──鏡バンドル/配信別鏡/timeline鏡──▶ storage
      ◀────────── 要求(初回・配信切替・60秒鮮度切れのときだけ) ──── popup[可視]    │
                                                                          ├─ popup[非書き手] : 描くだけ(鏡を書かない)
                                                                          ├─ popup[隠れ・会場なし] : 何もしない
                                                                          ├─ status : 通知で描かない(2秒ループのみ)
                                                                          ├─ 受動 popup : newValue をそのまま描く
                                                                          └─ 会場 : newValue 直採用(鏡・tail)。無音 15 秒で 1 read
```

### B-4 「何がどこまで減らせるか」の上限(過大に約束しない)

**出発点の数字**(35 分 census・1 文書あたり届いた量): timeline 鏡 1,670 回/242MB、v1 鏡 1,600 回/24MB、panel_summary 7,200 回/24MB、ingest_log 約 1,200 回(69 回/2 分)・1 回 58KB、ctail 約 1,200 回・1 回 27KB、ai_share_fast_diag 650 回。A/B(290 秒)では v1586 で 32.0MB。

**ざっくり内訳**(★census の「bytes」は族ごと 30 秒に 1 回のサンプル値(extDocBusyCensus.js:36)で、onChanged は旧値+新値を運ぶ(1 回の set で約 2 倍届く)。以下は桁の見積りで、v1586 反映後の実測で置き換える):

| 群 | 何が | 届くバイトの見積り(1 文書・35 分) | 本設計で触れるか |
|---|---|---|---|
| 記録 set の同乗分(CE:11544-11548 の 1 回の set) | ctail 27KB + csummary + panel_summary + **ingest_log 58KB** | 1,200 回 × (27+58+約 8)KB × 2(旧+新) ≈ **220MB** のうち ingest_log が **約 6 割** | ctail/csummary は不可侵。panel_summary の**回数**(力押し分 ≈6,000 回)と ingest_log の**回数**(lib の間引きで 1,200→約 70 回)は触れる |
| 鏡(9 種バンドル+配信別+timeline) | v1586 で既に 8〜15 秒床 | A/B の 37.6→32.0MB の差分≈ **15%** が既に削れた。残りは 2 書き手の交互書きと K 文書分の重複 | 書き手 1 本化で**鏡の書込回数を 1/K**(K=非受動 popup 文書数。サイドパネル+視聴ページ iframe+ツールバー= 2〜3) |
| 診断(ai_share_fast_diag・watch_snapshot・instant_push_diag 等) | 小さいが回数が多い(650+) | バイトは全体の数 % | 「never 引き金」に分類して**描画コスト**をゼロにする(書込自体は本設計の対象外・後続) |

**結論(上限)**: 記録経路に触れない制約の下で、1 文書に届く**バイト**は最大でも **5〜6 割減**(ingest_log の間引きが効けば)、**それ以下にはならない**(ctail+csummary+panel_summary の同乗 set は残る≒約 80MB/35 分/文書)。一方、**通知の回数**(=細かいハンドラ処理の積み上げ)は panel_summary 7,200→約 1,300、鏡 3,270→約 800、ingest_log 1,200→約 70 で **全体の 6〜7 割減**が見込める。CPU は回数に比例する仮説(各文書の longtask は 2% 未満=細かい処理の積み上げ)に基づくが、**CPU が実際に下がるかは実機で測るまで不明**。「鏡を全部消しても総量は大きく減らない」は正しく、**この設計の主戦場はバイトではなく回数と文書数**。

## C. 具体機構(キー・スキーマ・周期・条件)

### C-1 穴1(読み手が書き手を起こす閉ループ)の遮断 【V1】

**事実**: PE:15229 `requestPanelMetricsFromWatchTab(url, lv)` が refresh() のたびに走り、PE:21290 は 3 秒 poll(PE:21259 `POLL_INTERVAL_MS`=埋め込み/サイドパネル 3 秒)でも走る → CE:10370 handler → CE:10381 `persistPanelLiveSummaryIfDue(true)` → `nls_panel_summary_<lv>` 書込(CE:11392-11406。`PANEL_SUMMARY_WRITE_MIN_MS`=2000 は force で無効) → PE:18207 で高頻度キー → coalesced refresh(450ms) → refresh → また要求。さらに同じ通知で SE:4411-4443 の status refresh、PE:21426 の北極星 tick、VB:6504 の会場購読も動く。`persistPanelLiveSummaryIfDue(false)` の呼び手は**存在しない**(force=true の 3 か所 CE:10381/13431/14092 のみ)。

**変更(両端を同じ版で)**:
- content 側: CE:10381 を `persistPanelLiveSummaryIfDue(false)` に(**1 トークン**)。応答自体は従来どおり記憶から返す(CE:10380/10382 は不変)。2 秒の min-gap が初めて効く。
- popup 側: `panelMetricsRequestPolicy.js` を PE:15229 と PE:21290 の直前に挟む。
  ```
  shouldRequestPanelMetrics({ lv, appliedLv, lastAppliedUpdatedAt, nowMs, staleMs = 60_000 })
    → true  : appliedLv !== lv(初回/配信切替) または nowMs - lastAppliedUpdatedAt >= staleMs
    → false : それ以外(storage の panel_summary で足りる)
  ```
  `lastAppliedUpdatedAt` は `applyPanelMetricsFromContent`(PE:9348)で受けた `summary.updatedAt` を保持する(新しい変数 1 つ)。判定に失敗(値が無い)したら **true**(要求する側に倒す=初回 paint を遅らせない)。
- 周期の結果: 無音配信でも 60 秒に 1 回は要求→content が書く=**心拍 ≤60 秒**。watchUrlFreshness.js:11-27 の生存判定(3 分)を割らない。コメントが流れている間は tail flush(CE:11516-11517・CE:14092 の 10 秒 tickMonitor)が panel_summary を書くので要求は起きない。
- `nls_panel_summary_*` は **selfWritten に登録しない**(selfWrittenStorageKeys.js:126-128 の判断を維持。生存確認に使われる)。引き金分類は `'throttle'` のまま。

### C-2 引き金の表(popup の「描くか」を 1 本の分類に) 【V3】

**事実**: popupStorageRefreshCoalesce.js:68-74 は `allHighFreq=false` で **450ms スロットルを素通り**(「設定トグル想定」)。PE:18243-18246 は「自己書込を除いた残りが全部高頻度か」で判定=**未登録のキーが 1 つ混ざるだけで即時 refresh**。未登録で content/status が書く診断キー: `nls_comment_ingest_log_v1`(CE:11548・12696)、`nls_instant_push_diag_v1`(CE:4097・10 秒 flush)、`nls_live_broadcaster_ctx_v1`、`nls_comment_write_mode_diag_v1`、`nls_auto_backup_state`、`nls_report_preview_v1`、`nls_liveview_publish_payload_v1`(SE:2377・12 秒・最大 448KB)、`nls_sidepanel_self_diag_v1`。

**変更**: `storageTriggerPolicy.js`
```
classifyStorageChange(keys) → { action: 'never'|'throttle'|'immediate', reason }
  1. keys から never 群(selfWritten + 診断キー群 DIAG_NEVER_TRIGGER)を除く。残り 0 → 'never'
  2. 残りに SETTINGS_IMMEDIATE(設定トグル。実在キーを列挙: 例 nls_voice_reading_enabled_v1 ほか=実装時に grep で確定) があれば 'immediate'
  3. それ以外は 'throttle'(未知のキーは即時ではなく 450ms 側=安全側)
```
- PE:18223-18251 は `classifyStorageChange` の結果で `return` / `schedule({allHighFreq:true})` / `schedule({allHighFreq:false})` を選ぶだけにする(スケジューラ本体は無変更)。PE:21441-21448 も同じ関数を通す。
- **登録表の穴を機械で塞ぐ**(手で書く表は必ず穴が開く): `storageTriggerPolicy.test.js` が `src/lib/*Key.js` と `storageKeys.js` の `export const KEY_*` を全部読み、**各キーが never/throttle/immediate のどれかに分類できること**を照合する(未分類が 1 つでもあれば赤・キー名を出す)。configurable キーは実出力(ビルダー関数)で照合(selfWrittenCoversMirrorBundle.test.js:45-53 の流儀)。
- 受動 popup(PE:21515-21536): `changes[KEY].newValue` を直接 `apply*ForPassive(newValue)` に渡す(PE:6927 の再 get を省く)。関数の引数に省略可能な snapshot を足すだけ。

### C-3 ingest_log の間引き(lib のみ・set のコードに触れない) 【V4】

**事実**: CE:11528 は `source: 'tail'` を渡すが、commentIngestLog.js:24-26 の有効 source に `tail` が無く :86-89 で `unknown` に丸められ、:180-183 でクールダウン規則が無いので**毎 flush 追記**。CE:11548 は `ingestLogPayload` が null なら set に同梱しない(既存の分岐)。

**変更**(commentIngestLog.js とそのテストだけ): `COMMENT_INGEST_SOURCE.TAIL='tail'` を追加し、規則 `{ minIntervalMs: 30_000 }` の**時間だけ**のクールダウン(added/totalDelta を見ない=取込の「拍」の監査であって行ごとの監査ではない)。直前の同配信・同 source 項目から 30 秒未満なら null を返す。配信が変わった/初回は必ず追記。`persistCommentRowsImpl`(CE:12578)の source も同じ関数を通るので同時に効く。
- 効果の上限: ingest_log の通知 1,200→約 70 回/35 分(1 文書)。バイトで約 5〜6 割減(B-4)。
- 意味の変化: AI 共有の取込ログ(PE:2953・19550 の読み手)の粒度が 30 秒に粗くなる。`anomalyVerdict.test.js:144` が `storage_changed:nls_comment_ingest_log_v1: 25` を素材に使っているので、判定の閾値が変わらないか実装時に確認(未確認)。
- 500 件上限(58KB)の縮小は**やらない**(意味を変える判断は人が決める。回数が減れば十分)。

### C-4 鏡の書き手を 1 本に(書き手リース) 【V5】

**事実**: 非受動 popup は全部書く(PE:7104 の `INLINE_PASSIVE` 判定のみ)。K 文書=視聴ページ iframe(予備起動済み・display:none)+サイドパネル+ツールバー/タブ。ゲートは文書ごとのクロージャ(PE:7097・7121)。隠れていても会場が開いていれば**全文書が** `renderStoryUserLane()` を回す(PE:21346-21352)。timeline 鏡は content(CE:11450・グローバル 1 キー・8 秒)と popup(PE:7287→7114・8 秒床)の 2 書き手で**形が違う**(content は `resolveName=userId`・giftEvents なし)ので互いの署名キャッシュが効かない。

**設計**:
- ロック名 `nls-mirror-writer-<lv>`(Web Locks・同一 origin `chrome-extension://<id>` の全 popup 文書で共有。SW と content は参加しない=tabLeaderLock.js:15 の注意どおり)。
- `tabLeaderLock.js` に保持型を 1 関数追加: `acquireHeldLock(name) → Promise<{ held: boolean, release(): void }>`(`ifAvailable:true` で取り、取れたら解放用 Promise を返すまで保持)。Web Locks 不可/例外は **held=true**(fail-open=従来の全員書き)。
- `mirrorWriterLease.js`(popup-entry から依存注入で使う):
  - 状態: `{ lv, held, release }`。`ensure(lv)`: 未保持なら取得を試す(5 秒ごと・可視 or 会場開のときだけ)。配信が変わったら release→再取得。
  - **資格**: `decideHiddenWork({docHidden, venueOpen}).publish === true` の文書だけが取得・保持を続ける。資格を失ったら(隠れた かつ 会場が閉じた)**即 release**。pagehide でも release(Chrome が自動解放するが、明示で早める)。
  - 書く条件(PE:7103 `mergeAndScheduleFlush` と PE:7124 `publishLaneMirror` の先頭): `INLINE_PASSIVE` に加えて `!lease.isWriter(lv)` なら return。描画(paint)はこの判定を**見ない**(描画と publish を同じ早期 return に載せない)。
  - PE:21346-21352 の「隠れていても会場が開いていれば renderStoryUserLane」は **書き手だけ**が回す(非書き手の隠れ文書は何もしない=重い集計が K→1)。
- timeline 鏡の代役ルール(content): content は **popup 書き手の鏡が 30 秒以内にあれば書かない**。判定は content の既存 onChanged(CE:14416)で `KEY_COMMENT_TIMELINE_MIRROR` の `newValue.bundleLiveId`(popup 書き手の鏡だけが持つ封筒・mirrorBundleFlushScheduler.js:79-84)と `bundleCapturedAt` を控えるだけ(追加 read ゼロ)。控えが無い/30 秒超なら従来どおり書く(fail-open)。CE:11423 の関数先頭に 1 判定を足す(記録関数には触れない)。
- スキーマ変更: なし(封筒 `bundleGen/bundleCapturedAt/bundleLiveId` を書き手判別に流用。新フィールドを増やさない)。
- 鮮度: 書き手は laneMirrorWriteGate の 60 秒床で必ず書く。引き継ぎは最大「5 秒(再試行)+次 tick 3 秒」≈ 8 秒 < SOFT 180 秒。

### C-5 status の pull 化 【V2】

SE:4409-4449 の `setupStorageChangeListener` を**呼ばない**(関数は残し、呼び出し 1 行 SE:608 を外す)。2 秒ループ(backoff 付き・SE:716-734)が全部担う。extras は既存の 12 秒(SE:1556)。これで status は「誰の書き込みでも描き直さない」純 pull になる。

### C-6 会場の poll を自己修復型に 【V6】

VB:6346-6391 `pollSpeech` は 800ms(VB:357)ごとに ctail(最大 2,000 行・commentTailBuffer.js:36)+summary+gift 集計を get し、VB:6417-6418 の onChanged でも同じ行を処理(二重)。VB:6359-6364 に既に「panel_summary は 15 秒無音のときだけ read」の自己修復型がある。**同じ型を tail/summary にも適用**: 直近の onChanged(tail or summary)から 15 秒未満なら poll の get を省く(ギフト集計キーは軽いので従来どおり)。会場を開いた瞬間の再シード(VB:6331)は不変。読み上げの遅延は onChanged が生きている限りゼロ、死んでいれば最大 15 秒(現状の保険と同じ値)。

### C-7 不可侵ゲート 【V1 と同時】

`recordPathUntouched.test.js`:
1. content-entry.js から `async function bufferRowsToTail(` と `persistCommentRowsImpl(` の関数本体(次のトップレベル `function`/`const` まで)を切り出し、指紋(laneMirrorWriteGate.js の `fingerprint` と同型)を `.record-path-baseline.json` に固定。変われば赤(意図して変えるときは人が baseline を更新=既存の `.shared-parts-baseline.json` のラチェット運用と同じ)。
2. 本設計の新規 lib(`panelMetricsRequestPolicy.js`・`storageTriggerPolicy.js`・`mirrorWriterLease.js`)と変更する lib(`commentIngestLog.js`・`tabLeaderLock.js`)が `extCensusWiring.test.js:52` の `recordKeyRe` に一致しないこと。
3. `mirrorWriterLease.js` が `storage.*.set` を含まないこと(書くのは呼び手)。

## D. 偽陽性・取りこぼしを潰す具体ロジック

| 状況 | 起きること | 対処(全部 fail-open) |
|---|---|---|
| 書き手 popup が閉じた | Chrome がロックを自動解放 | 残る文書の 5 秒再試行で取得→次の tick で書く(≤8 秒・SOFT 180 秒内) |
| 書き手が隠れた・会場も閉じた | 資格喪失→即 release | 他に可視文書があれば引き継ぐ。無ければ誰も書かない=**現状と同じ**(hiddenPublishPolicy のとおり読者がいない) |
| 書き手が隠れた・会場は開いている | 資格維持→書き続ける | 現状の v1394 の挙動を 1 文書に絞っただけ |
| 書き手のタブがスロットリングで固まる(隠れタブ) | ロックは保持されたまま | 固まっている間は会場も同じタブ内(会場は content 内)なので読者も止まっている。別窓会場(standalone venue.html)の場合: 鏡が 180 秒古くなれば既存の SOFT→stale 表示に落ちる(現状と同じ)。**追加の心拍は作らない**(ハートビートを足すとそれ自体が通知源になる) |
| Web Locks が無い/例外 | held=true | 全員書き(従来)。census で「書き手数>1」が見えるので検知できる(E 参照) |
| 2 文書が同時に可視(サイドパネル+タブ) | 片方だけ書く | もう片方の DOM 受領証(domSelf)は鏡に載らない。会場の受領証突き合わせは**書き手の面**と比較する(現状もどれか 1 面の値が後勝ちしていたので劣化しない) |
| content が timeline 鏡の代役判定で「popup の鏡が新しい」と誤認 | 控えが 30 秒以内 | 30 秒超えれば content が書く。popup が死んでも最大 30 秒で復帰 |
| `panelMetricsRequestPolicy` の値が無い(初回・例外) | true | 要求する(初回 paint を遅らせない) |
| 未知の storage キーが変わった | `'throttle'` | 450ms 以内に必ず描く(落とさない)。設定トグルで即時が必要なら `SETTINGS_IMMEDIATE` に足す(表のテストが未分類を赤にするので忘れない) |
| ingest_log の 30 秒クールダウンで配信切替直後の項目が消える | 配信が変わったら必ず追記 | 規則に「liveId が直前項目と違えば追記」を含める |
| status の onChanged 撤去で鮮度が落ちる | 2 秒ループは不変 | 最大 2 秒(従来は通知で 0〜2 秒)。backoff 中は従来どおり遅くなる |
| 会場の poll 省略で読み上げが遅れる | onChanged が死んだ場合のみ | 15 秒で自己修復 read(VB:6359 と同じ値) |

## E. MVP と続く版(1 版 1 変更・計器だけの版を連続させない)

**V0(実装前・必須)**: ユーザー実機を**更新ボタン→視聴ページ F5**で v1586 に揃え、3 分後に status「まるごとコピー」で census(族別 n/lastBytes・文書別)と Chrome タスクマネージャの 拡張/GPU/ブラウザ本体 CPU(30 秒おき 3 回)と黒縞の有無を記録=**基準線**。これが無い版は出さない。

| 版 | 変更(1 つ) | 触るファイル | 合格基準(実機 census・3 分) | 撤回基準 |
|---|---|---|---|---|
| **V1(MVP)** | 穴1: CE:10381 force→false + `panelMetricsRequestPolicy.js` を PE:15229/21290 に + 不可侵ゲート | content-entry.js(1 トークン)、popup-entry.js(2 か所・各 2〜3 行)、新 lib 2 本+test | `nls_panel_summary_*` の n が popup 文書で **1/3 以下**(7,200→≤2,400 相当)。popup の `storage_changed:nls_panel_summary_*` 内訳が同率で減る。数字カードが初回 3 秒以内に埋まる | 数字カード「—」が 10 秒以上/popup-tab で「配信が見つからない」が出る(watchUrlFreshness)/会場の記録件数が 60 秒以上古い |
| V2 | status の onChanged→refresh 撤去 | status-entry.js(1 行) | status 文書の `refresh` 回数/分 ≤ 30(2 秒ループのみ)。status の longtask 合計が V1 比で増えない | status の「最終更新」が 10 秒以上古い |
| V3 | 引き金の表(`storageTriggerPolicy.js`)+表の網羅テスト+受動 popup の newValue 直採用 | 新 lib+test、popup-entry.js(PE:18223-18251・21441-21448・21515-21536 の置換) | popup の描き直し内訳で `self_write_skipped`+`never` が増え `storage_changed:*` の**即時**経路が 0。1 コメントあたりの描き直し ≤3(過去の正常値) | コメント反映が 1 秒以上遅れる/設定トグルが効かない(→ SETTINGS_IMMEDIATE に追加) |
| V4 | ingest_log の 30 秒クールダウン | commentIngestLog.js+test | `nls_comment_ingest_log_v1` の n が **1/10 以下**、bytes/分が 5 割減 | AI 共有の取込ログが空/anomalyVerdict が誤判定 |
| V5 | 書き手リース | tabLeaderLock.js(+1 関数)、新 lib `mirrorWriterLease.js`+test、popup-entry.js(PE:7103・7124・21350 に判定)、content-entry.js(CE:11423 先頭に 1 判定・CE:14416 で封筒を控える) | 鏡 3 族(`nls_lane_mirror_v2_*`・バンドル 9 キー・timeline)の n が **1/K**(K=非受動 popup 数)。会場の `observeVenueMirrorChange` の accepted 率不変・鏡の age ≤60 秒。①②③ パリティ(同 gen) | 会場が「①パネル未接続」に落ちる/鏡 age >180 秒/パリティ崩れ |
| V6 | 会場 poll の自己修復型化 | venueBar.js(pollSpeech 内 1 分岐) | 会場文書の get 回数/分が 75→≤5(onChanged 健全時)。読み上げ遅延なし | 読み上げが 2 秒以上遅れる/吹き出しが出ない |

**各版の測り方(共通)**: (a) 実機: 更新ボタン→F5→サイドパネル+status→3 分→まるごとコピー(census: 文書別・族別 n/lastBytes)+タスクマネージャ 3 回+黒縞目視。(b) 測定用ブラウザ A/B: 旧版/新版を同じ配信で 290 秒、`chrome.storage.onChanged` を族別に回数・バイトで数える(今日の手順の再利用)。**CPU・黒縞は全版の副次指標**: 下がれば記録するが、下がらなくても版固有の合格基準を満たせば次へ進む。V6 まで出して CPU が基準線から下がらなければ、「通知回数が主因」という仮説自体を捨て、記録 set の同乗分(不可侵)が主因と判断して**記録経路の設計会議へ戻す**(本設計の外)。

**順序の理由**: V1 は両端 1 トークン+判定 1 本で最大の回数減(7,200 回の族)。V2 は 1 行。V3 は既存の穴の機械封鎖。V4 はバイト最大の lib 修正。V5 が最も複雑なので**基準線と V1〜V4 の数字が揃ってから**。V6 は読み上げという UX に触るので最後。

## F. 捨てた案と理由

| 案 | 理由 |
|---|---|
| onChanged の全廃(全読み手を固定周期 pull) | 会場・受動 popup は newValue 直採用で**追加 read ゼロ**の最速経路。pull に替えると get が増え(get 回数が支配的)、並列 get 禁止にも触れる。描画の引き金から外す(V3)だけで十分 |
| 隠れた background worker / Offscreen をバックアップ書き手に | SW は idle 停止・content と origin が違う・Offscreen は記録 2% の実績。鏡の書き手に使う根拠が無い |
| ingest_log を `storage.session` へ | session も全文配信(地雷 D) |
| ingest_log を ctail と別の set に分ける | CE:11521-11551 の記録関数を触る。lib の間引き(V4)で set のコードに触れず同じ効果 |
| 鏡の書き手を content にする | content は lane の集計(①の実 paint)を持たない。パリティ「①が描いたものを鏡で配る」が崩れる |
| 書き手選出を「鏡に writerId を刻んで他人の新しい鏡を見たら黙る」(ゴシップ型) | 2 文書が同時可視のとき交互書きが残る・20〜30 秒の曖昧窓。Web Locks は Chrome が生死を管理し stale leader が原理的に無い |
| 鏡の鍵に書き手の時刻や ID を足して判定 | 鍵に時刻・stats・pulse を入れない決まり。封筒(bundleLiveId)の流用で足りる |
| 視聴ページ iframe の予備起動(CE:8147)をやめる | パネルを開いた瞬間の体感を落とす。書き手リースで「起動しているが何もしない」にできるので不要 |
| popup の 450ms スロットルを /live/ 並みの数十秒に | 拡張はコメビュ。鮮度 1 秒未満が価値。回数は K と隠れ文書で削る |
| 新しい心拍キー(leader heartbeat)を storage に書く | 心拍そのものが通知源になる(計器を足して満足した 25 版の型) |
| panel_summary を selfWritten に登録 | 生存確認(watchUrlFreshness)に使われている(selfWrittenStorageKeys.js:126-128 の判断を維持) |

## G. 地雷と回避策

1. **新旧混在の実機**: 更新ボタン未押下では census が旧版と混ざる。V0 で揃えるまで数字を信じない。配信視聴中の `copy:ext` は禁止(§12.5)。
2. **測定タブが症状を作る**: 測る前に測定用ブラウザの余分なタブを閉じる(memory: my-measurement-tabs-caused-the-freeze)。
3. **popup-entry.js の max-lines ラチェット**(eslint.config.js:398 付近): 判定は全部 lib へ。popup-entry は呼び出し 1〜3 行だけ。content-entry も 19440 の上限(eslint.config.js:412)。
4. **`every()` の穴**: 引き金の表に未登録キーが 1 つ混ざると判定が丸ごと倒れる(2026-08-04/08-12 で 2 回再発)。V3 の網羅テストは**実出力のキー文字列**で照合(`$` 終端の正規表現で per-live 版を取り逃した v1344 の教訓)。
5. **描画と publish を同じ早期 return に載せない**(会場 656 秒 stale の実損): リースの判定は `mergeAndScheduleFlush`/`publishLaneMirror` の先頭に置き、paint 側には置かない。
6. **min-gap で捨てない**: V4 のクールダウンは監査ログ(診断)に限る。鏡は既存の trailing flush のまま。
7. **CRLF と dist のエスケープ**: content/popup の置換は CRLF で空振りしやすい。dist 内の日本語は `\uXXXX`(検証で grep するとき)。
8. **Web Locks の前提**: 拡張ページで `navigator.locks` が使えることは司令塔が測定用ブラウザで確認済み(上の表)。使えなくても fail-open で従来動作(退化しない)。
9. **会場の「出たり消えたり」は鏡と別件の可能性**(memory: 視聴ページ幅 1100px 境界の仮説・未測定)。V5 の合格基準に混ぜない。黒縞も GPU 張り付きの原因か結果か未確認(過去に液晶保護アプリが正体だった実例)。
10. **1 回 145KB の理由(未確認)**: `TIMELINE_MIRROR_CAP=60`(commentTimelineMirror.js:22)で 145KB は大きすぎる。確認手順: devtools で `JSON.stringify(bag[KEY_COMMENT_TIMELINE_MIRROR]).length` と `rows.length`・1 行の平均長を見る。旧値+新値で 2 倍、giftEvents 同乗、顔 URL の 3 仮説。V5 の前に測る(結果次第で cap や avatar の持ち方を**別の版**で扱う)。
11. **refresh() 本体の diff-skip の効き(未確認)**: V3 の効果は「呼ばれる回数」で測る(`repaintReasonCensus` の内訳)。描画回数が減らなければ diff-skip ではなく呼び出し側が原因と確定できる。
12. **session の heavy 全件キャッシュ(PE:15310-15390)のヒープ寄与(未確認)**: census の `hp`(ヒープ最大)を文書別に V0 で記録し、本設計の版で変化しないことを確認(変わらないはず=変われば別件)。
13. **計器だけの版を連続させない**: 本設計に計器の版は無い(census は既存)。V3 の網羅テストは計器ではなくゲート。
14. ~~ユーザーに手作業を頼まない~~ → **司令塔の訂正**: `reload_extension`/chrome-devtools は**測定用ブラウザ**にしか効かない。ユーザー実機の Chrome は読み取り専用の権限で、**更新ボタン・F5 はユーザーの1クリックが要る**(V0 の基準線取得も同様)。手順は「更新→F5→3分→まるごとコピー」を1セットで短く依頼する。
