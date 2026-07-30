# 設計書 — 会場一致🔴(gift/ad段のDOM欠落+幾何差)の根治

- 設計: Fable(claude-fable-5サブエージェント) / 裏取り・統合: 司令塔(Claude Code) / 素材: 会議ハーネス(5モデル)
- 日付: 2026-07-14
- 位置づけ: `/council-fable` 3段構え(会議ハーネス→Fable設計→実装引き継ぎ)の手順2の産物

## 背景・実測値(状態速報より)

```
会場一致 🔴鏡(104s前) link18 gift3 ad3 konta0 tanu182
/ DOM≠ gift:可視2(データ3) ad:可視2(データ3)
/ 重複0 迷子0 / ①DOM=鏡
/ 幾何≠ gift:122×40px(①107×38px)
/ 未説明3(gift:DOM欠1, ad:DOM欠1, gift:幾何差)
```

- link/konta/tanu段は鏡と①DOMで完全一致(匿名・ロビー撤去とは無関係と確定済み)
- ①DOM=鏡(①ポップアップ自体は鏡データと一致)。問題は「鏡→会場」の経路

## 真因(実コード裏取り確定)

`src/lib/laneMirror.js` の `toMirrorCell`(81-94行目):
```js
function toMirrorCell(item) {
  const it = /** ... entry?: { userId?: unknown } ... */ (...);
  const displaySrc = String(it.displaySrc || '').trim();
  if (!displaySrc) return null;   // ← userIdの有無を見ずに即捨てている
  return { displaySrc, title, idLine, nameLine, userId: String(it.entry?.userId || '').trim() };
}
```

同ファイルの `restoreLaneMirrorBuckets`(159-182行目・v0.1.1112 B-1)は「displaySrc空+uid有り」を**正常なスリムセル**として`anonymousIdenticonDataUrl`で復元する設計が既にある。しかし書き手(`toMirrorCell`)がuserIdを見ずに即座に`null`を返すため、**読み手の復元ロジックに辿り着く前にセルが鏡から消える**。gift/ad段はdisplaySrc解決(広告主バッジ・ギフト送信者サムネのenrich)が他段より遅延・失敗しやすいため、このバグの影響を強く受ける。

会議(5モデル)は仮説1(displaySrc空フィルタによる脱落)+仮説3(幾何差)の組み合わせが最有力と収束。批判役の「仮説1と3は排他関係では」という指摘は、司令塔の裏取りで「userId有りケースまで書き手が排他的に消している」という一段深い真因により解消。

## 設計(Fable)

### A. 理想の状態
鏡の会員資格=「照合キー(uidまたはidLine|title複合)を持つこと」であり、「displaySrcが解決済みであること」ではない。①paintした5段の全セルは、照合キーがある限りdisplaySrc一時空でも鏡に載る。

### B. 統合アーキ
| 役割 | ファイル | 変更 |
|---|---|---|
| 書き手(真因) | `src/lib/laneMirror.js` `toMirrorCell`(81-94行)+`contentHash`(140行) | Patch 1+2b |
| 読み手(正しい・触らない) | 同ファイル `restoreLaneMirrorBuckets`(159-182行) | 変更ゼロ |
| 鏡の消費者(全員自動で恩恵) | venueBar.js/②受動/status-entry.js/live-view.js | 変更ゼロ(欠落セルが自動復活) |
| scene受領証の突合点 | `src/extension/venueBar.js` 4336行 | Patch 2a |
| 診断(正しい・甘くしない) | `src/lib/venueLaneParity.js` | 変更ゼロ(任意でPatch 3情報表示のみ) |

### C. 具体機構(差分)

