# Codex 依頼プロンプト（フェーズ1限定・コピペ用）

以下をそのまま Codex CLI に渡してください。

---

AGENTS.md を読んでから着手して。このタスクは **src/lib/mirrorBundle.js の新規純関数＋テストの追加だけ**。
呼び手はまだ無い＝**popup-entry.js / status-entry.js / app/live-view.js には一切触れない**（今回のスコープ外）。
挙動不変・新規ファイル追加のみなので、AGENTS.md §12.1 の Plan 先行ゲートの対象外（1ファイル追加＋テストのみ）。

## 背景（読むだけでいい・実装の前提）

このプロジェクトには「①本物POP＝②応援プレビュー＝③WEB」を同一にする仕組みがある。①(popup)が
「鏡」と呼ぶ JSON スナップショットを storage に書き、②③がそれを読んで①と同じ画面を再現する。

今は鏡が5種類あり、**それぞれ別の storage キー・別の3秒タイマーで、別々の瞬間に書かれている**：
- `src/lib/laneMirror.js`（応援レーン: buildLaneMirrorSnapshot / restoreLaneMirrorBuckets）
- `src/lib/statCardsMirror.js`（数字カード: buildStatCardsMirrorSnapshot / buildStatCardsMirrorSignature）
- `src/lib/topSupportersMirror.js`（応援者ランキング: buildTopSupportersMirrorCells / topSupportersMirrorSig）
- `src/lib/commentTimelineMirror.js`（コメント流れ: buildCommentTimelineMirrorSnapshot / restoreCommentTimelineRows）
- `src/lib/northStarMirror.js`（貢献度/広告ランキング: buildNorthStarMirrorSnapshot / restoreNorthStarMirrorRows / **mergeNorthStarMirrorLanes**）

このうち `northStarMirror.js` の `mergeNorthStarMirrorLanes` だけは「複数レーンの部分更新を1つの合流バッファに
順不同でマージし、未指定レーンは温存し、liveId が変わったらリセットする」という設計になっている。
これを読んで型・思想を掴んで（特に `src/lib/northStarMirror.js` と `src/lib/northStarMirror.test.js` を必ず読むこと）。

## 今回作るもの

`src/lib/mirrorBundle.js` を新規作成。上記5鏡を「1つの合流バッファ」にまとめ、**同一tickで一貫した1バンドル**
として扱えるようにする純関数群。`mergeNorthStarMirrorLanes` の設計思想（部分更新・未指定は温存・liveId変化で
リセット・非決定的な解決順でも両方揃う）を、5セクション分に一般化したもの、と考えて実装して。

### 型（JSDoc typedef で定義。TypeScript は使わない・このプロジェクトは JS+JSDoc）

```
MirrorBundle = {
  liveId: string,
  gen: number,              // 単調増加カウンタ（flush のたびに +1）
  capturedAt: number,       // epoch ms
  sections: {
    lane: LaneMirrorSnapshot | null,             // laneMirror.js の buildLaneMirrorSnapshot の戻り
    statCards: StatCardsMirrorSnapshot | null,    // statCardsMirror.js の buildStatCardsMirrorSnapshot の戻り
    topSupporters: { liveId, capturedAt, rooms } | null,  // topSupportersMirror.js の buildTopSupportersMirrorCells を使って呼び手が組む形
    northStar: NorthStarMirrorSnapshot | null,    // northStarMirror.js の buildNorthStarMirrorSnapshot の戻り
    commentTimeline: CommentTimelineMirrorSnapshot | null // commentTimelineMirror.js の buildCommentTimelineMirrorSnapshot の戻り
  }
}
```

### 実装してほしい関数（すべて chrome 非依存の純関数。storage の read/write は一切書かない）

1. **`createEmptyMirrorBundle()`** — `{ liveId: '', gen: 0, capturedAt: 0, sections: { lane: null, statCards: null, topSupporters: null, northStar: null, commentTimeline: null } }` を返す。

2. **`mergeMirrorBundleSection(buffer, sectionKey, sectionSnapshot, opts)`**
   - `buffer`: 現在の合流バッファ（MirrorBundle形）
   - `sectionKey`: `'lane' | 'statCards' | 'topSupporters' | 'northStar' | 'commentTimeline'` のいずれか
   - `sectionSnapshot`: そのセクションの新しいスナップショット（各鏡ファイルの build 関数の戻り値そのもの）
   - `opts.liveId`: このセクション更新が属する liveId
   - `opts.nowMs`: 現在時刻
   - 挙動: `mergeNorthStarMirrorLanes` と同じ不変条件をセクション粒度に一般化する。
     - liveId が buffer と異なれば「新しい liveId で全セクション null にリセット」してから該当セクションだけ更新。
     - 同じ liveId なら、指定されたセクションだけ差し替え、**他のセクションは温存**（今回 patch していないセクションを消さない＝ mergeNorthStarMirrorLanes の「未指定レーン温存」と同じ思想）。
     - capturedAt は `opts.nowMs` で更新。gen はこの関数では上げない（gen は flush 側の責務。理由: 呼び手が「複数セクションを連続で merge してから最後に1回だけ flush」という使い方をする前提のため、merge のたびに gen を進めると意味が変わる）。
     - liveId 未指定（空文字）の patch は、buffer の liveId を変えない（既存 mergeNorthStarMirrorLanes と同じく「不明な liveId で上書きしない」防御）。
   - 戻り値: 新しい MirrorBundle（イミュータブル。引数の buffer は変更しない＝mergeNorthStarMirrorLanes と同じ流儀）。

