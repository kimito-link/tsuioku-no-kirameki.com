# 設計書: 診断計器の強化 — 「どんなバグも修正が効く」状態の最大化

> 設計=Fable(claude-fable-5) / 素材収集(会議ハーネス4体)+地雷マップ裏取り=司令塔(Claude Sonnet 5)
> 日付=2026-07-16 / 3段構えワークフロー(council-fable)の手順2の産物
> 対象: `tsuioku-no-kirameki.com`(状態速報 status.html / ①popup / ②preview / ③web / ④会場)

方針一言: **新しいフレームワークは作らない。venueDomCensus の「数えるだけ」パターンを①に1枚だけ複製し、
fail-soft には出所印(provenance)を、診断自身には契約テストを付ける。**

## 前提: このお題に至った経緯

直近セッションで以下が繰り返し発覚した:
1. 「配信終了後に公式APIが0件を返すようになった」正常な状態変化を、既存の整合チェックが
   「鏡データの取りこぼし」と誤って🔴判定(fail-soft設計と診断の非対称)。
2. `diagnosisRegistry.js`/`healthCells.js`は既存値の「再表示」止まりで、独自に新しい異常パターンを
   検知する「一次集計」機構を持たない構造的欠陥。
3. 状態ページ更新が数秒〜60秒以上かかりChrome全体が固まることがある(4配信同時記録時)。
4. 過去に「会場タイルのリンク欠落」「名前ありゆっくり顔」が実は同じ`^\d{5,14}$`境界バグの
   別症状だったと後から判明し、時間を浪費した実績。
5. ユーザーは実機スクリーンショット/体感でバグを見つけることが多いが、診断ページの数値は
   「正常」と言っていて、見た目のズレ(幾何差・アイコン誤表示)を捕捉できていない。

会議ハーネス(4体・design分類)の批判役が刺した2つの穴を、本設計は明示的に塞ぐ:
- **穴①(groq/gpt-oss-120b)**: 一次集計を無制限に増やすと既存の重さ問題を悪化させる。
- **穴②(groq/qwen3-32b)**: DOM census型だけでは「見た目のズレ」(transform等)を検出できない。

---

## A. 理想の体験フロー

前提: ユーザーは状態速報を1回コピペするだけ。司令塔は実コードを読む前に、以下の順で速報を読む。

**シナリオ1: 「①の応援レーンに居るはずの人が居ない」(過去実例: リンク欠落・おすすめユーザー混入型)**
1. 速報の新1行 `①レーン一致 🔴 link:DOM余2(データ外キー2)` を見る。
2. 「DOM余=データに無い人が描画されている(混入)」か「DOM欠=データに居るのに描画されない(欠落)」かが
   1行で分かる。従来はこの領域(①自身のDOM)を誰も一次観測していなかった。
3. sampleKeys(件数と鍵種別のみ・PIIなし)から、混入元が roster 系か entries 系かの見当がつく
   → 読むべきファイルが1つに絞れる。

**シナリオ2: 「DOM構造は正常なのに見た目がズレる」(過去実例: 幾何差 link:170×40 vs ①192×38)**
1. 速報の `幾何 ①192×38(scale1.00) 会場170×40(scale1.00) 差11%🔴` を見る。
2. scale≠1.00 なら CSS transform 起因、scale=1.00 で w/h が違うなら box モデル/CSS 差分起因、と
   切り分けが1行で終わる。census(構造)では見えなかった「見た目のズレ」が数値になる。

**シナリオ3: 「✅なのに実は取りこぼしている / 🔴なのに実は正常」(過去実例: 配信終了後API 0件→鏡取りこぼし誤診断)**
1. 該当セルに `保全中(kept 4分前)` / `配信終了後` の出所注記が付く。
2. 「値が古い」ではなく「値がなぜその値か(live取得/前回値保全/終了後)」が読めるので、fail-softの
   前回値保全を取りこぼしと誤認しない。

**シナリオ4: 「新セルを足したのに完全性スコアに反映されない」(過去実例: v0.1.1054 レジストリ・ドリフト)**
1. 実行時ではなく **CI が赤になる**。速報を読む前に事故が存在できない。

---

## B. 統合アーキ(コンポーネント4個)