**Patch 1(MVPの核)**: `src/lib/laneMirror.js` 81-94行 `toMirrorCell`
```js
function toMirrorCell(item) {
  const it = /** @type {{ displaySrc?: unknown, title?: unknown, meta?: { idLine?: unknown, nameLine?: unknown }, entry?: { userId?: unknown } }} */ (
    item && typeof item === 'object' ? item : {}
  );
  const displaySrc = String(it.displaySrc || '').trim();
  const title = String(it.title || '').trim();
  const idLine = String(it.meta?.idLine || '');
  const nameLine = String(it.meta?.nameLine || '');
  const userId = String(it.entry?.userId || '').trim();
  // 会場一致gift/ad根治: 鏡の会員資格=「照合キーを持つ」(venueLaneParityKeyと同じ定義:
  //   uid、無ければ idLine|title 複合)。displaySrcの有無は資格ではない——
  //   「displaySrc空+uid有り」は読み手B-1(restoreLaneMirrorBuckets・v0.1.1112)が
  //   identiconで復元する正常なスリムセル。ここで落とすとB-1に永遠に到達しない(旧バグ)。
  //   顔も素性も無いセルだけ従来どおり落とす(鏡に出せない)。
  const hasIdentity = userId !== '' || `${idLine.trim()}|${title}` !== '|';
  if (!displaySrc && !hasIdentity) return null;
  return { displaySrc, title, idLine, nameLine, userId };
}
```

**Patch 2a(scene受領証の偽🔴防止・MVPに必須)**: `src/extension/venueBar.js` 4336行
```js
// before: const popEnvelope = buildSceneEnvelope(lanePaintSnap);
// after:
const popEnvelope = buildSceneEnvelope({
  capturedAt: lanePaintSnap.capturedAt,
  ...restoreLaneMirrorBuckets(lanePaintSnap)
});
```
`restoreLaneMirrorBuckets`はvenueBar.js 165行で既にimport済み(新規import不要)。Patch 1でスリムセルが鏡に載ると、snapshot生値でhashを取ると復元後(会場が実際に描く中身)とバイトが変わり、scene行が恒常的に偽🔴化するため必須。

**Patch 2b(保存contentHashも正準形へ)**: `src/lib/laneMirror.js` 140行
```js
// before: contentHash: laneSceneContentHash(tiers)
// after:
contentHash: laneSceneContentHash(
  /** @type {any} */ (restoreLaneMirrorBuckets(/** @type {any} */ (tiers)))
)
```

### D. 偽陽性潰し
新しい閾値付き警告計器は作らない。既存計器(白円N・顔404=N・幾何≠・DOM≠)が「顔がおかしい」を既に数えており、新しい嘉否判定を足すとそれ自体が嘘の緑/赤の温床になる。任意でPatch 3として`venueLaneParity.js`に「スリムN」を**情報表示のみ(verdict不算入)**で追加可(6行程度)。

### E. MVP
**Patch 1 + Patch 2a を同一コミットで出す。** Patch 1単独出荷はscene行の偽🔴と引き換えになり「🔴が別の🔴に変わる」体験ループを招くため分割不可。Patch 2b/3は同コミット推奨だが無くてもMVPは成立。

### F. 捨てた案
- 仮説2(hidden制御の非対称): データ件数の欠落(可視2/データ3)を説明できない
- 仮説4(ロビー撤去の副作用): `toMirrorCell`はv0.1.1112から不変。ロビー撤去は無罪、既存バグを顕在化させただけ
- 読み手/会場側で補完: 書き手が消した情報は原理的に復元不可
- 診断側の緩和: fail-closed原則違反
- hash関数自体の正規化: 「会場が本当に違う顔を描いた」ケースまで✅になる嘘の緑

### G. 地雷と回避策(テスト追随・同一コミット必須)
1. `src/lib/laneMirror.test.js` 71-78行「displaySrc空は落とす」は仕様反転で赤になる→スリムセル/広告主セル/真に空のセルの3ケースに書き換え+round-tripテスト追加
2. `src/lib/venueLaneParity.wiring.test.js` 243行の`buildSceneEnvelope(lanePaintSnap)`正規表現はPatch 2aで赤→新呼び形に更新。venueBar.jsのimport行(180行)は変えない
3. hash等価の新テスト(スリムセル入りsnapで①=会場のhash一致を機械保証)
4. 容量ガード・cap・diff-skipは無変更。①側(popup-entry.js)は変更ゼロ
5. 検証はreality-checkerに委任。検証エージェント実行中はcommitしない([[reality-checker-stash-detaches-head-2026-07-07]])
