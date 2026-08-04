# SYNTHESIS: ①POPを堅牢化 → 全機能 → ①②③同一（素材集め＋実コード裏取り）

作成 2026-07-02。会議(council/pop-foundation-then-parity-answers.json)＋司令塔が実コードで裏取りした統合素材。
Stage2(Fable設計)への入力。**会議の結論は必ず実コードで裏取りする**方針(過去地雷)に従い、コード確認済みの事実に★を付す。

## 0. ユーザー正本（順番が肝）
「まず①本物POPがちゃんと動く → その上で全機能 → その上で①②③同一」。
実機症状=**①本物POP(ツールバー)で「全部」同時**: 重い/真っ白・数字ズレ・レーン顔崩れ・パリティ緑が嘘。

## 1. ★実コードで確定した根本原因（司令塔が grep/Read で裏取り）

### ★1-A. 「フルコピーが嘘」の構造的真因＝鏡が別キー・別tickで書かれる
`src/extension/popup-entry.js` の publish 群は、鏡ごとに**独立した storage キー**へ**独立した3秒 min-gap タイマー**で書く:
- `KEY_LANE_MIRROR` ← `_laneMirrorLastWriteAt`（publishLaneMirror:5721）
- `KEY_STAT_CARDS_MIRROR` ← `_statCardsMirrorLastWriteAt`（publishStatCardsMirror:5745）
- `KEY_TOP_SUPPORTERS_MIRROR` ← `_topSupportersMirrorLastWriteAt`（publishTopSupportersMirror:5768）
- `KEY_COMMENT_TIMELINE_MIRROR` ← gate（publishCommentTimelineMirror:5790）
- `KEY_NORTH_STAR_MIRROR` ← `_northStarMirrorLastWriteAt`（publishNorthStarMirror:5843）

各 publish は別々の瞬間に別々の `chrome.storage.local.set` を撃つ。**よって②③は「statCards はtick T1の①・lane はtick T2の①」を読む**＝同一tickの一貫スナップショットが構造的に存在しない。これが「①記録150 vs ②129」の正体。北極星だけは既に「両レーンを1snapshotに合流(deferWrite)」する前例(publishNorthStarMirror:5848 mergeNorthStarMirrorLanes)がある＝**この合流パターンを全鏡へ一般化するのが正攻法**。

### ★1-B. ③WEB は既に「1 jsonBlob」を受けている（サーバ側で束ねている）
`app/live-view.js:216-218` は `jsonBlob.laneMirror / statCardsMirror / northStarMirror` を読む＝**③は既にバンドル前提**。だが①が別tickで書いた各キーをサーバが拾って束ねるので、**束ねた jsonBlob 自体が内部不整合**。∴ 束ねるのは正しいが、**「同一tickで焼く」保証が①側に無い**のが穴。