```
【①popup paint末尾】                    【④会場 renderSeats末尾(既存)】
 collectVenueLaneDomCensus(再利用)        venueDomCensus(変更なし)
   │ +measureLaneGeometry(新・軽量)         │ +measureLaneGeometry(同関数)
   ▼                                       ▼
 C1: popLaneSelfParity(新lib)           venueLaneParity(既存・幾何入力を実測値に差替)
   │ 3点突合: データ→painted→鏡書込        │
   ▼                                       ▼
 既存fastDiag full(書込キー増ゼロ) ──→ statusFastDiagLite passthrough(必須・~200B)
                                           │
                                           ▼
                              status.html: healthCells セル + 状態速報1行
                                           ▲
 C3: mirrorProvenance(新lib・~40B/鏡) ────┘ kept/live/ended を判定材料に供給
 C4: diagnosisRegistry.test.js(新テスト・ランタイム負荷ゼロ)
```

- **C1 ①DOM census + self-parity**(MVP): ①は鏡の**書き手**なので、突合は「レーンデータ(paint入力) =
  ①実DOM = 鏡に書いた内容」の自己3点。venueLaneParity の Tri-Parity と対をなす。
- **C2 幾何指紋**: `getBoundingClientRect` + `offsetWidth` の比で transform を検出する共通関数。
  ①census と④census の両方に同乗。
- **C3 出所印(provenance)**: 鏡 snapshot 1個につき ~40B のメタ `prov:{s,at,g}` を付与。fail-softと
  取りこぼし検知の矛盾を解消。
- **C4 レジストリ契約テスト**: メタ診断。テストのみ・ランタイム変更ゼロ。

**批判役の穴①(重さ)への回答=計器予算3行ルール**: 新計器は以下の予算を守り、モジュール先頭コメントに
明記する(convention)。
- storage read: **0**(既存 read に相乗り以外禁止。既存メモリ`status-extras-read-not-core-read`準拠)
- storage write: **既存ペイロードへのフィールド追加のみ**(新キー禁止。lite 追加 ≤300B。jsonBlob 87%
  問題に上乗せしない)
- DOM 走査: **paint 末尾で querySelectorAll ×5段のみ・ノード変更ゼロ・getComputedStyle ゼロ**
  (venueDomCensus の掟をそのまま輸入)

本設計の全コンポーネントはこの予算内(C4 に至っては負荷ゼロ)。「一次集計を全部増やす」は採らず、
**census 型1枚(①)だけ**を新設する。②③への展開は F で却下。

---

## C. 具体機構

> **司令塔による実在裏取り注記**: `collectVenueDomCensus`はFableの略記で、実在する関数名は
> `collectVenueLaneDomCensus`(`src/lib/venueDomCensus.js:128`)。以下は裏取り済みの正しい名前で記載する。
> `venueLaneParityKey`(`venueLaneParity.js:45`)・`VENUE_TILE_GEOMETRY_TOLERANCE`(同22行)・
> `publishLaneMirror`(`popup-entry.js:7285`)・`STORY_USER_LANE_STEPS.PAINTED`(`popup-entry.js:6804`)・
> `DIAGNOSIS_REGISTRY`/`DIAGNOSIS_CATEGORY_IDS`(`diagnosisRegistry.js:39,32`)は全て実在確認済み。
> ①側も`.nl-story-userlane-cell`等、会場と同一CSSクラスでlaneEls構造を持つことも確認済み
> (`popup-entry.js:6496`に`laneAd: $('sceneStoryUserLaneAd')`等)。`HEALTH_CELL_IDS`は新規追加提案(現状未実在)。

### C1. ①popup DOM census + self-parity(MVP)

**counting は新規実装しない。** `venueDomCensus.js` の `collectVenueLaneDomCensus` は DOM 要素を
引数で受ける chrome 非依存の純関数で、①も同じ lib(`.nl-story-userlane-cell` / `.nl-story-userlane`)で
paint しているため、①のレーン要素をそのまま渡せば動く。popup-entry の lane paint 末尾
(`storyUserLaneRenderProbe` が `domTilesPainted` を記録している同じ場所=追加の実行タイミングを
作らない)で呼ぶ:

```js
// popup-entry.js — paint末尾(probe記録の隣・3秒pollごと)
const popCensus = collectVenueLaneDomCensus({ laneEls: popLaneEls, stackEl: popLaneHost });
```

新lib `src/lib/popLaneSelfParity.js`(chrome/DOM 非依存・純関数):

```js
/**
 * ①自己3点突合: supplied(paint入力のキー列) = census(実DOMキー列) = published(鏡へ書いた列)。
 * 掟: venueDomCensus と同じ「数えるだけ」。keysはstorageに出さない(件数+差分サンプル鍵種別のみ)。
 * 計器予算: read 0 / write fastDiag同乗のみ / DOM走査なし(census結果を受けるだけ)。
 */
export function buildPopLaneSelfParity({ census, suppliedKeys, publishedKeys, nowMs })
// returns { verdict:'✅'|'⚪'|'🔴', perTier:{ supplied, dom, published, domExtra, domMissing }[],
//           extraSample:string[], line:string }
```

