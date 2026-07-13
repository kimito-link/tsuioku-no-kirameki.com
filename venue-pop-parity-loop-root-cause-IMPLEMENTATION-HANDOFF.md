# 実装ハンドオフ — 会場=①一致ループ根治(MVP: C1 両端実DOM指紋)

このファイル1枚で着手できる。設計の背景・根本原因・却下案の理由は [venue-pop-parity-loop-root-cause-DESIGN.md](venue-pop-parity-loop-root-cause-DESIGN.md) 参照(設計=Fable/裏取り=司令塔、2026-07-13)。

## 実装状況（2026-07-14）

- ✅ C1のソース実装・単体/配線テスト完了（対象5ファイル93件）・`npm run typecheck`通過。
- ✅ version bump **v0.1.1134**（manifest / package / changelog 同期）。
- ✅ `verify:cc`・build・copy:ext・commit・push 完了（`d25fe994` → origin/master）。
- ⏳実機待ち: 拡張リロード＋watch F5後、状態速報の「会場一致」lineで`①DOM=鏡`/`幾何=一致`または具体的な🔴差分を確認する。
- フェーズ図: [docs/venue-pop-parity-loop-flow.html](docs/venue-pop-parity-loop-flow.html)

## 今回のスコープ(MVPのみ = C1)

設計書のB節にはC1〜C4の4コンポーネントがあるが、**今回実装するのはC1(両端実DOM指紋)のみ**。理由はE節参照(過去4回の偽陽性のうち最多型=見た目ズレの素通りを、最小変更で機械検知に変えられるため)。C2(供給一元化)・C3(見た目完了ゲート)・C4(退行リング)は後続タスクとして別途着手する。

## 前提として必ず読むこと

- [venue-pop-parity-loop-root-cause-DESIGN.md](venue-pop-parity-loop-root-cause-DESIGN.md) の「論点A」「論点B」(なぜ今までの実装が繰り返し失敗したかの原理)
- `src/lib/venueLaneParity.js`(既存のv3 Tri-Parity判定ロジック。C1はここに条件を追加するだけで、作り直さない)
- `src/lib/laneMirror.js`(鏡スキーマの正本)
- `src/lib/venueDomCensus.js`(会場側の実DOM計測の正本)

## 実装手順

### 1. 新規lib `src/lib/laneDomSelfMeasure.js`

①側(popup)が自分の実DOMを測る純関数。以下のシグネチャで:

```js
/**
 * @param {{ laneLink, laneGift, laneAd, laneKonta, laneTanu }} els 各段のlane要素(nullable)
 * @returns {{ measured: boolean, perTier: Record<string,{visible:number,tileW:number,tileH:number}>, dpr: number }}
 */
export function measureLaneDomSelf(els) { ... }
```

- 各段の`visible`は表示中(hidden=falseかつ非空)のタイル数。
- `tileW`/`tileH`は段の`firstElementChild`(`.nl-story-userlane-cell`)の`offsetWidth`/`offsetHeight`。段が0件なら0。
- `dpr`は`window.devicePixelRatio || 1`。
- 段が無い(null)場合は該当tierを`{visible:0, tileW:0, tileH:0}`とする。
- 全段とも要素が取れなければ`measured:false`。

### 2. `laneMirror.js`のスキーマに`domSelf`フィールドを追加

`LaneMirrorSnapshot`に以下を追加(既存フィールドの構造は変更しない):

```js
domSelf: {
  measured: true,
  perTier: { link: {visible, tileW, tileH}, gift: {...}, ad: {...}, konta: {...}, tanu: {...} },
  dpr: 1.25
}
```

### 3. `popup-entry.js`の`paintStoryUserLaneDomFilled`呼び出し直後〜`publishLaneMirror`の間で採取

`measureLaneDomSelf(els)`を呼び、結果を鏡スナップショットに`domSelf`として同梱する。**publishと同期フレームで採取すること**(TOCTOU防止。設計書の地雷3参照)。

### 4. `venueDomCensus.js`にタイル幾何(`tileW`/`tileH`)の採取を追加

