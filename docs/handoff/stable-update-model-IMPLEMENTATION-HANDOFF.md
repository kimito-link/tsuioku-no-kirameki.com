# 実装ハンドオフ: 拡張の「保存→通知→描画」を /live/ の安定モデルへ(V0〜V6)

> **この1枚だけで着手できる**ように書く。設計の正本=[stable-update-model-DESIGN.md](stable-update-model-DESIGN.md)(理由・捨てた案・地雷はそちら)。
> 設計=Fable / 会議=無料ハーネス5体 / 裏取り=司令塔 / 2026-10-08。**実装はまだ1行もしていない。**

## §0 最初に読む(5分)
1. [DESIGN §B-4 と §G](stable-update-model-DESIGN.md): 「主戦場はバイトではなく**回数と文書数**」「記録経路は不可侵」「ユーザー実機の更新はユーザーの1クリックが要る」。
2. 会議の結論の**却下**(再提案しない): ingest_log を `chrome.storage.session` へ(session も全文配信)/隠れた background worker や Offscreen を鏡の書き手に(SW は idle 停止・記録 2% の前例)/ingest_log を ctail と別の set に分ける(記録関数 CE:11521-11551 を触る)/onChanged の完全廃止(会場・受動 popup は newValue 直採用が最速)。
3. 繰り返してはいけない失敗は計画ファイル `C:\Users\info\.claude\plans\glowing-gliding-rossum.md` の D 節(read path をキャッシュで包まない/並列 `storage.get` 禁止/min-gap で捨てない/鏡の鍵に stats・pulse・時刻を入れない/新しい診断キーは `selfWrittenStorageKeys` 登録/popup-entry.js は行数上限)。

## §1 着手前に済ませること(V0・必須。これが無い版は出さない)
- **ユーザー実機を v1586 に揃える**(司令塔の権限ではできない。ユーザーに1セットだけ頼む): ① `chrome://extensions` で拡張の**更新**ボタン ② ニコ生の視聴ページで **F5** ③ サイドパネル+status を開いて **3 分待つ** ④ status の「まるごとコピー」を貼る。
- **基準線を記録**: census(「拡張プロセスの忙しさ」: 文書別・族別 n/バイト・ヒープ)+ PowerShell のプロセス別 CPU(拡張/GPU/ブラウザ本体を 30 秒おき 3 回。今日のスクリプトの型: `Get-CimInstance Win32_Process` で `--extension-process` と `--type=gpu-process`、親なしを区別)+黒縞の有無。保存先: `docs/handoff/baseline-v1586-<日付>.md`(数字だけ)。
- 作業は必ず `master` から新ブランチ(`perf/…` か `feat/…`)。`git status` が空であることを確認してから。**配信視聴中の `copy:ext` は禁止**(AGENTS §12.5)。

## §2 各版の共通手順(1 版 1 変更・TDD)
1. `git checkout -b <branch>`(master 最新から)。
2. 先にテストを書いて赤を確認 → 実装 → 緑。
3. 変異テストを **2 件以上**(ゲートを素通し/配線を外す/既定を壊す)で赤→復元で緑を確認。
4. `npx tsc --noEmit`・`npm run lint`・`npm run verify:cc`。`npm run improvement:record`(**verify の前**)→ note が要る(バンドル KB・別の手段でも確かめた回数が過去最良より悪いため)。
5. 版の更新 4 点: package.json / extension/manifest.json / tsuioku-no-kirameki/index.html / `src/lib/changelog.js`(summary 35 字以内・ユーザー向けの言葉)。`node scripts/split-changelog.mjs` の後 `src/lib/changelog-archive.js` は**最小差分**(HEAD を土台に移った 1 版だけ挿入。CRLF/LF の混在に注意)。
6. 生成物: `npm run tree-map` / `feature-map` / `layer-map` / `site-health`(新規ファイルを作った版は `git add` した**後**にもう一度)。
7. `npm run build` → `git add -u extension/dist app/dist .dist-fingerprint.json src docs …` → 新規ファイルを**明示列挙**で add。
8. コミット本文: 症状/真因(行つき)/実測 before→after/外した仮説/変異テストの確認/未確認。
9. push → PR(`gh pr create`)→ CI 全緑を確認 → **マージはユーザー**(`gh pr merge` は許可された場合のみ)。
10. 反映: マージ後 `git checkout master && git fetch && git pull` → `npm run build` → `npm run copy:ext` → `npm run verify:deploy`。**その後ユーザーに「更新→F5→3分→まるごとコピー」を1セットで頼む**。
11. 効果の確認は§4の合格基準。「直った」は実機の数字で症状が消えてから(ROOT-CAUSE-CLAIM-RULE)。

