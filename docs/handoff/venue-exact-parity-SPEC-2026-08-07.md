# venue-exact-parity-SPEC-2026-08-07.md — 「会場=①POP 完全一致」実装仕様

> 設計=Fable / 2026-08-07
> 地図: リポ直下 `venue-parity-structural-MAP.md`（★末尾【追補・2026-08-07】が最新の事実。A-10=席資格とjoinの法の食い違い含む）
> 前作: リポ直下 `venue-parity-structural-SPEC.md`（v0.1.1280 で実装済み。本仕様は**置き換えではなく前進**——
> 契約モジュール・読み口の関所・登録簿CIは出荷済みの土台としてそのまま使う）
>
> 出荷済みの土台（本仕様が前提とするもの・実コードで確認済み）:
> - 契約モジュール `src/lib/laneMirrorContract.js`（登録簿+sanitize関所）
> - 関所の受け入れ2箇所: venueBar.js:5722（catch-up）/ :6052（onChanged）、`acceptLaneMirrorSnapshot`＝venueBar.js:2879
> - 実書き手round-tripテスト: `laneMirrorContract.test.js:141-193`（buildLaneMirrorSnapshot 実出力を関所に通す）
> - stale表示 `venueMirrorAgeNotice`（venueLaneMirrorSupply.js:199-207・配線=venueBar.js:5048-5062）
> - fallback時gift空文言（venueBar.js:5091-5093）
> - 鏡publishの描画前移動（popup-entry.js:6963-6970・v0.1.1281）

---

## 0. ユーザー確定事項（動かせない前提）

1. **母集団は①基準で全員出す**。幾何(行×列)で溢れる分はスクロール/縮小/ページングで見せる。
2. **スコープは完全一致に絞る**。鏡の陳腐化の根本解・匿名混入の発生源・サイドパネル設定UIは別案件。
3. 会場=応援レーン=別窓は「見た目もそっくり同じ(並び・レイアウトまで)」（[[venue-equals-lane-same-layout]]）。

---

## 1. Problem Statement — なぜ「一致した」と言えないのか

MAP追補 A-4 が実コードで確定させた事実（3点とも司令塔検証済み）:

| # | 嘘の緑 | 根拠 |
|---|---|---|
| C1 | `venueReceipt.revision` に `popEnvelope.revision` を**自己代入**＝revision比較は恒真 | venueBar.js:5318 |
| C2 | pop/venue 両receiptの contentHash が**同じ鏡オブジェクト起点**＝X と copy(X) の比較 | venueBar.js:5306-5320 |
| C3 | ①が snapshot に焼いた `contentHash` を**誰も読まない**。`domFingerprint` は型定義のみ未配線 | laneMirror.js:190-193 / laneSceneEnvelope.js:74（読み手grep=laneSceneEnvelope自身とテストのみ・確認済み） |

さらに `①DOM=鏡` 判定（venueLaneParity.js:257-271）は**件数しか**見ない
（`domSelf` は visible/tileW/tileH のみ・laneMirror.js:11）→ **別人を同人数描いても ✅**。

つまり現状の ✅ は「①のDOM」を一度も起点に持たない。①が0件描画でも鏡さえ残れば緑が出る。
C1〜C3 は全て同型＝**比較の両辺が同じ起点**。これを構造的に作れなくするのが本仕様の本丸。

### 本仕様が使う決定的な既存資産（★新発見・司令塔裏取り済み）

**タイルの実DOMには既に「照合キー」が刻まれている。**

- `src/extension/story/renderStoryUserLaneDom.js:400` — `tileEl.dataset.userKey = venueLaneParityKey(p)`
- この renderer は①と会場で**共有**（venueBar.js:5067 が同じ `paintStoryUserLaneDomFilled` を呼ぶ）
- ①側の実DOM採取 `measureLaneDomSelf`（laneDomSelfMeasure.js:77-93）と会場側の census
  `collectVenueLaneDomCensus`（venueDomCensus.js:85-99・**keys列を既に収集**:97-98）は
  **同一の走査規則**（visibleTilesOf ⇔ countSection、v0.1.1241 で一字一句そろえた実績）
- 鏡側のキー列 `laneMirrorTierKeySequences`（venueLaneParity.js:76-84）も同じ `venueLaneParityKey`

→ **①実DOM・鏡・会場実DOM の3起点すべてが同一のキーアルファベット（`u:uid` / `c:idLine|title`）で
読める**。新しい鍵を発明せずに「実DOM起点の受領証」が作れる。これが本仕様の実装原理。

---

## 2. Q-A: 「完全一致」の定義（これを先に固定する）

### 定義（normative・4層）

**「会場=①完全一致」とは、同一の鏡世代について次の E-1〜E-4 がすべて成立すること。**

| 層 | 内容 | 判定の両辺（★起点が違うことが要件） |
|---|---|---|
| **E-1 顔ぶれ列** | 5段それぞれの**キー列**（`venueLaneParityKey`）が集合・順序・件数まで同一 | ①の実DOM指紋 ⇄ 会場の実DOM指紋（§3の domFingerprint） |
| **E-2 世代** | 会場が描いたのは①が publish した**最新の受理済み世代**である | 最新受理snapの capturedAt ⇄ 会場が実際に描いた snap の capturedAt |
| **E-3 内容** | 会場が描いた中身は①が焼いた内容と同一である | ①焼き付けの `snap.contentHash` ⇄ 会場が painted buckets から**再計算**した hash |
| **E-4 鮮度** | 鏡age ≤ SOFT(180s) | 既存（venueLaneParity.js:158）・変更しない |

