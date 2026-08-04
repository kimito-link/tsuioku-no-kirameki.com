# お題: コメント記録件数が「増えてから減る」現象 — 安全に単調化したい

## 背景(司令塔が実コードで確認済みの事実。推測でなく確定)

ニコ生視聴を盛り上げるChrome拡張。視聴中の配信のコメントを記録し、件数を状態速報/popup に出す。
ユーザー実機で「取れた記録が増えて、そして減る現象」。記録件数が後退している(例: 一旦 530 まで
増えてから 150 に戻る等)。記録の根幹なので【安全に】直したい。

### 記録件数の正本変数

`content-entry.js` の `let observedRecordedCommentCount = 0`(モジュールスコープ)が記録件数の正本。
状態速報の recordedCount も popup もこの値(または由来サマリ)を見る。

### 司令塔が特定した真因の【形】= 複数経路の絶対代入・単調ガード無し

`observedRecordedCommentCount = <値>` の代入が【6箇所以上】あり、いずれも前値と比較せず絶対代入:

- テール経路(3箇所): `= tailMainCount + tailRowsBuffer.length`
  (seedTailFromMain / テール畳み込み / compaction後)
- offscreen DB append(2箇所): `= total`(IndexedDB 追記の応答 total。total>0 のときだけ代入)
- incremental/chunk 経路(1箇所): `= effectiveTotalCount`
  (= liveChunkIndex.total + incrementalAdded.length、または next.length)

これらは【別々のタイミングで非同期に走る】。それぞれ違う正本(テール / IDB / chunk index)を
読んで絶対代入する。**バックフィルが大量に足した直後(chunk経路で 530 に上げる)に、テール経路が
「tailMainCount + tail長」の小さい値(150)で上書きすると後退する**=「増えて減る」。

リセットは2箇所だけ(配信切替 resetOfficialCommentSamplingState / 非watch遷移)で、いずれも
別配信/離脱のタイミング=同一配信中の誤リセットではない。よって**同一配信中の経路間の上書き合戦**が本命。

### 既存の参考実装(popup 表示の単調化)

`monotonicCommentCount.js` に `resolveMonotonicCommentCount(state, lv, candidate)` がある=
「同一 lv 内で max を下回らせない・lv が変われば別配信なのでリセット」。だがこれは【popup 表示層】の
ゲートで、content-entry の正本変数 `observedRecordedCommentCount` には適用されていない。
記録件数は原理的に減らない(コメントは消えない)ので、最大値への収束は意味的に正しい。

## 問い(これに答えてほしい)

1. `observedRecordedCommentCount` を「同一配信中は後退させない(単調増加)」にするのが安全か。
   それとも単調化は【症状を隠して真因(経路間の不整合)を温存】する危険があるか。
2. もし単調化するなら、どこで掛けるべきか。
   - (A) 6箇所の各代入を `observedRecordedCommentCount = Math.max(observedRecordedCommentCount, 値)` に変える
   - (B) 代入を1つのヘルパー `setRecordedCount(値)` に集約し、その中で単調ガード+lvリセットを持つ
   - (C) 各経路はそのまま絶対代入し、表示の直前(サマリ生成 buildPanelLiveSummary/buildCommentSummary)で単調化
   どれが安全で副作用が少ないか。
3. **危険ケースの洗い出し**: 単調化すると壊れる正当な減少はあるか?
   - 配信切替時の 0 リセット(別 lv)は単調ガードを【通さない】必要がある。これは lv 比較で守れるか。
   - テール畳み込みで「メインに移動した分テールが減る」のは総数は不変(tailMain+tail長は同じ)。
     これを単調化が誤って固定して二重計上しないか。
   - offscreen DB の total が一時的に 0/小さい値を返す(まだ書けてない)ときに、絶対代入だと減るが
     単調化なら据え置く。これは正しい挙動か。
4. **真因側も直すべきか**: 単調化は対症療法。経路が別々の正本を見て食い違う根(テール vs chunk vs IDB)を
   揃えるべきか、それとも単調化で十分か(over-engineering を避ける)。

## 制約

- 記録の永続(IDB/chunk/テール)の不変条件は壊さない。表示/カウントの後退だけ止めたい。
- 新しい storage 書き込みを増やさない(過去に storage 飽和事故あり)。
- 純関数化してテスト可能に(monotonicCommentCount.js と同じ作法)。
- 「安全に」が最優先=既存の記録経路を壊すリスクが最小の案を選ぶ。

## 必ず検討してほしい観点

### 観点A: 星野ロミならどう設計するか
重くしない・有界・割り切る・体感最優先。「件数は減らないのが真実」なら max 収束は割り切りとして正しいか。

### 観点B: 批判役は「単調化の罠」を必ず1つ指摘せよ
過去に時間ゲートの単調化で別バグを生んだ事例がある(音声ゼロ回帰)。単調 max で固定したことで
「本当はリセットすべき場面で古い大きい値が残る」誤動作が起きないか、具体的に。

## 出力フォーマット

`結論 → 根拠 → 反論・リスク → 具体案(どこに単調ガードを置くか・擬似コード)` の4ブロックで。