## §3 版ごとの仕様

### V1(MVP): 穴1「読み手が書き手を起こす閉ループ」の遮断
- **確認済み事実**: popup が `requestPanelMetricsFromWatchTab`(PE:15229=refresh 毎、PE:21290=3 秒 poll)で `NLS_EXPORT_PANEL_METRICS` を送る → content の `PANEL_METRICS_MESSAGE_TYPE` ハンドラ(CE:10370-10382)が `persistPanelLiveSummaryIfDue(true)`(CE:10381)で `nls_panel_summary_<lv>` を強制書込 → popup の高頻度キー(PE:18207)→ coalesced refresh → また要求。force=true の呼び手は CE:10381/13431/14092 の 3 か所のみ。2 秒ゲート(`PANEL_SUMMARY_WRITE_MIN_MS`=2000, CE:11224)は force で無効。
- **変更**(両端を同じ版で):
  1. CE:10381 `persistPanelLiveSummaryIfDue(true)` → `persistPanelLiveSummaryIfDue(false)`(1 トークン)。応答 `buildPanelMetricsResponse(payload)` は不変。
  2. 新規 `src/lib/panelMetricsRequestPolicy.js`(純関数): `shouldRequestPanelMetrics({ lv, appliedLv, lastAppliedUpdatedAt, nowMs, staleMs = 60_000 })` → `appliedLv !== lv`(初回/配信切替)または `nowMs - lastAppliedUpdatedAt >= staleMs` のとき true。値が無い/例外は **true**(初回 paint を遅らせない)。
  3. PE:15229 と PE:21290 の直前でこの関数を通す。`lastAppliedUpdatedAt` は `applyPanelMetricsFromContent`(PE:9348)で受けた `summary.updatedAt` を保持(新しい変数 1 つ)。`_panelMetricsAppliedForLv`(PE:9350)が既存の「適用済み配信」。
  4. 新規 `src/lib/recordPathUntouched.test.js`(不可侵ゲート。DESIGN §C-7): `bufferRowsToTail(` と `persistCommentRowsImpl(` の関数本体の指紋を `.record-path-baseline.json` に固定/新規・変更 lib が記録系キー(`nls_ctail_`・`nls_comments_`・`nls_cchunk_`・`nls_csummary_`・`nls_cdb_summary_`)を参照しない(`extCensusWiring.test.js:51-62` の `recordKeyRe` と同型)。
- `nls_panel_summary_*` は **selfWritten に登録しない**(`selfWrittenStorageKeys.js:126-128`: 生存確認 `watchUrlFreshness.js:11-27` に使うため)。
- テスト: ポリシーの境界(同一 lv・60 秒未満=false/60 秒ちょうど=true/lv 違い=true/値なし=true)、配線(PE の 2 箇所がポリシーを通る/CE:10381 が false)、不可侵ゲート。変異: ポリシー常に true/CE を true に戻す/PE の片方を外す。
- 行数: `popup-entry.js` は上限に張付き(`eslint.config.js` の max-lines)=判定は lib・呼び出し 2〜3 行。上限を上げるなら理由を eslint.config.js に書く。