### 定義に**含めない**もの（明示）

- **行×列・スクロール位置・ページ割**: 母集団を①基準で全員出す以上、会場の幾何(段の折り返し)は
  ①と異なってよい。溢れは既存のスクロール（venueBar.js:5332-5335 の pan 判定）で見せる。
  幾何の一致対象は従来どおり**タイル寸法のみ**（物理px 10%許容・同一人物測定時のみ＝
  venueLaneParity.js:38,308-331 の既存判定を変えない）。
- **席（.nlsb-seat）の顔ぶれ**: 席は会場内部の装飾レイヤであり①に対応物が無い。§5（Q-C）で扱う。
- **件数ラベルの数値定義**（①「応援165件」vs 会場の件数表示）: 意味が違う数字の統一は Phase 4。
  ★前SPECの「段に表示中N人」改名は**未出荷**（grep で「段に表示中」0件・確認済み）→ 第2段に繰り越す。

### なぜこの定義か

- E-1 を「データ同士」でなく「実DOM同士」にするのは、C1〜C3 の教訓「比較の両辺が同じ起点なら恒真」
  の反転。①のDOMと会場のDOMは**物理的に別のドキュメント**であり、これ以上独立な起点は存在しない。
- E-2/E-3 を分けるのは、「古い世代を描いている」（陳腐化・説明可能）と「同じ世代なのに中身が違う」
  （バグ・未説明）を状態速報の1行で区別するため（[[instrument-must-name-the-cause-2026-08-01]]）。
- 状態速報上の読み方: **「会場一致 ✅」と「scene … 指紋①=会場 ✅」が同時に立って初めて完全一致**。
  どちらか一方の緑は完全一致を意味しない（この読み方自体を契約コメントに明記する→§8 M8）。

---

## 3. Q-B: 嘘の緑の潰し方 — 実DOM起点の受領証（MVPの中核）

### 3-1. domFingerprint の実体（新規純関数）

`src/lib/laneSceneEnvelope.js` に追加:

```js
/**
 * 段別キー列の指紋。①実DOM(laneDomSelfMeasure)・会場実DOM(venueDomCensus.keys)・
 * 鏡(laneMirrorTierKeySequences)の3起点が同じ canonical 形でhash化できる。
 * 空キーは除外(dataset.userKey='' の無鍵タイルは unkeyed 計数の縄張り)。順序は保存する。
 * @param {Partial<Record<'link'|'gift'|'ad'|'konta'|'tanu', string[]>>} perTierKeys
 * @returns {string} 8桁hex(djb2・laneSceneContentHashと同系)
 */
export function laneDomFingerprint(perTierKeys) { /* `tier:key,key;...` を djb2Hex */ }
```

- canonical 形は `laneSceneContentHash`（laneSceneEnvelope.js:33-48）と同じ流儀（段順固定・区切り固定）。
- **hash だけを保存し、キー列そのものは storage に出さない**。理由: (i) 512KB フェイルセーフ
  （laneMirror.js:45）は段capの半減で守っており domSelf の膨張は守備範囲外、(ii) census の
  JSDoc が既に「keys は storage へ出さない=PII/容量」と定めている（venueDomCensus.js:20）。
  キー列500人分(~12KB)を snapshot に足す案は**却下**（§10 却下B）。

### 3-2. ①側: 指紋の採取と運搬

**変更ファイル**: `src/lib/laneDomSelfMeasure.js` / `src/extension/popup-entry.js` / `src/lib/laneMirror.js`

1. `measureLane`（laneDomSelfMeasure.js:54-67）が可視タイル列の `dataset.userKey` を配列で返す
   （`keys: string[]` を追加。走査は既存の visibleTilesOf 1回のまま・追加のDOMクエリなし）。
2. popup-entry.js の paint 完了点（:7067 `_laneDomSelfLast = laneDomSelf`）で控える値を拡張:

```js
_laneDomSelfLast = {
  ...laneDomSelf,                       // measured / perTier(visible,tileW,tileH,tileKey) / dpr
  measuredAt: Date.now(),               // 診断表示用(§6)
  fingerprint: laneDomFingerprint(perTierKeysOf(laneDomSelf)),  // ①実DOMの指紋
  fingerprintFor: _lastPublishedLaneMirrorHash                  // ★この指紋が「どの内容」を測ったか
};
```

3. `publishLaneMirror`（popup-entry.js:7537-7556）が `buildLaneMirrorSnapshot` の戻り値から
   `_lastPublishedLaneMirrorHash = snap.contentHash` を控える（1行追加）。
   publish は paint より**前**（v0.1.1281）なので、同 tick の paint が測る DOM は
   この hash の内容そのもの＝`fingerprintFor` は「指紋の内容アドレス」になる。
4. `normalizeDomSelf`（laneMirror.js:54-74）が `measuredAt` / `fingerprint` / `fingerprintFor` を
   **素通しで保存**する（現在は measured/perTier/dpr だけ再構築して**他を落とす**実装なので、
   3フィールドの明示的な引き継ぎを足す。perTier の `keys` は**保存しない**＝3-1の方針）。
   snapshot書式は additive-only＝旧読者は壊れない（sanitize は spread 素通し・laneMirrorContract.js:170-176）。