- `suppliedKeys`: paint に渡した段別キー列(`venueLaneParityKey` を再利用)。paint 関数は既にこの配列を
  持っている=新規計算ゼロ。
- `publishedKeys`: `publishLaneMirror`(popup-entry.js:7285)直前の snapshot から同関数で抽出。
- **DOM余(supplied に無い鍵が DOM に居る)=混入系**(おすすめユーザー混入の再演を機械検知)、
  **DOM欠=欠落系**(リンク欠落の再演を検知)。
- 出力は fastDiag full の既存オブジェクトに `popLaneSelfParity` フィールドとして同乗
  → **statusFastDiagLite に passthrough**(verdict+perTier件数のみ・~200B)→ healthCells に
  `pop-lane-parity` セル(state型)+ diagnosisRegistry へ**同一コミットで**登録(C4 が強制)。

### C2. 幾何指紋(批判役の穴②への回答)

新lib `src/lib/laneGeometryFingerprint.js`:

```js
/**
 * 1段の代表タイル1枚だけ測る(全タイル走査しない=強制レイアウトは段あたり1回)。
 * scaleX = rect.width / offsetWidth: 1.00以外=CSS transform が効いている証拠。
 * 構造(census)が正常でも「見た目」がズレる系(transform:scale・box差)を数値で捕捉する。
 */
export function measureLaneGeometry(firstVisibleTileEl, dpr)
// returns { w, h, rectW, rectH, scaleX, scaleY, dpr } | null(タイル0 or 全寸法0)

export function compareLaneGeometry(a, b, tolerance = 0.1)
// returns { differs:boolean, axis:'w'|'h'|'scale'|null, pct:number, line:string }
```

- ④の census は既に `tileW/tileH`(offsetWidth)を持つ → `measureLaneGeometry` の結果で置き換え拡張
  (census 出力に `geo` を1個追加)。①の census(C1)にも同乗。
- venueLaneParity の `geometryDiffers`(現状22-34行、実測値ベースの推定比較) → **両端実測の geo 同士**の
  比較に差し替え(`VENUE_TILE_GEOMETRY_TOLERANCE=0.1` はそのまま)。残課題「link:170×40 vs ①192×38」が
  この1行で恒常監視になる。
- スクリーンショット差分・全タイル走査・ResizeObserver は不採用(F 参照)。コストは
  **段あたり getBoundingClientRect 1回**=census が既に払っている offsetWidth 読みと同オーダー。

### C3. 出所印(provenance) — fail-soft 矛盾の解消

新lib `src/lib/mirrorProvenance.js`:

```js
/** 鏡snapshotに出所メタを刻む。行ごとでなくsnapshotごと1個(~40B)=jsonBlob容量に効かない。 */
export function stampProvenance(snapshot, { source /* 'live'|'kept' */, nowMs, gen })
// snapshot.prov = { s: source, at: nowMs, g: gen } を付けて返す(非破壊)

/** 診断側の判定。値でなくメタを見る。 */
export function judgeProvenance({ prov, nowMs, phase /* 'live'|'ended'|'unknown' */ })
// returns 'live' | 'kept'(保全中=⚪注記) | 'ended'(終了後=na) | 'stale'(本物の疑い=🔴候補)
```

- **書き手側の乗せ方(最小侵襲)**: `publishLaneMirror` 等の鏡書込関数は「新データで組んだ」なら
  `source:'live'`、「取得失敗/空で前回値を書き直した(fail-soft 発動)」なら `source:'kept'` を刻む。
  既存の fail-soft 分岐は各書き手に**既に存在する**(前回値保全のif文)ので、その分岐に1行足すだけ。
  storageKeys.js への変更は不要(値の中のフィールド)。
- **phase の導出**: 新規検知を作らない。lite に既に通っている `ndgrConnectStatus` が closed/ended 系
  なら `phase='ended'`。判定ヘルパ `derivePhase(ndgrConnectStatus)` を同libに置く。
- 読み手(healthCells/venueLaneParity)は `judgeProvenance` の結果で: `kept` → ✅を名乗らず
  「⚪ 保全中(N分前)」、`ended` → 取りこぼし系診断を na 化。**値の一致/不一致だけで嘘の🔴を出す経路を、
  メタ整合の判定に置き換える。**

### C4. レジストリ契約テスト(メタ診断・最安構成)

1. `healthCells.js` に静的マニフェストを追加(セル定義の隣・1配列):
   ```js
   export const HEALTH_CELL_IDS = Object.freeze(['capture-rate', 'match', /* … 全id */]);
   ```
