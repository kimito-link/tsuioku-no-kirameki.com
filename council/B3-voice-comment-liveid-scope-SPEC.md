# 実装スペック: voiceDiag / commentPostDiag を liveId でスコープ化(B3 follow-up)

> 状態ラベル: **設計・裏取り完了 / 実装未着手(クラウドで実コード裏取り済み・ライブ検証はローカル待ち)**
> 作成: 2026-10-21(クラウドセッション) / これは「後でプロジェクトで実装する」ための自己完結スペック。
> 前提の完了済み: 項目3 pt優先順位(v0.1.1720)・gift音の liveId スコープ化(v0.1.1721=silentFailure、
>   v0.1.1722=全読み手)。この SPEC はその続き。親 MAP: [`B3-remaining-items-MAP.md`](B3-remaining-items-MAP.md)。
> 進め方は §12.10 wayfinder / §12.1 着手前ゲート(複数ファイル=Plan先行)/ §12.5(1版1変更)に従う。

## 0. 用語(初出)
- **診断スナップショット**: `chrome.storage.local` に書く計器の軽量コピー(`capturedAt` 付き)。
- **単一グローバルキー**: `nls_*_v1` のように配信ごとに分かれず1つのキーで持つ=別配信の値が居残る原因。
- **liveId スコープ化**: スナップショットに「どの配信の計測か(liveId)」を刻み、読み手は
  「今開いている配信(`data.livesData[].lv`)の記録か」で照合して別/過去の配信を弾く方式。
  判定の正本は純関数 `isGiftEffectDiagForOpenLive(snap, openLiveIds)`(`src/lib/giftEffectDiag.js`)。
  **挙動は diag 非依存**(`snap.liveId` しか見ない)なので、そのまま再利用できる。
- **opt-in ゲート**: 読み手は `openLiveIds` が渡されたときだけ照合する。未タグの旧データ(liveId 空)は
  helper が `true` を返すので従来表示のまま=**回帰なし・次の書き込みで自己治癒**。

## 1. ゴールと非ゴール
- **ゴール**: gift と同じ方式で、`voiceDiag`(読み上げ系)と `commentPostDiag`(送信取消)の
  silentFailureCells 対応セルほか読み手が、**別/終了済み配信の値を現在の問題として出さない**ようにする。
- **非ゴール**: キー自体を per-live 化する大改修(別設計)。voiceDiag/commentPostDiag の計測内容の変更。
  読み上げ/送信ロジックの変更。

## 2. 共通の方式(gift の v0.1.1721/1722 をそのまま踏襲)
1. **書き手**: スナップショット生成時に liveId を渡し、snapshot に刻む
   (未指定/非文字列は `''` = 旧データ扱い)。
2. **読み手**: `openLiveIds` 引数(任意)を足し、先頭で
   `if (openLiveIds !== undefined && !isGiftEffectDiagForOpenLive(snap, openLiveIds)) return [ /* 下記 */ ];`。
   - 文章の行(`build*Lines`)・対処カード(`*ToActionCards`)は **`[]`(非表示)**。
   - 健全度グリッドのセル(`build*HealthCells`)は **消さず `na`「別の配信の記録です」**(掟5=設定が
     有効なら必ず出す。gift の `healthCells.js` buildGiftEffectHealthCells を手本に、未観測チェックの後に置く)。
3. **呼び出し元**: `data.livesData[].lv`(開いている配信の liveId 群)を `.map((l)=>l?.lv)` で渡す。
   型チェック対策で `(/** @type {any} */ l)` を付ける(gift で TS7006 を踏んだ)。
4. **型**: 各 DiagState の @typedef に `liveId?: string` を足す(gift で TS2559 を踏んだ。
   snapshot が実際に持つ値をモデル化しないと helper 引数で「共通プロパティ無し」エラーになる)。