**★fingerprintFor が Q-D の大半を同時に解決する**（§6 で詳述）: 会場は
`snap.domSelf.fingerprintFor === snap.contentHash` のときだけ指紋を硬く比較する。
publish(先)→paint(後) の1tickずれで snapshot N が「N-1 paint の指紋」を運んでも、
中身が変わっていなければ hash が一致して比較でき、変わっていれば**時計に頼らず**自動的に
「旧内容の指紋」と分かって ⚪ に落ちる（fail-closed・偽🔴を構造的に排除）。

### 3-3. 会場側: 受領証の組み立てを純関数へ抽出（C1を構造的に再発不能にする）

**新規純関数** `buildVenueSceneReceipts`（`src/lib/laneSceneEnvelope.js` に追加）:

```js
/**
 * ①と会場の受領証を【3つの独立起点】から組み立てる。venueBar.js:5300-5324 の
 * インライン組み立て(C1自己代入の温床)を置き換える。
 * @param {{
 *   acceptedSnap: object|null,   // 最新の受理済み鏡(laneMirrorSnap) = ①側の主張
 *   paintedSnap: object|null,    // 会場が実際に描いた鏡(lanePaintSnap)
 *   paintedBuckets: object,      // 会場が実際に paint に使った laneBuckets
 *   venueDomFingerprint: string  // 会場実DOM census keys から laneDomFingerprint した値
 * }} input
 * @returns {{ popReceipt, venueReceipt }|null}  // どちらか欠けたら null(=scene 未計測)
 */
```

| フィールド | popReceipt（①側） | venueReceipt（会場側） |
|---|---|---|
| revision | `acceptedSnap.capturedAt` | `paintedSnap.capturedAt` ← **C1修正**: 起点が別変数になり、自己代入は関数シグネチャ上作れない |
| contentHash | `acceptedSnap.contentHash`（①が焼いた値を**初めて読む**＝**C3修正**） | `laneSceneContentHash(paintedBuckets)`（会場側の**再計算**＝**C2修正**） |
| domFingerprint | `acceptedSnap.domSelf.fingerprintFor === acceptedSnap.contentHash` のとき `acceptedSnap.domSelf.fingerprint`、それ以外 `''` | `venueDomFingerprint`（census keys 由来） |

`compareRenderReceipts`（laneSceneEnvelope.js:85-106）の拡張:

- revision不一致 → 既存どおり 🔴`遅れ/先行`（今度は**本当に検出できる**）
- contentHash不一致 → 既存どおり 🔴
- **新規**: 両方の domFingerprint が非空で不一致 → `scene r… 指紋①xxxx≠会場yyyy 🔴`
- **新規**: どちらかの domFingerprint が空 → `scene r… 指紋未計測 ⚪`（**match:false**）。
  ★これにより「DOMを写さない✅」は今後**構造的に出ない**（旧版snapshot・fingerprintFor不一致時は
  緑でなく⚪になる。fail-closedの既存原則=venueLaneParity.js:367-369 と同じ思想）。

**venueBar.js の変更**（:5300-5324 を置換）:

```js
sceneReceiptDiag = lanePaintSnap
  ? compareRenderReceipts(...Object.values(buildVenueSceneReceipts({
      acceptedSnap: laneMirrorSnap,
      paintedSnap: lanePaintSnap,
      paintedBuckets: laneBuckets,
      venueDomFingerprint: _venueDomFingerprintLast   // ↓で採取
    }) ?? {}))
  : null;
```

会場指紋の採取: diagDue ブロック（venueBar.js:5231-5272）で census の生値（perSection[].keys）から
`laneDomFingerprint` を計算して `_venueDomFingerprintLast` に控える。census は**既に**キー列を集めて
おり（venueDomCensus.js:97-98）、summarize（`venueDomCensusToParityDom`）へ渡す**前**の生値を
1変数受けするだけ＝追加のDOM走査ゼロ。

### 3-4. 何と一致し、何を検出するか（検出表）

| 症状 | どの行が名指しするか |
|---|---|
| 会場が古い世代を描いている | scene 🔴 revision差（Nms遅れ）＝陳腐化。鏡age表示（既存）と整合 |
| 同世代なのに中身が違う（compose/restore で値落ち等） | scene 🔴 contentHash差 |
| データは同じなのに**画面の顔ぶれ**が違う（diff-skip消し残り・描画バグ） | scene 🔴 指紋差 |
| ①が publish と違うものを描いた（書き手の嘘） | Phase 2（§9・①指紋⇄鏡キー列hashの突合。MVPでは scene 指紋差として現れる） |
| sanitize が①の契約違反セルを落とした | 既存 `鏡除外N`（venueBar.js:5291-5296）+ scene 🔴 contentHash差（①焼き付け hash は落とす前の値のため）。**これは嘘の赤ではなく書き手違反の名指し**（前SPEC Q6 の設計意図どおり）と契約コメントに明記 |

---

## 4. 段階0（shadow計器）を置くか — **置かない**（判断と根拠）

診断先行はこのリポの実績ある型だが、[[instrument-spiral-25-versions-2026-08-06]]（計器を2版続けて
入れたら止まる）と前SPECの裁定（「本仕様の新規要素は強制とテストであり観測ではない」）を引き継ぐ。

