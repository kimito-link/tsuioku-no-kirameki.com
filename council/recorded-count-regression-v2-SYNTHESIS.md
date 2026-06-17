# 統合: 記録件数が「また減る」根治 (v0.1.804)

会議 4/12 応答(groq gpt-oss-120b / groq llama-3.3-70b / gemini-2.5-flash / openrouter gpt-oss-120b)
+ 司令塔の実コード裏取り。

## 会議の一致点
- **本命=経路1**(recording OFF/ON で単調ゲートごとリセット→低値書き込み)。全 4 応答一致。
- **経路1の直し方=(C) per-live Map**。単一 state を liveId ごとの Map に。同一 live の OFF/ON で
  max を保持し、live 切替時だけ 0 から。生件数リセットと単調ゲートリセットを分離。
- **経路2(累計が減る)=overview 層に単調化**。新しい storage 書き込みは増やさない(表示単調化)。
- **批判役(罠)=** lv だけでキーにすると「録画を本当に止めて同 lv を新セッションで見直したとき
  古い max が残る」。録画セッション ID で区別すべき。
  - **司令塔の解(セッション ID 不要)**: genuine switch(liveIdSwitched)で **入る側(ctx.liveId)を forget**。
    別 live を見て同 lv に戻ると liveIdSwitched が発火し、戻り先=入る側 lv なので forget される=
    新セッションは 0 から。旧 lv を forget しても罠は防げない(戻り先のゲートが残るため)。

## 司令塔の裏取りで会議の前提を【2点訂正】(会議は実コードを知らない)

### 訂正1: 「recording OFF/ON が頻繁に起きる」は実コードでは限定的
- `KEY_RECORDING` は **グローバル 1 個**(配信ごとでない)。書き込みは popup のトグル 1 箇所
  (`popup-entry.js:19528`)のみ=**ユーザーが記録スイッチを手動で OFF→ON したときだけ**発火。
- 視聴中に普通は触らない。よって経路1 は「穴」ではあるが**常時の発生源とは限らない**。
- ただしグローバルゆえ、ユーザーが一度トグルすると**全タブの件数が 0 に落ちて積み直し**=
  「複数配信の記録が一斉に減る」体験になりうる(放置できない穴)。

### 訂正2: 会議が提案した「録画セッション ID(KEY_RECORDING_SESSION)」は**存在しない**=作らない
- 実コードに recording session ID の概念は無い。新キーは storage 書き込み増・複雑化で禁忌。
- **罠は別の既存機構で防げる**: 本当の配信切替は `syncLiveIdFromLocation` の
  `ctx.liveIdSwitched`(content-entry.js:11638)= 「両者 non-null かつ別 lv の明示切替のみ true」。
  ここで **per-live Map から該当 lv のエントリを delete** すれば、同 lv を新セッションで見直しても
  Map に無い→0 から正しく再開。セッション UUID 不要。
  - さらに `resetOfficialCommentSamplingState()`(= recording OFF / 切替 wrapper から呼ばれる)では
    **生件数 observedRecordedCommentCount は 0 にするが、Map は触らない**。これで「recording 手動
    OFF/ON では max 保持・本当の lv 切替では 0 から」を両立。

### 裏取りで確定した「減る」経路の全体像
- `resetOfficialCommentSamplingState()` の呼び出しは **2 箇所のみ**:
  ① live 切替 wrapper(content-entry.js:2006・genuine switch) ② `KEY_RECORDING → OFF`(13353)。
- `syncLiveIdFromLocation` の非切替(`liveIdChangedNonSwitch`)経路では **呼ばれない**=
  診断の `liveIdChangedNonSwitchCount:1` 自体は件数を消さない(誤検知に強い設計済み)。
- per-live 表示(status-entry が読む panel summary)は `recordedCountForDisplay(lid)` 経由=ゲート済み。
- 累計(`statusFormat.buildOverviewText`)は各 live の panel summary を**単純合算**=
  live が enumerate から落ちる(タブ閉じ/storage クランプ蒸発)と**累計だけ減る**(経路2)。

## 採用する最小実装(2 部・新 storage 書き込みゼロ)

### 部1: per-live 単調ゲートを Map 化(monotonicCommentCount.js)
- 既存の単一 state ベース API(`resolveMonotonicCommentCount(state, lv, candidate)`)は**そのまま温存**
  (既存テスト緑のまま)。
- 追加で **Map ベースのヘルパー**を新設(純関数・テスト可能):
  - `createMonotonicCommentCountMap()` → `Map<lv, max>`(実体は Map)
  - `resolveMonotonicCommentCountForLive(map, lv, candidate)` → lv ごとに max を保持して返す。
    lv が取れない/非数値は素通し(既存と同じ割り切り)。
  - `forgetMonotonicCommentCountForLive(map, lv)` → 該当 lv のエントリ削除(genuine switch 用)。
- content-entry.js:
  - `_recordedDisplayMonotonicState`(単一)→ `_recordedDisplayMonotonicByLive`(Map)へ。
  - `recordedCountForDisplay(lid)` は Map ヘルパーを使う。
  - `resetOfficialCommentSamplingState()` から **Map クリアを外す**(生件数だけ 0)。
    →recording 手動 OFF/ON で max を消さない(経路1 根治)。
  - `syncLiveIdFromLocation` の `ctx.liveIdSwitched` 分岐に
    `forgetMonotonicCommentCountForLive(_recordedDisplayMonotonicByLive, ctx.liveId)` を追加
    →本当の配信切替で【入る側】を 0 から(批判役の罠=同 lv に戻った時の残存を回避・セッション ID 不要)。

### 部2: 累計の overview 単調化(statusFormat.js + status/popup 呼び出し側)
- `buildOverviewText` に渡す累計を、**呼び出し側(status-entry / web app)が持つ単調状態**で
  「同一セッション内では累計を後退させない」。statusFormat は純関数のまま=状態は呼び出し側。
- ただし「タブを閉じたら本当に減る」を完全に隠さないため、**短時間の揺れだけ吸収**する設計に留め、
  storage には書かない(リロードで素直にリセット=誤誘導しない)。
  → 最小: `buildOverviewText` に `opts.monotonicFloor`(直近に出した累計の最大)を渡せるようにし、
    `recordedSum = Math.max(recordedSum, monotonicFloor)` で据え置く。呼び出し側が floor を保持。

## 退行ゼロの担保
- 記録の永続(IDB/chunk/テール)不変・新 storage 書き込みゼロ・既存単一 state API 温存。
- per-live Map は同時視聴配信数(通常 1〜3)ぶんで有界=星野ロミ「重くしない・有界」。
- genuine switch でだけ Map エントリ削除=「別配信は 0 から」を維持。
- 純関数 + テスト(Map 化ヘルパー・forget・overview floor)。

## 検証観点(実機)
「同一配信で記録スイッチを OFF→ON しても件数が 0 に落ちず保持」「本当に別配信へ切り替えたら
0 から数え直す」「累計が一瞬の enumerate 揺れで減らない・タブを閉じたらリロードで素直に反映」。
