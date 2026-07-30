# 実装ハンドオフ — LaneScene検証のMVP(SceneEnvelope+RenderReceipt)

このファイル1枚で着手できる。検証の背景・ユーザー提案のどこを採用/不採用としたかは [lanescene-structural-review-DESIGN.md](lanescene-structural-review-DESIGN.md) を参照(検証=Fable/裏取り=司令塔、2026-07-14)。

## 重要: このハンドオフは「大規模再設計」ではない

ユーザーから提示されたLaneScene構造改革(ロビー撤去・①POP改造・共有コンポーネント化)は、検証の結果**大部分が不採用**となった。ロビーは撤去せず、①POPは改造しない。今回実装するのは、提案の中で価値が認められた部分(一致証明の機械化)だけを最小追加する**MVPのみ**。

## スコープ(MVPのみ)

新規ファイル1本+既存2箇所への軽微な配線のみ。

### 1. 新規lib `src/lib/laneSceneEnvelope.js`

以下4つの純関数(DOM/chrome非依存・単体テスト可能):

```js
/** buckets を正規化して決定的な contentHash を返す(userKey+displaySrc+title、段順固定)。
 *  揺れるフィールド(capturedAt等)を絶対に混ぜない(地雷1参照)。 */
export function laneSceneContentHash(buckets) { ... } // => string(8桁hex程度で十分。crypto不要)

/** publishLaneMirror が snap に焼き込む封筒。revision は①側の既存 bundleGen をそのまま使う
 *  (popup-entry.js:6901,6945 で使われている値。新規カウンタを作らない)。 */
export function buildSceneEnvelope({ liveId, bundleGen, buckets, capturedAt }) {
  return { revision: Number(bundleGen) || 0, contentHash: laneSceneContentHash(buckets) };
}

/** 描画側の受領証。C1 の domFingerprint(既存 laneDomSelfMeasure.js の測定結果)と組み合わせる。 */
export function buildRenderReceipt({ surface, revision, contentHash, domFingerprint, paintedAt }) {
  return { surface, revision, contentHash, domFingerprint, paintedAt };
}

/** ①のReceiptと会場のReceiptを突合し、1行のverdictを返す。 */
export function compareRenderReceipts(popReceipt, venueReceipt) {
  // revision一致 && contentHash一致 → { match: true, line: "scene r<rev> hash<hash> ①=会場 ✅" }
  // 不一致なら理由を1行で名指し(例: "①r1234≠会場r1230(2世代遅れ) 🔴")
}
```

### 2. `popup-entry.js`側の配線(publishLaneMirror周辺・6816行付近)

`buildSceneEnvelope`を呼び、鏡スナップショットに`revision`/`contentHash`を追加する。自分自身の`RenderReceipt`(surface:'pop')もあわせて算出し、既存のmin-gap(3秒)相乗りの書き込みに含める(新規write機会を増やさない)。

### 3. `venueBar.js`側の配線(paint後・4365行付近、C1測定と同じ同期フレーム)

`buildRenderReceipt({ surface: 'venue', ... })`を作り、`compareRenderReceipts`で①のReceiptと突合。結果の`line`を既存の`venueSeatsDiag`(または`publishVenueSeatsDiag`のseatsDiagObs)に1フィールド追加する形で載せる(新規storageキーは作らない)。

### 4. 状態速報へのpassthrough

新しいverdict行を`statusFastDiagLite`へ必ず通す(既存地雷: v0.1.1124でpassthrough漏れを一度踏んでいる)。wiring断言テストをセットで書くこと。

## 完了条件

1. `npm run verify:cc`が緑
2. `laneSceneEnvelope.js`の単体テスト(contentHashの決定性・revision不一致検知・境界値)がある
3. wiring断言テスト(状態速報にverdict行が実際に出ることの機械確認)がある
4. version bump 3点セット同期(AGENTS.md §12.5)
5. **実機確認**: 状態速報をコピペし、新しいverdict行(例: `scene r<rev> hash<hash> ①=会場 ✅`)が出ることを確認する。自動化不可(ユーザー手動)なので、⏳実機待ちとして1行残し、司令塔は別領域の作業に進んでよい。

## このハンドオフの後にすること(今回はやらない)

設計書E節の「移行計画まとめ」のとおり、このMVPを**2週間または実配信10回**実運用してから次を判断する:
- verdictがほぼ常に✅なら、構造改革は不要と正式に結論して終わり。
- 🔴が続き、原因が入力合成の分裂(fallback⇔鏡モード遷移)に帰着したら、設計書の「段階2」(`wrapTileEl`と席装飾ループを細らせる・既存メモリで合意済みの「後送」作業)に進む。
- ①POPの改造・ロビー撤去は行わない(設計書F節で不採用と結論済み)。

## 地雷(設計書G節から再掲・最低限)

- `contentHash`に`capturedAt`等の揺れるフィールドを混ぜない(v1022型の毎tick不一致再発地雷)。
- 新計器は`statusFastDiagLite`へのpassthroughを忘れない(v0.1.1124の既知地雷)。
- revisionは新規カウンタを作らず既存`bundleGen`を流用する。
- Receipt writeは既存min-gap(3秒)相乗り必須(hot path保護)。
- host/iframeには一切触れない(本MVPはDOM生成ロジックの話ではなく診断追加のみなので、そもそも抵触しない)。

## 実装は誰が

新規lib+2箇所の軽微な配線+テストという通常規模。`cursor-impl`または司令塔本体で直接実装してよい。委譲する場合は`council/_TEMPLATE-impl-prompt.md`を使い、この「スコープ」節をそのまま「やること」欄に転記する形で引き渡すこと。