- 本仕様の新規要素は**既存の観測1行（scene行）の中身を本物にする**ことであり、新しい観測系統ではない。
- 偽🔴の主リスク（①指紋が旧内容を測っている）は fingerprintFor の内容アドレスで**構造的に**⚪へ
  逃がしてある（時計比較でなく hash 等値＝レースの入り込む余地がない）。
- 残るリスク（canonical 形の食い違い等）はテスト（§7 T-1/T-4: 3起点を実コードで貫通させる）で
  出荷前に潰す。出荷後は reality-checker が実配信の状態速報コピペ1枚で判定する（§7 末尾）。
- **反対意見**（記録する）: 「css-default / observer の教訓のように計器自体が壊れて偽値を出す
  事例が続いた直後なので、1版だけ shadow（verdict へ影響させず line にのみ併記）を挟むべき」。
  → 採らない理由: scene 行はもともと独立診断であり verdict（会場一致行）へ影響しない設計
  （venueBar.js:5297-5299 のコメント・laneSceneEnvelope.js:5-7）。つまり**scene 行は最初から
  shadow 相当の位置づけ**で、ユーザー向けUIを変えない。これ以上の段階分けは版数を増やすだけ。

---

## 5. Q-C: 二重ソース（席 vs 段）をどう畳むか

### 事実（MAP A-3 / A-10・司令塔裏取り済み）

- 席資格の正本 `venueParticipantKey`（venueSeats.js:103-117）は**2段構え**: `u:${uid}`、無ければ
  識別可能な名前で `n:${name}`。
- 鏡↔席の橋渡し `venueSeatIndexByUid`（venueLaneMirrorSupply.js:166-177）は **uid のみ**。
- → 「名前で座れる人」は鏡経路では席と結びつかず、`_venueSeatIndex=-1` の**生タイル**として段に出る
  （composeVenueLaneBuckets:151 / wrapTileEl 素通し=venueBar.js:5094-5105）。
- 席は `VENUE_FULLSCREEN_MAX_SEATS = 500`・超過は「スクロールではなく入れ替え制」（venueSeats.js:24,41）。

### 決定: **段が正本・席は装飾。join は uid のみを契約として明文化し、席なしを「説明済み」にする**

1. **完全一致（§2）の判定対象は段タイルのみ**。席ラップの有無は E-1〜E-4 に影響しない
   （census/measureLaneDomSelf の走査は生タイルも席内タイルも同じ規則で数える＝既に対応済み・
   laneDomSelfMeasure.js:37-51）。
2. `venueSeatIndexByUid` の **uid-only join を契約として JSDoc に成文化**する（venueLaneMirrorSupply.js）:
   「鏡セルが席を得る条件は uid 一致のみ。uid 無し/名前のみのセルは席なし生タイルで段に出る（正常）」。
3. **席なし件数を既存 diag に1数値で載せる**: renderSeats の既存ループ（venueBar.js:5133-5136 で
   `_venueSeatIndex < 0` を既に判定している）で数え、`seatsDiagObs.unseated` として
   venueSeatsDiag に併記（`anonExcluded` の前例=venueBar.js:5381 と同型・新規観測系統ではない）。
   → A-2 実測の「段img 19 − 席16 = 3」が今後は**名前付きの説明済み差分**になる。

### 母集団①基準・全員表示との整合（衝突しないことの明示）

- 段タイルは席に**依存しない**ため、①が500人を超えても段は全員描ける（席だけが入れ替え制で不足する。
  席不足は装飾の欠けであり顔ぶれの欠けではない＝unseated が数える）。
- 鏡は cap 撤廃済み（v0.1.1234・laneMirrorCapFromBuckets=laneMirror.js:149-156）、①も上限撤廃済み
  （v0.1.1232）。＝「母集団①基準で全員」はデータ経路上すでに成立しており、本仕様で新たに触る箇所はない。
- fallback 経路の母集団だけは席由来で500上限だが、fallback は定義上①一致を主張しない（⚪固定・
  venueLaneParity.js:358-360）ので完全一致スコープ外。

### 却下した案: join を席資格と同じ2段（uid→名前）に広げる

コーディネータ提案の第一候補だったが**MVPでは却下、Phase 3 で裁定**とする。理由:

1. **アルファベットが3種ある**: 席の第2鍵は `n:${roster生name}`、パリティ鍵の第2鍵は
   `c:${idLine}|${title}`（venueLaneParity.js:61-69）、鏡セルの title は表示名（enrich後）。
   名前正規化の差で**別人ラップ**（席の乗っ取り）が起きうる。誤ラップは「同じ人=同じ席」の
   安定契約（venueSeats.js:25）を壊し、ちらつき（席の顔入れ替わり）として現れる＝
   完全一致スコープの外で新しい実害を作るリスク。
2. 席は①に対応物の無い会場独自レイヤであり、完全一致の定義（§2）に入らない。**スコープ確定事項2**
   （完全一致に絞る）に従い、装飾の充実は別裁定へ。
3. 名前ベースの同定は [[user-identity-unification-design-2026-07-17]]（ID解決一元化）の縄張り。
   場当たりの name-join を先に入れると一元化と二重実装になる。

---

## 6. Q-D: `domSelf` の鮮度 — 時計でなく内容アドレスで守る

### 事実

- `_laneDomSelfLast` の更新は popup-entry.js:7067 の1箇所のみ。手前に早期return 4本
  （:6979 sig一致 / :7006 縮小ガード / :7012 空keep / :7018 空）。