### V2: status の onChanged→refresh を撤去
- SE:608 の `setupStorageChangeListener();` の呼び出し 1 行を外す(関数 SE:4409 は残す)。2 秒ループ(SE:716-734・backoff 付き)と extras 12 秒(SE:1556)が全部担う。
- テスト: status-entry.js のソースに `setupStorageChangeListener();` の呼び出しが無いこと/2 秒ループの `runRefreshTick` が残ること。変異: 呼び出しを戻す。

### V3: 引き金の表(`storageTriggerPolicy.js`)+受動 popup の newValue 直採用
- `classifyStorageChange(keys) → { action: 'never'|'throttle'|'immediate', reason }`: ① selfWritten + `DIAG_NEVER_TRIGGER`(`nls_comment_ingest_log_v1`・`nls_instant_push_diag_v1`・`nls_live_broadcaster_ctx_v1`・`nls_comment_write_mode_diag_v1`・`nls_auto_backup_state`・`nls_report_preview_v1`・`nls_liveview_publish_payload_v1`・`nls_sidepanel_self_diag_v1`・`nls_venue_effect_sound_presence_v1`・`nls_venue_seats_diag_v1`・`nls_venue_live_open_v1`・`nls_gift_effect_diag_v1`・`nls_voice_diag_v1`・`nls_channel_switch_diag_v1`・`nls_recording_watchdog_v1`・`nls_backfill_live_metric_v1`・`nls_backfill_hb_*`)を除いて残り 0 → `never` ② 残りに `SETTINGS_IMMEDIATE`(設定トグル。実装時に grep で実在キーを確定)があれば `immediate` ③ それ以外は `throttle`(未知キーは即時でなく 450ms 側)。**`nls_panel_summary_*` は never にしない**(throttle)。
- PE:18223-18251 は結果で `return`/`schedule({allHighFreq:true})`/`schedule({allHighFreq:false})` を選ぶだけ(スケジューラ本体 `popupStorageRefreshCoalesce.js` は無変更)。PE:21441-21448(北極星 tick)も同じ関数を通す。`isHighFrequencyCommentRelatedStorageKey`(PE:18200)は lib へ移す。
- **網羅テスト**: `src/lib/*Key.js` と `storageKeys.js` の `export const KEY_*` を全部読み、各キーが 3 値のどれかに分類できること(未分類は赤・キー名を出す)。per-live キーは**実出力**(ビルダー関数)で照合(`selfWrittenCoversMirrorBundle.test.js:45-53` の流儀。`$` 終端の正規表現で per-live を取り逃した v1344 の教訓)。
- 受動 popup(PE:21515-21536): `changes[KEY].newValue` を `apply*ForPassive(newValue)` へ渡し再 get を省く(PE:6673・6927・6981・7033・7052 の関数に省略可能な snapshot 引数)。
- 変異: 診断キーを never から外す/未知キーを immediate にする/再 get に戻す。

### V4: ingest_log の 30 秒クールダウン(lib のみ・set のコードに触れない)
- **確認済み事実**: CE:11528 は `source:'tail'` を渡すが `COMMENT_INGEST_SOURCE`(commentIngestLog.js:20 付近)に `tail` が無く `normalizeIngestSource`(:84-89)で `unknown` に丸められ、クールダウン規則が無いので毎 flush 追記。CE:11548 は `ingestLogPayload` が null なら set に同梱しない(既存分岐)。
- **変更**(commentIngestLog.js とそのテストだけ): `COMMENT_INGEST_SOURCE.TAIL='tail'` を追加し、`{ minIntervalMs: 30_000 }` の**時間だけ**のクールダウン(added/totalDelta を見ない)。直前の同配信・同 source 項目から 30 秒未満なら null を返す。**配信が変われば必ず追記**。500 件上限の縮小はしない。
- **確認すること**: `anomalyVerdict.test.js:144` が `storage_changed:nls_comment_ingest_log_v1: 25` を素材にしている=AI 共有の取込ログ(PE:2953・19550)の粒度が 30 秒に粗くなる影響。判定の閾値が変わらないか。
- 変異: クールダウンを 0 に/配信切替で追記しない/tail を unknown に戻す。