会場側censusのperSectionに、各段先頭タイルの`offsetWidth`/`offsetHeight`を追加する(①側と同じ計測ロジックを共有できるなら`laneDomSelfMeasure.js`を会場側からも呼んでよい)。

### 5. `venueLaneParity.js`の✅条件を拡張

既存の判定ロジックに以下を追加(既存条件を削除・弱化しない。ANDで追加):

- `snap.domSelf.measured && 各段で domSelf.perTier[t].visible === census.perTier[t].pop相当`が一致しなければ🔴。reasonは`<tier>:①DOM<N>≠鏡<M>`形式(既存line様式を踏襲)。
- 幾何: `|venueTileW - popTileW| / popTileW <= 0.10`(dpr正規化後)。超過なら🔴。reasonは`<tier>:タイル<会場px>px(①<POPpx>px)`形式。ロビータイルも同じ判定対象に含める。
- `domSelf`が欠落(旧鏡・未対応バージョン)の場合は⚪「①DOM未計測」とし、既存のfail-closedパターンを踏襲する(✅を名乗らせない)。

### 6. 配線忘れ防止テスト

`venueLaneParity.wiring.test.js`に「鏡に`domSelf`が実在し、parityの判定コードがそれを参照している」ことを断言するテストを追加する(既存のwiringテストの様式を踏襲)。

## 完了条件

1. `npm run verify:cc`が緑
2. `laneDomSelfMeasure.js`の単体テストがある(全段0件・一部段のみ・dpr差のケースを含む)
3. `venueLaneParity.js`の新条件に対するテスト(幾何一致/不一致/domSelf欠落の3パターン)がある
4. `venueLaneParity.wiring.test.js`の配線忘れ防止テストが追加され、パスする
5. version bump 3点セット同期(AGENTS.md §12.5)
6. **実機確認**: 会場を開いて状態速報をコピペし、「会場一致」lineに新しい判定(幾何ズレがあれば🔴・無ければ✅)が反映されていることを確認する。これは自動化不可(ユーザー手動)なので、⏳実機待ちとしてこのハンドオフに1行残し、司令塔は別領域の作業に進んでよい([[bug-investigation-delegation-design-2026-07-13]]のAGENTS.md §12.9運用ルール参照)。

## 地雷(設計書G節から再掲・最低限)

- `statusFastDiagLite`への新計器passthroughは今回のMVP(C1)には該当しない(C4のリング機能の話)。ただし将来C4を実装する際は必須。
- diff-skipのkey(`storyLaneTierBodyKey`等)には幾何を絶対に混ぜない(churn再発の地雷)。幾何測定はcensus/domSelf側でのみ行う。
- domSelf採取はpublishと同期フレームで行い、毎paintでは呼ばない(hot path保護)。
- host/iframeには一切触れない。C1は読み取り計器のみ(DOM measureのみ・書き込みなし)。
- グリッド列数(perRow)は比較対象に含めない(会場は全画面レイアウトで列数が違うのが現仕様)。比較はタイル寸法のみ。

## 後続タスク(このハンドオフの対象外・別途着手)

- C2(供給一元化): `venueBar.js`のfallback経路を「①同期待ち+ロビーのみ」に縮小し、`venueLaneBuckets.js`の旧式残滓を削除する。
- C3(見た目完了ゲート): `.claude/agents/codex-impl.md`/`cursor-impl.md`の完了ゲート節に「会場一致line添付必須」を追記し、`AGENTS.md §12.5`に実機チェックリスト定型を追加する。
- C4(退行リング): 新lib`venueParityHistory.js`でverdictの直近1時間リングバッファを作り、`statusFastDiagLite`にpassthroughする。

## 実装は誰が

C1は`src/lib/`内の新規lib+既存libへの条件追加+テストという通常のリファクタ/実装規模。次チャットで`cursor-impl`(複数ファイル横断の局所実装)に委譲するか、司令塔本体で直接実装してもよい。委譲する場合は`council/_TEMPLATE-impl-prompt.md`(前回セッションで作成済み)を使い、このハンドオフの「実装手順」節をそのまま「やること」欄に転記する形で引き渡すこと。