- v0.1.1281 は publish を描画前に移したが domSelf は**持ち回し**（意図的・:6955-6961 のコメント
  「スキップ=DOM不変=寸法も不変」）。この理屈は**中身が変わらない限り**正しい。

### 決定（3点）

1. **指紋の鮮度 = fingerprintFor（内容アドレス）で判定**（§3-2）。`fingerprintFor !== snap.contentHash`
   なら指紋は「旧内容のもの」→ popReceipt.domFingerprint='' → scene ⚪（指紋未計測）。
   時刻の閾値は使わない。理由: sig一致スキップが何分続いても DOM が不変なら指紋は**古くて正しい**。
   時計で切ると正しい値を捨て、切らないと嘘を通す——内容アドレスならどちらの誤りも起きない。
2. **`measuredAt` は診断表示専用**として snapshot に載せる（§3-2）。venueLaneParity の line に
   `①DOM齢Ns`（capturedAt−measuredAt が SOFT 超のときだけ）を併記。verdict には**影響させない**
   （寸法は sig 不変なら古くても正しい・上記1と同じ理屈。件数/寸法比較の既存ロジックは不変）。
3. **リサイズだけは内容アドレスで検出できない**（DOM不変のまま寸法が変わる唯一の経路）。
   popup-entry.js に resize リスナー1本を追加し、発火時に `_laneDomSelfLast = null` にする
   （次の実 paint まで domSelf 未計測として publish → 会場は ①DOM未計測 ⚪ = fail-closed）。
   `measured:false` への明示的降格であり、嘘の緑（古い寸法での幾何✅）を塞ぐ。
   ★①パネルを閉じた場合は publish 自体が止まる→既存の鏡age（SOFT/HARD）が守る。ここは触らない。

---

## 7. Q-E: ①基準で全員出すときの重さ — 予算表と規律

過去の実害: paint毎DOM走査で拡張全体が重くなった v0.1.1201（[[重大な反省]]）、jsonBlob fanout
（robust-architecture）。本仕様の追加コストを列挙し、各々の上限を仕様として固定する:

| 追加処理 | 頻度 | コスト | 規律 |
|---|---|---|---|
| ①側 keys 収集 | paint 時のみ（skip時ゼロ） | 既存 querySelectorAll 走査**1回の中**で dataset 読みを足すだけ。追加のDOMクエリ・layout強制なし | measureLaneDomSelf 内で完結。paint外で呼ばない |
| ①側 fingerprint hash | paint 時のみ | ~500人×~24字 ≈ 12KB文字列の djb2 1回（sub-ms） | 同上 |
| 会場側 fingerprint | **diagDue（3秒min-gap）のみ** | census が既に集めた keys 配列の join+djb2 | 毎paint禁止（既存 diagDue 規律=venueBar.js:5218-5223 に相乗り） |
| snapshot 増分 | publish 毎 | +約30byte（hash 8hex×2 + measuredAt）。**keys列は載せない** | 512KBフェイルセーフ非干渉 |
| unseated 計数 | paint 時 | 既存ループ内の分岐カウント +1 | 新規ループ禁止 |
| 受領証組み立て | diagDue のみ | 純関数呼び出し（laneSceneContentHash は既存コストと同じ） | — |

**描画そのもの（paint 経路・diff-skip・rAF合流・SOFT/HARD・fallback降格）には1バイトも触らない。**
全員表示の描画量自体は既に v0.1.1232/1234 で出荷済みの現実であり、本仕様は観測の正確化のみを足す。

---

## 8. MVP（1回のPRで安全に出す範囲）— 実装チェックリスト

> version bump: 1変更=patch 1つ（§12.5）。本MVPは「会場一致判定の実DOM起点化」という1つの意味の
> 変更なので **patch 1つ**（実装時の最新+1・changelog summary 35字以内・`npm run verify:bump`）。
> 出荷ゲートは `npm run verify:cc` 一本。push後はユーザー反映3手順（pull→拡張リロード→watchタブF5）併記。

- **M1** `src/lib/laneSceneEnvelope.js`: `laneDomFingerprint()` / `buildVenueSceneReceipts()` 追加、
  `compareRenderReceipts()` に指紋分岐+指紋未計測⚪を追加（§3-1/3-3）。
  ★実装前に `compareRenderReceipts` の全呼び出し元を grep し、venueBar 以外の呼び手が居れば
  match:false 化の影響を確認すること（司令塔 grep では venueBar とテストのみだが**要再確認**）。
- **M2** `src/lib/laneDomSelfMeasure.js`: perTier に `keys: string[]` 追加（走査追加なし）。
- **M3** `src/extension/popup-entry.js`: `_lastPublishedLaneMirrorHash` の控え（publishLaneMirror 内1行）、
  `_laneDomSelfLast` の拡張（measuredAt/fingerprint/fingerprintFor）、resize リスナー（§6-3）。
- **M4** `src/lib/laneMirror.js`: `normalizeDomSelf` が新3フィールドを保存（keysは保存しない）。
  typedef（:10-14）更新。
- **M5** `src/extension/venueBar.js`: census 生値から `_venueDomFingerprintLast` 採取（diagDue内）、
  受領証組み立てを `buildVenueSceneReceipts` へ置換（:5300-5324）、`seatsDiagObs.unseated` 追加。