2. 新規 `src/lib/diagnosisRegistry.test.js`(3断言・fixture 不要):
   - **集合等値**: `HEALTH_CELL_IDS` ⟺ `DIAGNOSIS_REGISTRY` の id が双方向に一致
     (v0.1.1054 のドリフトが CI 赤になる)。
   - **ソーススキャン**: `fs.readFileSync('healthCells.js')` して `pctCell('…'` / `stateCell('…'` の
     idリテラルを正規表現抽出 → 全て `HEALTH_CELL_IDS` に含まれること。**「網羅テスト自体の穴」
     (fixture がセルを発生させないと見逃す)を、fixture 非依存の静的抽出で塞ぐ** — これが
     v0.1.1054 の直接の教訓への回答。
   - **整合**: id 一意・category が `DIAGNOSIS_CATEGORY_IDS` 内・weight>0。
3. 会議提案の「診断スコアのローリング平均・標準偏差」は不採用(F 参照)。契約テストの方が安く、
   決定的で、偽陽性ゼロ。

---

## D. 偽陽性潰しの具体ロジック

| 偽陽性パターン | 従来 | 本設計の判定 |
|---|---|---|
| fail-soft の前回値保全を「取りこぼし」と誤診 | 値の鮮度(時間窓)のみ | `prov.s==='kept'` → ⚪「保全中」。🔴は`prov.s==='live'`かつ不一致のときだけ |
| 配信終了後 API 0件 vs 鏡残存 | 時間窓で誤🔴 | `phase==='ended'`(ndgrConnectStatus由来)→ 該当診断をna。時間でなく**ライフサイクル事象**で切る |
| 会場 open 中の①POPはvisibility:hidden(P1遮蔽)/タブ非表示で寸法0 | — (新設計器の新リスク) | census 全段寸法0 → `measured:false` → verdict⚪「DOM未計測」(venueLaneParityと同じfail-closed)。🔴を出さない |
| CSS classリネーム/ハッシュ変化でcensusが0件→偽「DOM欠」 | — | **二重canary**: `.nl-story-userlane-cell`のclass検出が0件でも`img.nl-story-userlane-avatar`等の構造アンカーが>0なら🔴でなく⚪「selector-drift疑い」1行(diagnostic-architecture-strengthen設計のcanary案をcensus内に内蔵) |
| X層(直近発言者)の一時差分 | 既存60秒窓(据置) | ①self-parityではsuppliedとpaintedが同一tickなので窓自体が不要=構造的に偽陽性が出ない(これがself-parityをMVPに選ぶ理由の一つ) |
| 幾何のDPR/ズーム差 | — | 指紋にdprを同梱し、比較は物理px正規化後。scale≠1.00は「transform检出」として別軸表示(寸法差と混同しない) |

原則: **verdict は fail-closed(測れないとき✅を名乗らない)、データは fail-soft(前回値保全)、両者の橋渡しが provenance。**

---

## E. MVP と段階的導入

**新設する一次集計は1つだけ = C1(①popup census + self-parity)。**

選定理由: 過去4件の未検知不具合のうち2件(リンク欠落・おすすめユーザー混入)は①で発生し、①には
census が無い(probe は件数のみ)。かつ counting 実装は venueDomCensus の**再利用でコード新設ほぼゼロ**、
storage 負荷ゼロ、同一tick突合で時間窓の偽陽性が構造的に出ない — 費用対効果が突出している。

| 段 | 内容 | 負荷 | 依存 |
|---|---|---|---|
| **Phase 0** | C4 契約テスト + HEALTH_CELL_IDS | ランタイム0(テストのみ) | なし。**即日・単独コミット可** |
| **Phase 1 (MVP)** | C1 ①census + self-parity + lite passthrough + セル/レジストリ登録 | read0/write同乗~200B/DOM走査1回3秒 | Phase 0(登録漏れをCIが守る) |
| Phase 2 | C2 幾何指紋を①④両censusに同乗 + venueLaneParityの幾何比較を実測化 | +getBoundingClientRect5回/paint | Phase 1(①censusが土台) |
| Phase 3 | C3 provenance + phaseゲート(まずlaneMirror1系統のみ、効けば北極星鏡へ横展開) | +40B/snapshot | 独立(ただし実害計測をPhase1-2で先に) |

各 Phase は独立ロールバック可(census 呼び出し1行 / geo フィールド / prov フィールドを外すだけ)。

---

## F. 捨てた案と理由(既出の却下と重複しない新規判断のみ)