3. **`bumpMirrorBundleGeneration(buffer, nowMs)`**
   - 合流バッファの `gen` を +1 し、`capturedAt` を `nowMs` に更新した新しい MirrorBundle を返す（flush 直前に1回呼ぶ想定）。
   - 純粋関数。副作用なし。

4. **`isMirrorBundleGenerationStale(lastPaintedGen, incomingGen)`**
   - 読み手側（②③）が「このバンドルを描いていいか」を判定するための単調性ガード純関数。
   - `incomingGen <= lastPaintedGen` なら stale=true（描かずに前回の DOM を保持すべき）を返す。
   - 数値でない/未定義は 0 として扱う（初回は必ず描画できるように）。
   - 戻り値: boolean。

5. **`restoreMirrorBundleSection(bundle, sectionKey)`**
   - bundle からそのセクションのスナップショットを取り出すだけの薄いアクセサ（null-safe）。
   - 各セクションの実際の復元（restoreLaneMirrorBuckets 等）はこのファイルの責務ではない＝呼び手が
     このアクセサの戻り値を各鏡ファイルの restore 関数に渡す想定。ここでは「取り出す」だけでいい。

## テスト（src/lib/mirrorBundle.test.js を同時に作成）

`src/lib/northStarMirror.test.js` の書き方（describe/it、日本語のテスト名、★不変条件コメント）に倣うこと。
最低限カバーすること:
- createEmptyMirrorBundle の初期形
- mergeMirrorBundleSection: 異なるセクションを順番に merge しても全部揃う（lane→statCards→northStar の順、逆順でも成立、mergeNorthStarMirrorLanes の「非決定的な解決順」テストと同じ発想）
- mergeMirrorBundleSection: 1セクションだけ更新しても他セクションが温存される（★最重要の回帰防止テスト）
- mergeMirrorBundleSection: liveId が変わったら全セクションがリセットされる（古い配信のセクションを持ち越さない）
- mergeMirrorBundleSection: liveId 未指定の patch は既存 liveId を変えない
- bumpMirrorBundleGeneration: gen が単調増加する・capturedAt が更新される・元の buffer を変更しない（イミュータブル）
- isMirrorBundleGenerationStale: 初回(lastPaintedGen未定義/0)は false・同じ gen は stale=true・incoming が大きければ false・incoming が小さければ stale=true
- restoreMirrorBundleSection: null-safe（bundle が null/セクションが無い時に落ちず null を返す）
- ネガティブコントロール: 全関数が null/undefined 入力で例外を投げない

## 完了条件（このタスクのゴール）

1. `src/lib/mirrorBundle.js` 新規作成（chrome 非依存・JSDoc typedef あり・コメントはこのプロジェクトの流儀＝日本語で「なぜ」を書く）
2. `src/lib/mirrorBundle.test.js` 新規作成（上記ケース網羅）
3. `npm run test:cc` で新規テストを含めて全緑（既存テストを1つも壊さない）
4. `npm run typecheck` が通る（JSDoc の型注釈に矛盾がないこと）
5. `npm run lint` が通る
6. **popup-entry.js / status-entry.js / app/live-view.js / manifest.json / package.json は一切変更しない**（差分に含まれていたら間違い＝元に戻すこと）
7. version bump 不要（呼び手が無い＝ユーザーに見える挙動変化ゼロのため。AGENTS.md §12.5 の「挙動不変の1ファイル追加」に該当）
8. 変更後、`git diff --stat` で新規2ファイルだけが追加されていることを確認して報告して

## 厳守（過去にこのプロジェクトで実機退化した地雷・繰り返し禁止）

- ここで storage の read/write を書かない（chrome.storage に一切触れない。純関数のみ）。
- 各鏡の「セクション snapshot の中身の形」を独自に作り直さない（laneMirror.js 等が既に定義した build 関数の
  戻り値をそのまま受け取れる形にする。似せて再定義しない）。
- gen や capturedAt を各セクションの再描画 signature（例: topSupportersMirrorSig）に混ぜない設計にしないこと
  （このプロジェクトには「sig に時刻を入れると明滅する」という既知の回帰があるため、gen はあくまで
  bundle 全体の一貫性ガード用に閉じ、個々のセクションの sig ロジックには一切触れない）。
- 過剰実装しない（CRDT・Web Worker・OffscreenDocument 等は今回のスコープに一切不要。素直な純関数で十分）。

終わったら、何を作ったか・テスト結果・`git diff --stat` の出力を簡潔に報告して。