- **M6** `src/lib/venueLaneParity.js`: line に `①DOM齢Ns` 併記のみ（verdict不変・§6-2）。
- **M7** テスト（§9）。
- **M8** 契約コメント更新: `laneMirrorContract.js` に「domSelf の指紋契約（fingerprint/fingerprintFor
  の意味・keys非保存）」「完全一致の読み方=会場一致✅∧scene指紋✅」を追記。
  `venueSeatIndexByUid` の uid-only join 成文化（§5-2）。
- **M9** 新 lib 追加は無し（既存ファイルへの追加のみ）だが、`npm run tree-map` / `feature-map` の
  差分が出たら再生成をコミットに含める（[[verify-cc-lint-catches-unwired-import-2026-07-07]]）。

### 変更しないもの（明示・地図6章の「壊れうる箇所」対応）

SOFT/HARD の値と二段窓 / staleButUsable のC2ちらつき防止（venueBar.js:5451-5459）/
fallback の gift/ad 空配列（venueLaneBuckets.js:173）/ 鏡cap撤廃 / INLINE_PASSIVE の不可侵
（popup-entry.js:7519,7538）/ composeVenueLaneBuckets の復元ロジック / 書き込みペイロードの既存フィールド /
diff-skip 機構（sig・WeakMap局所skip）/ paintStoryUserLaneDomFilled 本体。

---

## 9. Q-F: CIガード — 「grep も手作りフィクスチャも通してしまった」への回答

v0.1.1280 の教訓: **(a)** grep wiring テストは「関所を通している」ことは断言できても「関所が正しい形を
読んでいる」ことは断言できない。**(b)** 手作りフィクスチャは実装者の誤解（snap.buckets）をフィクスチャ
側にも複製するので共倒れで緑になる。→ 原則: **テストの生産者は本番の書き手・消費者は本番の読み手。
両辺に本物を置き、フィクスチャは境界値の注入にだけ使う。**

### T-1（★最重要・3起点貫通テスト）`src/lib/laneSceneEnvelope.fingerprint.test.js`

実DOMを含む3起点がすべて**本物のコード**で同じ指紋に到達することを断言する:

1. 実 buckets → `buildLaneMirrorSnapshot`（本物の書き手）→ `sanitizeLaneMirrorForRead`（本物の関所）→
   `restoreLaneMirrorBuckets` → **happy-dom 上で `paintStoryUserLaneDomFilled`**（本物のrenderer・
   ①と会場の共有実体）で実DOMを作る。
2. その実DOMを `measureLaneDomSelf`（①の採取器）と `collectVenueLaneDomCensus`（会場の採取器）の
   **両方**で読み、`laneDomFingerprint` がどちらも同じ値になることを断言（=①採取器と会場採取器の
   走査規則が乖離したら赤）。
3. さらに `laneMirrorTierKeySequences(snap)` 由来の指紋とも一致することを断言
   （=renderer の `dataset.userKey = venueLaneParityKey(p)`（renderStoryUserLaneDom.js:400）が
   別の鍵に変わったら赤）。
- ★happy-dom で renderer が動かせない場合の代替（実装時判断）: 2 を census 側だけにし、①側は
  「`dataset.userKey` 代入式が `venueLaneParityKey(` を無条件文で使う」ことをアンカー付きregex+
  **件数 toBe(1)** で固定した wiring テストに落とす（弱い代替であることをテスト内コメントに明記）。

### T-2（C1恒真の恒久檻）`src/lib/laneSceneEnvelope.receipts.test.js`

`buildVenueSceneReceipts` に **capturedAt の異なる2つの実snapshot**（buildLaneMirrorSnapshot を
nowMs 違いで2回呼ぶ）を acceptedSnap / paintedSnap として渡し:

- `popReceipt.revision === acceptedSnap.capturedAt` **かつ** `venueReceipt.revision === paintedSnap.capturedAt`
  を**別の値で**断言（自己代入の変異はここで必ず赤=恒真の再発を型で殺す）。
- `compareRenderReceipts` が revision差を 🔴 で報じることを断言。
- contentHash: paintedBuckets を1セル改変して 🔴、同一で ✅ 前段通過を断言。
- 指紋: 両方非空で不一致→🔴 / 片方空→⚪（match:false）/ 両方一致→✅ を断言。
  ★「指紋が無いのに✅」の変異（空文字ペアで match:true にする改変）が赤になることを確認。

### T-3（fingerprintFor ゲート）同上ファイル内

- `domSelf.fingerprintFor !== snap.contentHash` の実snapshotを与え、popReceipt.domFingerprint が
  `''` になる（=⚪へ逃げる）ことを断言。＝「1tick 遅れの指紋で偽🔴」の再発をテストが定義する。

### T-4（書き手→関所→復元→保存の round-trip 拡張）既存 `laneMirrorContract.test.js` へ追加

- 既存の実書き手 round-trip（:141-193）に「`domSelf.measuredAt/fingerprint/fingerprintFor` が
  build→sanitize→（venue受理相当）で落ちない」断言を追加（normalizeDomSelf が新フィールドを
  落とす退行=v0.1.1280 と同型の「個別列挙の作り直しで値が落ちる」類型の檻）。

### T-5（wiring・数の断言）`src/lib/venueLaneMirrorAccept.wiring.test.js` へ追加

- venueBar 中の `buildVenueSceneReceipts(` 呼び出しが**無条件文として1箇所**あること
  （アンカー: `lanePaintSnap` 分岐の近傍まで regex に含める・CRLF正規化・[[wiring-test-must-assert-counts-2026-08-04]]）。