1. **②preview/③web への census 同時展開** — 却下。批判役①(重さ)の指摘どおり選別する。③は①と同じ
   lib が鏡データを paint する構造(full-mirror 設計)なので、①self-parity が緑なら③の異常は
   「鏡の中身」か「③paint」に絞れる=③固有 census の限界効用が低い。実害が③で観測されてから
   diagnose-first で足す。
2. **行ごと(セルごと)の provenance メタ** — 却下。鏡は容量 prune はしご(448KB 閾値)ぎりぎりで
   運用中。行×40B は数千行で数十KB=prune を誘発し「snapshotMeta.pruned で正常扱い」の例外系を
   肥大させる。snapshot 単位1個で診断目的(保全中か否か)には十分。
3. **ResizeObserver / MutationObserver による常時幾何監視** — 却下。paint 末尾の1回測定で同じ結論が
   出る。observer は解除漏れ(①は3秒ごとに再paint)とコールバック嵐のリスクだけ増える。
4. **会議提案の「診断スコアのローリング平均・標準偏差」型メタ診断** — 却下(新規判断)。統計的異常検知は
   閾値チューニングという新しい偽陽性源を持ち込み、履歴保持=新しい storage 書込を要求する。
   メタ診断の実需要は「登録漏れ・配線漏れの検知」であり、それは静的契約テスト(C4)が負荷ゼロ・
   決定的に満たす。
5. **スクリーンショット/ピクセル差分** — ブリーフで却下候補指定済みを確定却下。幾何指紋(C2)が
   同じ問い(見た目のズレ)に1/1000のコストで答える。
6. **census 用の新 storage キー新設** — 却下。fastDiag full + lite passthrough という既存の配管に
   同乗。キーを増やすと onChanged ファンアウト(robust-architecture の真犯人と同型)に足し算になる。

---

## G. 地雷と回避策

1. **lite passthrough 忘れ**(既存メモリ`fastdiag-lite-is-the-printer-subset`・v0.1.1124 実績):
   full に足しても lite に通さないと状態速報に永久に出ない。→ Phase 1 のコミットに
   `statusFastDiagLite` の wiring 断言テスト(`popLaneSelfParity` が lite 出力に存在すること)を
   **同梱必須**。
2. **セル追加とレジストリ登録の別コミット**(v0.1.1054 実績): → Phase 0 を先に入れれば片方だけの
   コミットは CI 赤で物理的に不可能。着手順を Phase 0 →1 に固定する理由そのもの。
3. **getBoundingClientRect の強制レイアウト**: paint 直後に write(style変更)を挟んでから読むと
   layout thrash。→ census/geo は「paint の全 write が終わった同期末尾」で**読みだけをまとめて**
   行う(venueDomCensus が offsetWidth で既に守っている順序に相乗り)。census 内で DOM write は
   1つも書かない(掟)。
4. **①遮蔽中の偽計測**: 会場 open 中①は visibility:hidden(v0.1.1115 P1)。visibility:hidden は
   レイアウト保持なので寸法は取れるが、タブ非表示や display:none 系では0になる。→ D の
   `measured:false→⚪` ゲートを census 出力の必須フィールドにする(省略不可の契約としてテストで固定)。
5. **keys 配列の storage 流出**: venueDomCensus は keys を storage に出さない(PII/容量)。
   popLaneSelfParity も**件数+差分サンプルの鍵種別(u:/c: プレフィックスのみ)**に落としてから
   fastDiag に載せる。生 uid を lite に流さない。
6. **suppliedKeys の取得位置**: paint 関数の入口で取ると、単調性ガード(shrink-kept)や early-return
   (race/stale-snapshot)で「実際には paint していない」列と突合して偽🔴になる。→
   `storyUserLaneRenderProbe` の `PAINTED` step(popup-entry.js:6804)に到達した経路の入力だけを
   supplied として採用(probe の step 定数を import して分岐を共有)。
7. **dist の build churn**: census 配線は popup-entry を触る=dist 再生成。既存メモリ
   `reality-checker-stash-detaches-head` / `verify-cc-lint-catches-unwired-import`ルールに従い、
   `npm run verify:cc` 一発+tree-map/feature-map 再生成を同コミットに含める。
8. **provenance の「kept 判定の嘘」**: 書き手が fail-soft 分岐以外(例: 例外 catch で前回値温存)を
   通ると `live` のまま古い値が残る。→ Phase 3 で `stampProvenance` を書込関数の**出口1箇所**
   (実際に set する直前)に置き、「新データで組んだフラグ」を組立側から受け取る形にする。
   分岐ごとに刻むと必ず漏れる。