### V5: 鏡の書き手リース(最も複雑・V1〜V4 の基準線が揃ってから)
- **前提確認(司令塔が済み)**: 拡張ページで Web Locks が使える(`ifAvailable` で 1 つ目取得・保持中の 2 つ目は取れず・解放後に残らない)。**SW/content が同じロックを共有するかは未確認**(popup 文書だけ参加する設計なので影響は小さい)。
- `tabLeaderLock.js` に保持型 `acquireHeldLock(name) → Promise<{ held, release() }>` を 1 関数追加(`runIfTabLeader` は fn 完了で解放する型なので流用不可)。Web Locks 不可/例外は **held=true**(fail-open=従来の全員書き)。
- 新規 `src/lib/mirrorWriterLease.js`(依存注入・`storage.*.set` を含まない): ロック名 `nls-mirror-writer-<lv>`。`ensure(lv)`(未保持なら 5 秒ごとに取得を試す・可視 or 会場開のときだけ)/配信が変われば release→再取得/**資格**は `decideHiddenWork({docHidden, venueOpen}).publish === true` の文書だけ/資格喪失(隠れた かつ 会場が閉じた)で即 release/pagehide でも release。
- 書く条件: PE:7103 `mergeAndScheduleFlush` と PE:7124 `publishLaneMirror` の先頭に `!lease.isWriter(lv)` なら return(`INLINE_PASSIVE` の判定の隣)。**描画(paint)はこの判定を見ない**(描画と publish を同じ早期 return に載せない)。PE:21346-21352 の「隠れていても会場が開いていれば `renderStoryUserLane()`」は**書き手だけ**が回す。
- timeline 鏡の代役(content): CE:11423 の関数先頭に「popup 書き手の鏡が 30 秒以内なら書かない」を 1 判定。content の既存 onChanged(CE:14416)で `KEY_COMMENT_TIMELINE_MIRROR` の `newValue.bundleLiveId`/`bundleCapturedAt`(封筒・mirrorBundleFlushScheduler.js:79-84)を控える(追加 read ゼロ)。控えが無い/30 秒超なら従来どおり書く。
- スキーマ変更なし(封筒を書き手判別に流用)。鮮度: 書き手は laneMirrorWriteGate の 60 秒床で必ず書く。引き継ぎは最大「5 秒再試行+次 tick 3 秒」≈ 8 秒 < SOFT 180 秒(`venueLaneMirrorSupply.js:35`)。
- **着手前に測る**: タイムライン鏡が 1 回 145KB になる理由(`TIMELINE_MIRROR_CAP=60`=`commentTimelineMirror.js:22` なのに大きい)。devtools で `JSON.stringify(bag[KEY_COMMENT_TIMELINE_MIRROR]).length`・`rows.length`・1 行の平均長。3 仮説: 旧値+新値で 2 倍/giftEvents 同乗/顔 URL が data URL。
- 変異: 非書き手でも書く/資格喪失で release しない/Web Locks 不可で held=false にする。

### V6: 会場の poll を自己修復型に
- VB:6346-6391 `pollSpeech`(800ms・VB:357)は ctail(最大 2,000 行・commentTailBuffer.js:36)+summary+gift 集計を毎回 get し、VB:6417-6418 の onChanged でも同じ行を処理(二重)。VB:6359-6364 に既に「panel_summary は 15 秒無音のときだけ read」の型がある。**同じ型を tail/summary にも**: 直近の onChanged(tail or summary)から 15 秒未満なら poll の get を省く(ギフト集計キーは従来どおり)。会場を開いた瞬間の再シード(VB:6331)は不変。
- 変異: 15 秒を 0 に/onChanged の受信時刻を更新しない。

## §4 合格基準・撤回基準(実機 census・3 分・更新→F5 後)
| 版 | 合格 | 撤回 |
|---|---|---|
| V1 | `nls_panel_summary_*` の n が popup 文書で **1/3 以下**(7,200→≤2,400 相当)。数字カードが初回 3 秒以内に埋まる | 数字カード「—」が 10 秒以上/「配信が見つからない」/会場の記録件数が 60 秒以上古い |
| V2 | status 文書の refresh 回数/分 ≤ 30。status の longtask 合計が V1 比で増えない | status の「最終更新」が 10 秒以上古い |
| V3 | popup の描き直し内訳で `storage_changed:*` の**即時**経路が 0。1 コメントあたりの描き直し ≤3 | コメント反映が 1 秒以上遅れる/設定トグルが効かない |
| V4 | `nls_comment_ingest_log_v1` の n が **1/10 以下**、バイト/分が 5 割減 | AI 共有の取込ログが空/anomalyVerdict が誤判定 |
| V5 | 鏡 3 族の n が **1/K**。会場の鏡 age ≤60 秒。①②③ パリティ(同 gen) | 会場が「①パネル未接続」に落ちる/鏡 age >180 秒/パリティ崩れ |
| V6 | 会場文書の get 回数/分 75→≤5。読み上げ遅延なし | 読み上げが 2 秒以上遅れる/吹き出しが出ない |

**CPU・黒縞は副次指標**(下がれば記録、下がらなくても版固有の合格基準を満たせば次へ)。V6 まで出して CPU が基準線から下がらなければ、「通知回数が主因」という仮説を捨て、記録 set の同乗分(不可侵)が主因として**記録経路の設計会議へ戻す**。

## §5 測り方(今日の手順の再利用)
- **実機**: 更新→F5→3分→まるごとコピー(census)+プロセス別 CPU。古い画面が混ざらないよう必ず更新後に。
- **測定用ブラウザ A/B**(chrome-devtools MCP・ユーザー実機とは別の headless): 旧版/新版を `git worktree add .ab/<版> <commit>` で用意(`.ab/` は `.git/info/exclude` に。終わったら `git worktree remove --force` で**必ず片付ける**=lint の対象になる)→ `uninstall_extension`→`install_extension`(path は作業ツリー内)→同じ配信ページを開く→拡張ページ(`manifest.json`)で `chrome.storage.onChanged` をキー族別に回数・バイトで数える→約 290 秒(1 回の `evaluate_script` は約 60 秒まで)。測る前に余分なタブを閉じる(測定タブが症状を作る)。

## §6 地雷(再掲・抜粋)
- 記録経路(`bufferRowsToTail`・`persistCommentRowsImpl`・`nls_ctail_`・`nls_comments_`・`nls_cchunk_`・`nls_csummary_`・IDB)は**1 文字も変えない**。V1 の不可侵ゲートを最初に入れる。
- `git add -A` は無関係の手元変更を巻き込む。**明示列挙**。
- CE/PE は CRLF/LF 混在に注意。Python で置換するときは生バイト列で。dist の日本語は `\uXXXX`。
- `gh pr merge` が権限判定で拒否されることがある(ユーザー指示があれば実行できた)。
- `copy:ext` の最中に Chrome がサービスワーカーを登録すると一時的に「Service worker registration failed. Status code: 15」が出る(21:06 に実際に出た)。配置→**すぐ更新ボタン→F5**を1セットで頼む。
- ユーザー向けの文言を変えたら実コードで因果を裏取り(AGENTS §12.7)。

## §7 未確認(確認済みとして扱わない)
- `refresh()` 本体(PE 約 14800〜16100 行)の内部 diff-skip が即時 refresh をどこまで無害化するか(V3 の効果は呼ばれる回数=`repaintReasonCensus` の内訳で測る)。
- v1586 反映後の census(基準線)。各キーの実機での書込頻度は census の値のみ。
- session の heavy 全件キャッシュ(PE:15310-15390)のヒープ寄与(census の `hp` を V0 で記録し、版で変わらないことを確認)。
- 黒縞が GPU 張り付きの原因か結果か。会場の出たり消えた(別仮説: 視聴ページ幅 1100px 境界・鏡の鮮度切れでフォールバック経路へ往復)。V5 の合格基準に混ぜない。
- SW/content が popup と同じ Web Locks を共有するか(popup 文書だけ参加する設計なので影響は小さい)。