5. **helper の置き場所(判断1つ)**: 3つ目の diag が使うので、`isGiftEffectDiagForOpenLive` を
   diag 非依存名(例 `isDiagSnapshotForOpenLive`)で小さな共有モジュール
   (例 `src/lib/diagLiveScope.js`)へ移し、giftEffectDiag.js はそこから re-export するのが望ましい
   (CANONICAL CHECK=ESTABLISH_REHOME・decision receipt 記録)。移さず現行の gift 名のまま流用しても
   動くが、voice/comment で gift 名を呼ぶ違和感が残る。**どちらでも可・移す方を推奨**。

## 3. voiceDiag(読み上げ系)— 実装詳細

### 裏取り済みの事実
- キー: `nls_voice_diag_v1`(単一グローバル。`src/lib/voiceDiagKey.js`)。
- スナップショット: `buildVoiceDiagSnapshot(diag, nowMs)`(`src/lib/voiceDiag.js:127`・`capturedAt`/`source` 付き)。
- **書き手は2つ・どちらも liveId を知る**:
  - `src/extension/comeview-entry.js:278`(`[KEY_VOICE_DIAG]: snap`)。liveId は同ファイルの `_liveId`(:156 宣言・:379 で現在 lv を設定)。
  - `src/extension/venueBar.js:3342`。liveId は `liveIdFromPathname()`(venueBar.js:2442)。
- 読み手: `buildVoiceDiagLine`(`voiceDiag.js:199`)→ status-entry・aiShareFullText。
  `buildVoiceHealthCells`(healthCells.js)。silentFailureCells の `voice-start-fail`・`voice-audio-blocked`。
- ★**voiceDiag 固有の注意**: voiceDiag は会場稼働中は comeview が高頻度 publish する(heartbeat)ので、
  `buildVoiceDiagLine`(voiceDiag.js:224 `judgeValueFreshness(now-capturedAt, VOICE_DIAG_FRESH_MS)`)と
  `buildVoiceHealthCells`(healthCells.js:207 `VOICE_LIVE_JUDGE_WINDOW_MS`)は **既に capturedAt 鮮度ゲートを持つ**。
  gift と違い時間窓が効く計器。**鮮度ゲートが無いのは silentFailureCells の voice セルだけ**。
  → 最小修正は **silentFailureCells の voice-start-fail / voice-audio-blocked に liveId ゲートを足す**こと。
  buildVoiceDiagLine / buildVoiceHealthCells は既に capturedAt で守られているので、liveId まで足すかは
  「二重で堅くするか・最小に留めるか」の判断(推奨: まず silentFailure の2セルだけ。残りは効果を測ってから)。

### 変更点(voiceDiag 版・1版)
1. `voiceDiag.js`: `buildVoiceDiagSnapshot(diag, nowMs, liveId)` に liveId 引数を足し snapshot へ
   `liveId: String(liveId ?? '').trim().toLowerCase()`。`VoiceDiagState` に `liveId?: string`。
2. `comeview-entry.js:278` の書き込みで `buildVoiceDiagSnapshot(..., _liveId)`。
   `venueBar.js:3342` の書き込みで `buildVoiceDiagSnapshot(..., liveIdFromPathname())`。
   (venueBar 側の snap 生成箇所を確認し、両方に liveId を通す。)
3. `silentFailureCells.js`: `voice-start-fail`・`voice-audio-blocked` を、`isGiftEffect…ForOpenLive(v, openLiveIds)`
   が false なら `na`「別の配信の記録です」に(gift-sound-fail と同じ型)。`openLiveIds` は既に関数内で
   `data.livesData[].lv` から作ってある(gift 用に v0.1.1721 で用意済み・再利用する)。
4. テスト: `voiceDiag.test.js`(snapshot liveId・後方互換)、`silentFailureCells.test.js`
   (別配信=na / 現配信=従来 / 未タグ=回帰なし)。

## 4. commentPostDiag(送信の取り消し)— 実装詳細