- 旧インライン組み立ての残骸（`revision: popEnvelope.revision` を venueReceipt に渡す形）が
  **存在しない**ことの否定断言。

### 変異手順（全テスト共通・1セットの定義）

[[mutation-must-verify-it-applied-2026-08-06]]: 変異を入れたら**まず適用を証明**（置換件数を出力）→
赤を確認→戻す。最低限回す変異: (a) buildVenueSceneReceipts 内で venueReceipt.revision を
popReceipt.revision に自己代入 (b) laneDomFingerprint の段順をソート (c) normalizeDomSelf から
fingerprint 引き継ぎを削除 (d) compareRenderReceipts の指紋分岐に `if(false)` 前置。
すべて対応テストが赤になること。

### 実機確認（reality-checker へ委任・自己採点しない）

実配信1回・状態速報コピペ1枚で: (1) `scene r… 指紋①=会場 ✅` が出る（①開・鏡fresh時）
(2) ①を3分閉じる→scene が ⚪/🔴 に落ち鏡age表示と整合 (3) `unseated` が段img−席の差と一致
(4) 会場一致行の既存項目に退行がない。判定は状態速報のみ（[[feedback-trust-status-report-over-browser-check]]）。

---

## 10. 反対意見・トレードオフ・却下した案

| 案 | 却下/保留の理由 |
|---|---|
| **A. 会場が①のDOMを直接照合**（postMessage/相互観測） | ①(拡張ページ/SidePanel)と会場(content script)は別コンテキスト。相互照合チャネルの新設は受動ビュー不可侵・単一writer原則に第3の経路を足すことになり、契約をまた複雑にする。storage経由の指紋で情報量は同じ |
| **B. snapshot にキー列を丸ごと保存し hash でなく列で突合** | +12KB/publish が3秒毎。512KBフェイルセーフは段capしか守らない（laneMirror.js:196-203）ため domSelf 膨張は無防備。census の「keysはstorageに出さない」既定（venueDomCensus.js:20）にも逆行。不一致の**人名の名指し**は既存のparity層（欠/余サンプル）が既にやっており、指紋は「一致の証明」に徹する方が役割が明確 |
| **C. 指紋不一致を1版 shadow で観測してから verdict へ** | §4 に記載。scene行自体が独立診断＝最初からshadow相当。fingerprintFor ゲートで偽🔴を構造排除済み。版数を増やす方が [[instrument-spiral]] リスク |
| **D. 席 join を name まで広げる（2段join）** | §5 に記載。3種のアルファベット混在で別人ラップ→席安定契約を壊す。identity一元化（既存設計）の縄張り。Phase 3 で裁定 |
| **E. domSelf に時計閾値（measuredAt が古ければ捨てる）** | §6 に記載。sig不変スキップ中は「古くて正しい」ので、時計では正誤を判定できない。内容アドレス（fingerprintFor）が正しい判定器。measuredAt は表示のみ |
| **F. `①DOM=鏡` 判定（venueLaneParity.js:257-271）を今回 uid列比較へ強化** | scene 指紋（①DOM⇄会場DOM）が同じ穴（別人同数）を検出範囲に含むため、MVPでは重複投資。①が「publishと違うものを描く」書き手の嘘の名指しは Phase 2（下）で `①指紋⇄鏡キー列hash` として入れる方が変更面が小さい |
| **G. 母集団溢れをページングUIで見せる新実装** | 既存スクロール（pan）が既に機能しており、母集団は既にデータ経路で全員化済み。UI新設は完全一致スコープ外の投資 |

---

## 11. Out of Scope（フェーズ番号つき）

- **Phase 2 — 書き手の嘘の名指し**: `snap.domSelf.fingerprint ⇄ laneDomFingerprint(laneMirrorTierKeySequences(snap))`
  を buildVenueLaneParity に追加（fingerprintFor 一致かつ鏡除外0のときのみ硬判定）。
  「①がpublishと違うDOMを描いた」を①側の責任として名指しする。
- **Phase 2b — 件数ラベルの誠実化（前SPECからの繰り越し・未出荷確認済み）**: 会場の件数表示を
  「段に表示中 N人」へ。生成箇所の特定から（前SPEC 未解決3）。
- **Phase 3 — 席の name-join 裁定**（§5 却下D の再訪。identity一元化と合流）。
- **Phase 4 — 件数の意味統一**（①165件 vs 会場の数の定義そろえ）。
- **Phase 5 — 鏡の鮮度アーキテクチャ**（offscreen 化等・前SPEC Phase 2 のまま）。
- **別案件**: 匿名混入の発生源調査 / 診断ページ9.8秒 / 同一tick世代同期（前SPEC Phase 3）。

---

## 12. 事実と推測の分離・未読・assumption list

**事実（実コードで確認済み）**: §1 の C1〜C3 / dataset.userKey=venueLaneParityKey（renderStoryUserLaneDom.js:400）/
census の keys 収集（venueDomCensus.js:97-98）/ ①採取器と会場採取器の走査規則同一（laneDomSelfMeasure.js:25-51 の
v0.1.1241 コメント）/ venueSeatIndexByUid の uid-only / venueParticipantKey の2段 / 席500入れ替え制 /
「段に表示中」未出荷（grep 0件）/ 実書き手round-tripテストの存在（laneMirrorContract.test.js:141-193）/
現行 version 0.1.1283（package.json）。