### ★1-C. 数字ズレは「表示カウンタ分裂」の残（②の独自読みは v1019 で潰した）
表示の正本は `recordedCountForDisplay`(displayRecordedCount.js#selectDisplayRecordedCount)に一本化中(AGENTS.md §12.8)。②の数字カード独自読みは v1019 で鏡一本化済。残るズレは 1-A のtick差が主因の可能性大。

### ★1-D. 重さ＝単一LevelDB書込競合（記録/②受動/status/backfill が奪い合う）
単一 chrome.storage.local を4系統が奪い合い、並行readでstall(status-entry.js:317)。3配信+backfillで更新所要11秒級。②passive の refresh() 丸走りは v1023 で潰し済＝**残るは①本体の書込頻度と直列read**。

## 2. 会議の収束点（4体・批判役含む）＋司令塔の判定

- **Q1 優先順（会議 critic の異議を採用）**: DB競合より先に**①の論理的正しさ**(カウンタ一本化＋鏡の同一tick化)。
  数字ズレは①の**論理バグ**でありDB最適化では消えない、と critic が的確に指摘。★1-A/1-C と一致。
- **Q2 鏡設計**: **「複数鏡のまま、同一tickでatomicに1回だけ焼く」**（＝北極星の deferWrite 合流を全鏡へ一般化）。
  ★critic の重要注意: **chrome.storage の write commit は async。1回 set でも②③の get が直後だと未反映を読みうる**。
  → 読み手にも一貫性ガードが要る＝**鏡バンドルに generation/tick 印(capturedAt+単調 seq)を載せ、②③は「全鏡が同一 gen」の時だけ描く**(部分更新で描かない)。
- **Q3 検証（嘘の緑を出さない）**: 突合の第1指標は**応援者ランキング行数**(空 vs 有が最も明確・parity-check memory と一致)＋**記録件数**。ハッシュ全体は過検知になりやすい→**gen 印が一致し、かつ記録件数・応援者行数が一致**を緑条件に(過検知回避)。
- **Q4 段階ゲート**: (1)①のカウンタ一本化と鏡の同一tick化が**崩れると②③全て無駄**＝最優先ゲート。(2)重さ緩和は独立に効く安全レバー。(3)parity検証は②③の実描画値突合まで到達して初めて「緑=本物」。

## 3. Fable への設計依頼（Stage2）
「最高の①POP堅牢化 → 全機能 → ①②③同一」の設計を、次を厳守して出す:
- ★1-A の一般化＝**全鏡を単一の atomic mirror bundle（1キー or gen印付き複数キー）に同一tickで焼く**設計。
  北極星の mergeNorthStarMirrorLanes/deferWrite が手本。似せて自作せず既存合流を一般化。
- read path(refresh/paint)不触・DOM丸ごと鏡禁止・盲目的 sig skip 禁止・②はstorageに書かない受動のまま。
- generation/tick 一貫性ガード（②③は全鏡同一 gen の時だけ描く）で「async commit で古い鏡を読む」を封じる。
- parity は②③の実描画値(応援者行数＋記録件数＋gen)を①と突合。過検知(常時🟡)を避ける緑条件。
- popup-entry.js は max-lines 上限ギリギリ＝新規純関数は src/lib へ。段階導入(patch粒度)とゲートを明示。

## 3.5 Fable 設計の要旨（Stage2 成果・司令塔が実コードで再裏取り済み）

Fable が SYNTHESIS に無い事実を7つ追加発見。うち設計の要=**F-1/F-3 を司令塔が実コードで再確認済み**:
- ★**F-1 確定**（popup-entry.js:5725）: min-gap は「間引き」でなく**データ喪失**。`if (now-_lastWriteAt<3000) return;` が
  `buildLaneMirrorSnapshot(input)`(5727) の**前**にあり、窓内の最新 input は保存されず捨てられる。北極星だけ合流
  バッファ `_northStarMirrorLanes` で input を保持＝**この差が「レーンが古いまま/出たり消えたり」の一因**。
- ★**F-3 確定**（popup-entry.js:8013）: statCards 鏡は audience 描画末尾で**その瞬間の DOM textContent**
  (`$('liveStatComments').textContent`) を読んで焼く。lane は renderStoryUserLane 末尾・supporters は strip 再描画時・
  コメントはティッカー時・北極星は allSettled 後＝**5系統に共通の合流点(join point)が無い**。∴ 北極星の
  「allSettled後に1回」をそのまま真似できず、**スケジューラ型(trailing-edge flush)の一般化**が要る。
- F-2: topSupporters は stripKey 変化時のみ publish→min-gap と重なると次の変化まで鏡が凍る。
- F-4: 各鏡が単一グローバルキー＝3配信同時で「lane=A/statCards=B」の混在テアリングが構造上可能。
- F-5: 鏡の嘘は①自身にも還流（applyLaneMirrorForMainPopupFallback:5440 が鏡を読む）＝鏡の正しさは①堅牢化そのもの。
- F-7: parity の②突合は現状 ack{ready,ts,liveId,laneTiles,supporterRows} のみ＝**記録件数の値突合も gen も無い**。

**設計の核（採用）**: 5鏡を「北極星の合流バッファ＋deferWrite を src/lib/mirrorBundle.js へ一般化したスケジューラ」で、
**gen 印つき単一バンドルとして1回の set で焼く**。移行期は旧5キーを**同じ set に同梱**して読み手無変更のまま同一tick化
（write IOPS 5→1・onChanged 1回・min-gap 中の更新はバッファに残り次 flush で必ず載る＝F-1 根治）。②③は
**単調性ガード**（gen が前回より小さければ描かず前 DOM 保持）で async commit の古い読みを封じる（read path 不触）。
parity は②の実描画値（応援者行数＋記録件数文字列＋gen 追随 K=2 猶予）を①と突合して初めて緑（過検知回避）。

**段階導入（6フェーズ・§12.6・🟥ゲート=フェーズ2）**:
1. ⚙️ src/lib/mirrorBundle.js 純関数＋テスト（呼び手ゼロ＝挙動不変）
2. 🟥**ゲート** ①が同一tickで焼く（publish群5関数→バッファ化＋単一set・旧5キー同梱・読み手無変更）。
   **これでも①②数字がズレるなら真因は鏡より上流＝以降全部無駄。停止して再診断**。検証=状態速報の各鏡 capturedAt 同値・consistency の data_mismatch 消滅・stepMs 悪化なし。
3. ⚙️ ②がバンドル読み＋単調性ガード（apply群・sig/paint 不変=v1022/v1032 地雷回避・②書込ゼロ死守）
4. ⚙️ ③/status がバンドル相乗り（jsonBlob に1フィールド・旧併存1リリース）
5. ⚙️ 緑を本物に（ack 拡張 paintedGen/recordsText＋parityVerdict の gen/値突合）
6. ❄️ 旧キー撤去・per-live バンドル（実害観測後に解凍）

**変更ファイル**（1変更=1patch）: (1)src/lib/mirrorBundle.js新 (2)popup-entry.js publish群5700-5870＋docs/mirror-bundle-flow.html
(3)popup-entry.js apply群5354-5698 (4)status-entry.js＋app/live-view.js (5)previewRenderAckKey.js/parityVerdict.js/liveviewPublishSelfDiag.js (6)旧キー撤去。

**Fable が正直に「未確認」とした点（実装前に詰める）**: (a)複数キー同梱 set 中の並行 get が torn を見せないかは
Chrome 実装依存＝だから読み手 gen ガードを必須にした。(b)①の11秒の内訳計器は status stepMs しか無い＝フェーズ2で①本体を実測。
(c)②apply 群の起動トリガ(onChanged/polling)の配線は未読＝フェーズ3で読んでから変更。

## 3.6 フェーズ1 実装＋レビューで確定した設計判断（2026-07-02・Codex実装→code-reviewer＋司令塔レビュー）

フェーズ1（src/lib/mirrorBundle.js＋test）は Codex が実装、司令塔＋code-reviewer が独立レビュー。
**土台の穴を1件フェーズ1のうちに根治**（呼び手が増える前に直すのが正しい）:

- 🔴**確定バグ→根治**: 単調性ガードの gen を**配信切替で巻き戻すと新配信が描かれない**。
  当初実装は `mergeMirrorBundleSection` が liveId 変化で seed を空バンドル(gen=0)にリセット→gen が若返り、
  読み手 `isMirrorBundleGenerationStale(lastPaintedGen=5, incoming=1)` が `1≤5` で **stale=true=新配信 lv2 を描かない**。
  → **採用=選択肢B（reviewer 推奨・司令塔同意）**: **merge の liveId リセット時もセクションだけ空にし gen は base.gen を温存**
  （gen をバンドル生涯で単調に）。配信切替の検知は liveId 突合で別途行う（gen は飛び番でよい・単調でありさえすればガードは正しい）。
  実装: mirrorBundle.js `mergeMirrorBundleSection` の `gen: base.gen`＋`seedSections = createEmptySections()`。
  結合テストで固定（旧実装 gen=0 なら FAIL する形）: 「配信切替で gen 温存」「切替後 gen 前進を読み手が stale 誤判定しない」。
- 🟡**capturedAt 単調化**: merge/bump とも `Math.max(base.capturedAt, nowMs)`（nowMs 未指定で 0 転落・古い nowMs で巻き戻りを防ぐ）。
  理由=フェーズ2の緑条件が「各鏡 capturedAt 同値」を計器に使うため時刻は前進のみ。テストで固定。
- ✅**地雷回避を確認**: chrome非依存（storage参照ゼロ）・gen/capturedAt を各セクション sig に混ぜない・各鏡 snapshot を作り直さず
  build 関数の戻りをそのまま載せるだけ・イミュータブル。他ファイル（popup/status/live-view/manifest/package）不触。
- ✅**検証**: mirrorBundle.test.js 17 passed・test:cc 6660 passed・typecheck・lint 全緑。呼び手ゼロ＝挙動不変＝version bump 不要。

**フェーズ2の実装者への申し送り**: 読み手②③の単調性ガードは **liveId 突合とセットで使う**
（`liveId` が変わったら `lastPaintedGen` を無視して必ず描く。gen は同一 liveId 内でのみ比較）。
`isMirrorBundleGenerationStale` は gen 数値比較のみ＝liveId 突合は呼び手（読み手）の責務。

## 4. 地雷マップ（Fable/実装へ引き継ぐ・繰り返し禁止）
- refresh()/paint read path 不触(v948 2回却下)。DOM丸ごと鏡=重さ却下。②passive に storage書込/キャッシュを足すな(v1023 の逆行)。
- 盲目的 sig skip=別surfaceちらつき(v1032撤回・機序未特定)。sig に capturedAt を入れない(v1022 明滅)。
- ack{ready,ts,liveId}だけの緑は嘘(parity-check-must-compare-values-not-just-ack)。
- 会議のローカル模型は品質限定＝結論は実コード裏取り必須(★印だけ信頼)。