### 裏取り済みの事実
- キー: `nls_comment_post_diag_v1`(単一グローバル。`src/lib/commentPostDiagKey.js`)。
- スナップショット: `buildCommentPostDiagSnapshot(diag, nowMs)`(`src/lib/commentPostDiag.js:151`・`capturedAt` 付き)。
- **書き手は popup**: `src/extension/popup-entry.js:1324`(`publishCommentPostDiag`)。
  liveId 候補は同ファイルの `watchPopupLastPaintedLiveId`(:1624 で設定)。
  ★**要確認(着手時)**: 送信取消カウンタ(`_commentPostDiagCounters`)が「今 painted の配信」の送信に
  対応しているか。popup は複数配信を扱い得るので、`watchPopupLastPaintedLiveId` がこのカウンタの
  配信と一致するかをコードで裏取りしてからタグに使う(一致しないなら、送信先の lv をカウンタ更新時に
  保持する設計へ。推測で watchPopupLastPaintedLiveId を使わない=gift の「書き手が liveId を知るか」確認と同じ)。
- 読み手: `buildCommentPostDiagLines`(`commentPostDiag.js:170`)→ status-entry・aiShareFullText。
  silentFailureCells の `comment-revert`。
- commentPostDiag は capturedAt 鮮度ゲートを持たない(gift と同じ=全読み手で居残りが出る)。

### 変更点(commentPostDiag 版・別の1版)
1. `commentPostDiag.js`: `buildCommentPostDiagSnapshot(diag, nowMs, liveId)` + snapshot へ liveId。
   `CommentPostDiagState` に `liveId?: string`。
2. `popup-entry.js:1324`: 裏取りで確定した liveId を渡す。
3. `commentPostDiag.js` の `buildCommentPostDiagLines(snap, nowMs, openLiveIds)` に opt-in ゲート(`[]`)。
   `silentFailureCells.js` の `comment-revert` に na「別の配信の記録です」ゲート。
4. 呼び出し元: status-entry・aiShareFullText の `buildCommentPostDiagLines(...)` に `livesData[].lv` を渡す。
5. テスト: `commentPostDiag.test.js`・`silentFailureCells.test.js`。

## 5. 各版の出荷手順(gift と同一)
- `npm run verify:cc` 緑(test/lint/typecheck/build/各ゲート)。型は `liveId?: string` 宣言を忘れない。
- bump 3点(manifest/package/`src/lib/changelog.js` summary≤35字)→ `node scripts/split-changelog.mjs`
  → `npm run build` → LP版数 `sed`(`tsuioku-no-kirameki/index.html`)→ `npm run site-health` → `npm run tree-map`
  → `npm run feature-map` → `npm run improvement:record`(bundle-kb/cross-checked-claims は過去最良超なら note 必須)。
- helper を新モジュールへ移すなら **新規 source file=decision receipt 記録**
  (`node ../web-ios-android/templates/scripts/record-decision-receipt.mjs --decision ESTABLISH_REHOME
  --canonical-source <新ファイル> --scope <新ファイル>`。ただし **tsuioku 直下の `.decision-receipts.json`** に
  入れる必要があり、kit の record ツールは kit 側へ書く癖があるので、書けていなければ手で tsuioku の
  台帳へ追記する。gift の 1720 で踏んだ)。
- commit → push → **master 未マージのまま**。

## 6. ★ライブ検証(ローカル実機・この項目の合否はここで決まる)
- 配信A→配信B 切替で、Aの「読み上げON失敗」「送信の取り消し」がBで『別の配信の記録』になること、
  Bで本物の失敗/取消は従来どおり出ることを、`npm run census:watch`(窓3分以上)と実機で確認。
- comeview/popup を**両方開いた多タブ**でも、現在の配信のセルだけ生きていることを確認
  (単一グローバルキーの last-writer-wins を liveId 照合が救っているか)。

## 7. 参照(手本の実コード)
- gift の実装(この SPEC の雛形): `src/lib/giftEffectDiag.js`(`buildGiftEffectDiagSnapshot` の liveId・
  `isGiftEffectDiagForOpenLive`)、`src/lib/silentFailureCells.js`(gift-sound-fail ゲート)、
  `src/lib/healthCells.js`(buildGiftEffectHealthCells の na セル)、commit `496ed998`/`cb8a22a3`。
- 原則: AGENTS.md §3.6(未観測を false と混同しない)・§12.7(診断の因果裏取り)・§12.2(外科的・1単位)。