**推測・未確認（実装時に必ず確認）**:

1. `compareRenderReceipts` の呼び出し元が venueBar とテストのみ、は司令塔grepの観測値。**実装時に再grep**。
2. happy-dom で `paintStoryUserLaneDomFilled` が動くか（T-1 の主経路）。動かなければ代替へ（T-1に明記）。
3. `venueDomCensusToParityDom` が keys を summarize で落とす前提で「生値受け」を設計したが、
   同関数の実装は**未読**。keys が summarize 後も残るなら受け方を簡略化してよい。
4. `buildVenueSeating` の内部・`docs/refactor-instructions.md`・`venue-parity-structural-IMPLEMENTATION-HANDOFF.md` は**未読**（本仕様の判断には使っていない）。
5. resize リスナー追加（M3）が SidePanel 環境で期待どおり発火するかは実機未検証（発火しなくても
   害は「従来どおり」に留まる=fail-safe 側）。
6. unseated を venueSeatsDiag に足すだけで状態速報に出るか＝statusFastDiagLite の passthrough 要否は
   [[fastdiag-lite-is-the-printer-subset]] に従い**実装時に wiring で確認**（前SPEC assumption 4 と同じ扱い）。

---

## 13. 実装担当への最後の注意（地雷の再掲）

1. sanitize・指紋計算を paint/renderSeats の毎回経路に入れない（diagDue/受け入れ点のみ。v0.1.1201 の轍）。
2. wiring テストは CRLF 正規化+アンカー+件数断言+変異の赤確認までが1セット。
3. verify系サブエージェント実行中に commit しない（[[reality-checker-stash-detaches-head-2026-07-07]]）。
4. `git add` は新規ファイル明示列挙（§12.5 の実事故）。
5. push しても Chrome には届かない＝ユーザー反映3手順（pull→拡張リロード→watchタブF5）を報告に1行併記。

---

## 14. 【司令塔の追検証・2026-08-07】採用可否の判定と補足

本仕様は司令塔（Claude）が中核主張を実コードで裏取りし、**採用可**と判断した。

### 14-1. 裏取りできた（仕様の前提は正しい）

| 主張 | 検証結果 |
|---|---|
| `tileEl.dataset.userKey = venueLaneParityKey(p)` を共有rendererが刻む | ✅ [renderStoryUserLaneDom.js:400](src/extension/story/renderStoryUserLaneDom.js) |
| 会場censusは既に可視タイルの `keys[]` を収集済み | ✅ [venueDomCensus.js:97-98](src/lib/venueDomCensus.js) |
| `normalizeDomSelf` は3フィールドだけ再構築＝**新フィールドを黙って落とす** | ✅ [laneMirror.js:69-73](src/lib/laneMirror.js)。M4 が必須である根拠 |
| 前SPECの「段に表示中」は未出荷 | ✅ grep 0件 |
| `compareRenderReceipts` の呼び出し元は venueBar とテストのみ | ✅ 再grep 済み（assumption 1 を解消） |

### 14-2. ★仕様に無かった追加の地雷（実装前に必読）

**`venueLaneParity.wiring.test.js` が M5 の変更で必ず赤になる。**

- [venueLaneParity.wiring.test.js:267](src/lib/venueLaneParity.wiring.test.js) が
  **import 行を正規表現で丸ごと固定**している
  （`/import\s*\{\s*buildSceneEnvelope,\s*buildRenderReceipt,\s*compareRenderReceipts\s*\}/`）
- 同 :274 が `sceneReceiptDiag = compareRenderReceipts\(` という**呼び出しの形**を固定

M5 で `buildVenueSceneReceipts` へ置換すると、**正しいリファクタなのに既存テストが赤になる**。
これは [[wiring-test-must-assert-counts-2026-08-04]] が警告する
「テストが正しいリファクタで赤になったら書き方を固定していないか疑う」の実例。

→ **対応**: 赤を「壊した」と誤読して実装を戻さないこと。wiring テストを
   **新しい配線（buildVenueSceneReceipts の呼び出し・件数断言）に書き換える**のが正しい。
   ★書き換えた後に必ず変異（`if(false)` 前置）で赤を確認する。

### 14-3. 司令塔が自案を取り下げた点（記録）

Q-C で司令塔が第一候補としていた **name-join（席資格と同じ2段へ join を広げる）は取り下げる**。
仕様 §5 の却下理由「**3種のアルファベット混在で別人ラップ→席の安定契約（venueSeats.js:25
「同じ人=同じ席」）を壊し、ちらつきとして現れる**」は、このリポのちらつき再発史
（[[story-userlane-churn-filllanetier-v1039]] 等）に照らして妥当。
完全一致スコープの外で新しい実害を作る案だった。**Phase 3 の裁定に委ねる**。

### 14-4. 実装の入口（次チャットはここから）

1. まず §8 M1〜M9 の順に実装（M2→M3→M4 が①側の運搬、M1→M5 が会場側の判定）
2. **14-2 の wiring テスト赤は想定内**。書き換えて変異で赤を確認する
3. 出荷ゲート `npm run verify:cc` 一本 / version bump は patch 1つ
4. 実機確認は reality-checker へ委任（自己採点しない）。
   ★MCPタブは前面になれず `docHidden: true` のままなので、
   `document.hidden` ゲートの影響を受けない測り方を用意すること（今回の測定の穴）
