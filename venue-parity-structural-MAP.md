# 会場パリティ「何周も再発する」構造の地図（wayfinder）

- 作成: 2026-08-06 / 司令塔(Claude)が実コードを読んで作成・コード変更なし
- お題: 会場モードが①パネルと一致しない。**ただし個別の不一致を潰すのではなく、
  「なぜパリティが何周も再発するのか」という構造から問う**（ユーザー選択=B）
- 次工程: この地図を Fable に渡して `venue-parity-structural-SPEC.md` を設計させる

---

## 0. なぜ「個別修正」ではなく「構造」から問うのか

ユーザーの明示的な選択。根拠として、この案件は**過去1ヶ月で少なくとも8回**
設計・修正されている（下記5章）。それでも今日また同じ症状が出た。

既存メモリ [[venue-pop-parity-loop-root-cause-2026-07-13]] は、繰り返しの原因を
「✅判定が幾何を見ていない浅さ」と結論した。だが今回の実測はそれとは別の形で破れており、
**「判定の浅さ」だけでは説明が足りない**ことを示している（後述3章）。

---

## 1. 入口になる画面

| 入口 | 実体 | 備考 |
|---|---|---|
| ①パネル（サイドパネル / 埋め込み） | `popup.html` | v0.1.1275 以降は既定が Side Panel |
| 会場モード | watch ページ内の `venueBar` | ①の下部「会場モード」ボタンから開く |
| ③WEB / 状態速報 | `status.html` | 鏡を読んで表示 |

---

## 2. 今回の実測（2026-08-06・同一配信 lv351115291・同一瞬間）

| 段 | ①パネル | 会場モード |
|---|---|---|
| りんく | **12人**（PlusSei/節政拓海/えだまめ/…/君斗りんく/アクラ） | **8人**・★匿名が混入（`aXZVo…匿名` `a:wRS2…匿名`） |
| ギフト | **1人**（君斗りんく・実写サムネ） | **0人**「該当者がいません」 |
| 広告 | **10人** | **0人**（段自体が空） |
| たぬ姉 | 9人 | 0人「該当者がいません」 |
| 件数表記 | 応援 **165件** | 応援コメント **23件** |

速報の自己申告:
```
会場一致 ⚪鏡stale(656s) link7 gift0 ad4 konta0 tanu332
```
★鏡の中身（link7/ad4）は**①の現在値（link12/ad10）とも会場の表示とも一致しない**。
3者が三つ巴でずれている。

---

## 3. ★構造的真因（実コードで確認済み）

### 3-1. 会場には経路が2本ある

[venueBar.js:5017](src/extension/venueBar.js)
```js
const laneBuckets = laneComposed ? laneComposed.buckets : fallbackLaneBuckets;
```

| 経路 | 供給元 | gift/ad | 匿名 |
|---|---|---|---|
| **鏡経路** | ①が publish した `KEY_LANE_MIRROR` | 出る | ①と同じ扱い |
| **fallback経路** | 会場が自前で座席から組む | **空配列固定** | 除外するはずだが実測で混入 |

fallback が gift/ad を捨てているのは仕様として明記されている
— [venueLaneBuckets.js:173](src/lib/venueLaneBuckets.js)
```js
return { link: b.link, gift: [], ad: [], konta: b.konta, tanu: b.tanu };
```

### 3-2. ★同じキーについて、書き手と読み手の認識が正反対

これが本丸。**同一の `KEY_LANE_MIRROR` に対して、両端が逆のことを書いている。**

**書き手側** — [popup-entry.js:7019](src/extension/popup-entry.js)
> 「buckets(…)はこの時点で確定済み。**会場には一切関係しない=popup と status だけ**。」

**読み手側** — [venueBar.js:202](src/extension/venueBar.js)
> 「v0.1.1111 会場=①レーン鏡映(メンバー完全一致): ①の実paint鏡(KEY_LANE_MIRROR)を
> **会場の正本に昇格**。」

→ 書き手は「会場は客ではない」と思っており、読み手は「これが正本」と思っている。
**契約が存在しない共有キー**であり、片側の変更がもう片側に無言で伝播する。
これが「直しても直しても再発する」の構造的な源泉（**この因果は既存メモリに無い新発見**）。

### 3-3. ★鏡は「①が描画したときだけ」更新される

[popup-entry.js:7500-7501](src/extension/popup-entry.js)
```js
function publishLaneMirror(input) {
  if (INLINE_PASSIVE) return; // 受動ビュー: 鏡を上書きしない
```
かつ `publishLaneMirror` の呼び出しは `renderStoryUserLane` 内の
[popup-entry.js:7023](src/extension/popup-entry.js) **1箇所のみ**（確認済み）。

→ **①パネルが描画されない限り鏡は増えない。**
会場を見ている間、ユーザーは①を前面に出していない。よって鏡は古くなる一方。
実測656秒はこれで説明できる。

### 3-4. ★656秒は「意図的に古い鏡を使い続ける」谷間

[venueLaneParity.js:18,34](src/lib/venueLaneParity.js)
```js
export const VENUE_LANE_MIRROR_SOFT_WINDOW_MS = 180_000;  // 3分
export const VENUE_LANE_MIRROR_HARD_WINDOW_MS = 900_000;  // 15分
```
- 180s 超 → `鏡stale` と表示するが**そのまま使い続ける**（C2判断・モード往復による
  段総入替ちらつきの防止）
- 900s 超 → `鏡staleHard(→fallback降格)`

**実測656秒はこの谷間**。設計コメント自身がこう書いている
— [venueLaneParity.js:20-24](src/lib/venueLaneParity.js)
> 「その判断は『数分規模の一時的な遅れ』を想定したもの。popup が数時間開かれない実機ケース
> (実測: 鏡stale 21437s=約6時間)では、**その間に来た新規参加者が段に一切現れない実害**が出る」

→ HARD窓は「6時間」を想定して 15分 に置かれたが、**Side Panel 移行(v0.1.1275)で
①を閉じたまま会場を見る運用が普通になった**なら、10分程度の遅れは日常的に起きる。
**前提が変わったのに窓が据え置かれている**（★推測: v0.1.1275 との因果は未検証）。

---

## 4. データが流れる順番

```
[①パネル renderStoryUserLane]
   └ bucketStoryUserLanePicks(link/konta/tanu)     popup-entry.js:6907
   └ buckets.gift = giftPicks (tier判定を通さず後付) popup-entry.js:6914
   └ buckets.ad   = adPicks                        popup-entry.js:6919
   └ publishLaneMirror(buckets)                    popup-entry.js:7023
        └ INLINE_PASSIVE なら return               popup-entry.js:7501
        └ mergeAndScheduleFlush('lane', …)         popup-entry.js:7515
             ↓ chrome.storage.local[KEY_LANE_MIRROR]
[会場 renderSeats]
   └ fallbackLaneBuckets = bucketVenueLaneSeats(…) venueBar.js:5000  ← gift/ad 空
   └ laneComposed = composeVenueLaneBuckets(鏡)    venueBar.js:5011
   └ laneBuckets = laneComposed ?: fallback        venueBar.js:5017  ← ★分岐
```

★注目: **①の gift/ad は tier 判定を通らず後付けされている**
（[popup-entry.js:6914,6919](src/extension/popup-entry.js)）。
一方 fallback は tier 判定しか持たない。**構造上、fallback が gift/ad を作れるはずがない。**
「未配線の欠落」ではなく**原理的な非対称**である（★これも既存ドキュメントに無い整理）。

---

## 5. 既存の設計判断と、その根拠（壊してはいけない境界）

| 版 | 判断 | 根拠 |
|---|---|---|
| v0.1.1111 | ①の実paint鏡を会場の正本に昇格 | 「広告/ギフト段も鏡から出る=未配線の欠落が直る」 |
| v0.1.1136(C2) | SOFT超の鏡も fallback に降格させない | モード往復による**段総入替ちらつき**の防止 |
| v0.1.1138 | 会場独自の受け皿を撤去（匿名は段に出さない） | 「①と完全に同じ顔ぶれだけを描く」 |
| v0.1.1234 | 鏡cap撤廃（①と揃える） | cap48固定で238人が③に載らなかった実害 |
| — | SOFT/HARD は**別定数のまま維持** | 「1つにまとめると C2 のちらつき防止が壊れる」 |

**ユーザー確定の不変条件**（[[venue-equals-lane-same-layout]]）:
> 会場=応援レーン=別窓は「見た目もそっくり同じ（並び・レイアウトまで）」であるべき

**関連メモリ**:
- [[venue-pop-parity-loop-root-cause-2026-07-13]] — 繰り返しの原因＝✅判定が幾何を見ていない
- [[mirrors-written-per-key-per-tick-root-of-parity-lie]] — 各鏡が別キー・別tickで書かれる＝
  **同一tick一貫が無い**＝数字ズレ／嘘の緑の構造的真因（★今回の3者三つ巴と直結）
- [[parity-check-must-compare-values-not-just-ack]] — ✅は ack でなく実描画値の突合で初めて本物
- [[venue-mirror-is-the-primary-path-2026-08-01]] — 中継のたびに値を落とす関数がある

---

## 6. 変更すると壊れうる箇所

1. **SOFT/HARD 窓を1つにまとめる** → C2 のちらつき防止が壊れる（明文の警告あり）
2. **fallback に gift/ad を作らせる** → ①の gift/ad は tier 外の後付けなので、
   会場が独自に作ると「会場独自の受け皿」を復活させることになり v0.1.1138 に逆行
3. **鏡cap を再導入** → v0.1.1234 の 238人欠落が再発
4. **`publishLaneMirror` を passive でも動かす** → 受動ビューが本物の鏡を上書きする
   （②応援プレビューの不可侵原則を破る）
5. `laneMirror.js` の 512KB フェイルセーフ（cap半減）は**有限値でしか働かない**

---

## 7. 未確認の前提（★推測と明記）

- **推測A（追加調査で一部確定）**: 会場のりんく段に匿名が混入している件。
  - **確定した事実**: 鏡経路の復元関数 `composeVenueLaneBuckets`
    ([venueLaneMirrorSupply.js:132-156](src/lib/venueLaneMirrorSupply.js)) は
    **鏡の段構成をそのまま信じて復元しており、匿名判定を一切していない**。
    `profileTier` すら `TIER_PROFILE[tier]` で段名から逆算しているだけ。
  - **確定した事実**: fallback 経路は
    [venueLaneBuckets.js:171](src/lib/venueLaneBuckets.js) で匿名を除外している。
  - → **したがって匿名混入が起きるのは鏡経路のみ**。つまり
    **①が匿名をりんく段に入れて publish したか、鏡の中身が壊れているか**の
    どちらか。★どちらかは未確認（実データの鏡を見る必要がある）
  - ★この非対称（fallbackは匿名を弾くが、鏡経路は無検査で信じる）自体が
    Q1（契約の不在）の具体例になっている
- **推測B**: Side Panel 移行(v0.1.1275)により「①を閉じたまま会場を見る」が常態化し、
  鏡の陳腐化頻度が上がった。**版と実測の因果は未検証**
- **未確認**: 会場の「応援コメント23件」と①の「165件」の差。件数の定義が違うのか
  （会場は「レーンに並べた人数の合計」と自己申告している）、鏡の陳腐化由来かは切り分け未了
- **未確認**: `composeVenueLaneBuckets` が鏡から段を復元する際、①の後付け gift/ad が
  正しく復元されるか（コードは読んだが実データでの検証はしていない）

---

## 8. 実装前に決める必要がある質問（Fableに答えさせる）

1. **Q1（本丸）**: `KEY_LANE_MIRROR` の**契約**をどう定義するか。
   書き手（popup）と読み手（会場・status）で認識が正反対の現状を、どう構造的に封じるか。
   「会場には一切関係しない」というコメントは削除すべきか、それとも会場が鏡を読むのをやめるべきか。

2. **Q2**: 鏡の陳腐化（①が描画しないと更新されない）に対する正しい解は何か。
   選択肢: (a) 会場自身が publish する (b) content 側が publish する
   (c) HARD窓を短くする (d) 会場が「古い」ことをユーザーに見せる (e) 別の何か。
   ★C2のちらつき防止を壊さないこと。

3. **Q3**: fallback 経路の gift/ad 空配列は**維持すべきか**。
   維持するなら「fallback 時は不完全である」ことをユーザーにどう伝えるか。
   維持しないなら v0.1.1138（会場独自の受け皿を持たない）との整合をどう取るか。

4. **Q4**: 3者（①・会場・③WEB）が同一tickで一貫する仕組みを作るべきか。
   [[mirrors-written-per-key-per-tick-root-of-parity-lie]] が指摘した構造に手を入れるか、
   今回はスコープ外とするか。

5. **Q5**: 「何周も再発する」を止めるための**機械的なガード**は何か。
   既存の parity 判定は嘘の緑を出してきた（メモリに複数記録）。
   何を CI / テストで固定すれば、次の再発を人手の目視に頼らず検知できるか。

6. **Q6**: 匿名混入（推測A）は今回のスコープに含めるか、別案件に切り出すか。

---

## 9. セルフチェック

- [x] ファイル名の列挙で終わっていない（なぜそこを通るかを4章で追跡）
- [x] 既存仕様を守る理由（5章に版ごとの根拠）
- [x] ユーザー体験上の制約（ちらつき防止・見た目そっくり同じ）
- [x] 失敗時の挙動（SOFT/HARD の降格・512KBフェイルセーフ）
- [x] 事実と推測を分離（7章に推測を隔離）
- [x] 根拠にファイル:行番号・メモリスラッグを付与

---
---

# 【追補・2026-08-07】完全一致の再調査（v0.1.1282/1283 後）

> 2026-08-06版（上記）は有効な資産なので**上書きせず追補**する。
> 上記の行番号は本追補の時点で約40行ずれていたため修正済み（5000/5011/5017）。

## A-0. 経緯：Q1 の答えが実装で壊れた

上記 §8 Q1（契約の不在）への答えとして v0.1.1280 で「読み口の関所」
`sanitizeLaneMirrorForRead` を導入した。**設計は正しかったが実装で形を取り違え、
鏡を100%捨てた**（関所が実在しない `snap.buckets` を探した）。v0.1.1282 で修正。

★したがって本追補の主題は「Q1をやり直す」ではなく
  **「正しい設計が実装で壊れる構造」と「壊れても気づけない計器」**である。

## A-1. ★私の初期解釈は誤りだった（訂正して記録する）

実機で `seatsByTier: { link: 16 }` を観測し、私はこれを「段の不一致」と読んだ。**誤り。**

`nlsb-seat-<tier>` というクラスは**存在しない**（grep 済み。実在するのは
`nlsb-seat-link` / `-vip` / `-speaking` / `-regular` / `-speak` / `-streak`）。
`nlsb-seat-link` の `link` は**段名ではなく「リンク可能な数値uidか」という述語**
（[venueBar.js:5156-5157](src/extension/venueBar.js)）。

→ **席は tier という軸を持っていない。実装に無い軸で数えていた。**
★教訓: 計器を自作する前に「その軸が実装に存在するか」を確かめる。

## A-2. 実測（2026-08-07・lv351112544・Claude-in-Chrome MCP で自分で操作）

```
venueOpen: true / docHidden: true（★MCPタブは前面になれない）
.nlsb-seat = 16（すべて nlsb-seat-link）
段別 img   = [16, 1, 0, 1, 1]（計19）
```

**差の3件＝席を持てなかったレーンアイテム。** これが正しい説明。

## A-3. 二重ソースは実在する（リポ自身が明記）

[venueSeatLinkParity.js:6-9](src/lib/venueSeatLinkParity.js) が「二重ソース」と明記。

| | 段のタイル実体 | 席クラス |
|---|---|---|
| 入力 | 鏡 snapshot（①が publish） | roster（`entry.participant`） |
| 更新 | `storage.onChanged`（①が描いたときだけ） | `onLiveComments`（リアルタイム） |
| uid | `item.entry.userId` | `entry.participant.userId` |

橋渡しは `seatIndexByUid` の uid 一致のみ
（[venueLaneMirrorSupply.js:166-177](src/lib/venueLaneMirrorSupply.js)）。
鏡にしか居ない人（uidなしの広告主等）は `_venueSeatIndex = -1` となり、
**席にラップされず生タイルのまま段に入る**
（[venueBar.js:5094-5105](src/extension/venueBar.js) の `wrapTileEl`）。

★§3-1 は「鏡 vs fallback」という**供給経路**の二本立てを扱っていたが、
  **「段タイル(鏡) vs 席クラス(roster)」というレイヤー間の二重ソース**は未収録だった。
  実測を説明するのは後者。

## A-4. ★★★一致判定の「✅」は構造的に嘘（3点すべて実コードで確認）

| # | 事実 | 根拠 |
|---|---|---|
| C1 | `venueReceipt.revision` に `popEnvelope.revision` を**自己代入** | [venueBar.js:5318](src/extension/venueBar.js)。revision比較は**恒真**。2026-07-14(v0.1.1137)の初版から**一度も直っていない** |
| C2 | pop/venue の両receipt が**同じ鏡起点** | `popEnvelope`←`restoreLaneMirrorBuckets(lanePaintSnap)` / `venueEnvelope`←`laneBuckets`（＝同じ鏡のコピー）。**X と copy(X) を比較**＝hash比較も恒真 |
| C3 | ①が焼いた `snap.contentHash` を**誰も読まない** | grep で `.contentHash` の読み手は会場の自前再計算のみ。`domFingerprint` も型定義のみで**未配線** |

→ **`scene r… ①=会場 ✅` は、①のDOMも鏡の凍結も写さない。**
   ①が0件描画でも鏡さえ残れば ✅ が出る。

★C1〜C3 は同型＝**「比較の両辺が同じ起点」**。これが「嘘の緑」の構造的正体。

## A-5. 本物の検出力は2つだけ

`buildVenueLaneParity`（[venueLaneParity.js:132](src/lib/venueLaneParity.js)）のうち実効性があるのは:

- **会場の実DOM ⇄ 会場データ**（`DOM=データ`・`:275-293`）
- **①の実DOM ⇄ 鏡**（`①DOM=鏡`・`:257-271`）← ★①の実DOMを見る唯一の経路

ただし `①DOM=鏡` は **件数しか比較しない**（`domSelf` は `visible/tileW/tileH` のみで
uid列を持たない）。→ **別人を同人数描いても ✅**。

また `席リンク一致` は名前に反し**①を一切見ていない**（会場内部の鏡 vs roster 整合）。

## A-6. `domSelf` は描けたときしか更新されない

`_laneDomSelfLast` の更新は [popup-entry.js:7067](src/extension/popup-entry.js) の1箇所のみで、
手前に**早期return が4本**（`:6979` sig一致 / `:7006` 縮小ガード / `:7012` 空ガード / `:7018` 空）。

v0.1.1281 で `publishLaneMirror` は描画前へ移したが、**`domSelf` は移していない**。
→ ①を閉じた／リサイズした後も古い `measured:true` が publish され続けうる
（★推測・根拠は上記4行）。`domSelf` には**計測時刻が無い**ので会場は古さを知れない。

## A-7. ユーザー確定事項（2026-08-07）

- **母集団は①基準で全員出す**（幾何で溢れる分はスクロール/縮小/ページングで見せる）
- **スコープは完全一致に絞る**（鏡の陳腐化・匿名混入等は別案件へ切り出す）

## A-8. 会議で決めること（Q-A〜Q-F）

| # | 論点 |
|---|---|
| Q-A | **「完全一致」の定義**。母集団は①基準（確定）。*何が*一致していれば一致か——顔ぶれ(uid列)・順序・件数・幾何のどこまでか |
| Q-B | **嘘の緑をどう潰すか**。C1〜C3は同型。①の実DOMを起点に持つ受領証をどう作るか（未配線の `domFingerprint` をどう活かすか） |
| Q-C | **二重ソース(席 vs 段)をどう畳むか**。席を持てないタイル(uidなし)を①基準の全員表示でどう扱うか |
| Q-D | **`domSelf` の鮮度**。描画スキップ時に更新されない値を会場はどう「古い」と知るか（時刻を持たせるか・publish経路を分けるか） |
| Q-E | **①基準で全員出す**ときの描画量。過去に重さで痛い目に遭っている領域との両立 |
| Q-F | **CIで何を固定すれば再発を機械検知できるか**。★grepベースのwiringテストは v0.1.1280 を通した実績があるので不足 |

## A-9. 未確認（推測で埋めない）

- 実測の gift/konta/tanu 各1件が「uidなし」か「uidはあるが roster に居ない」かは
  コード上**両方あり得る**。切り分けには実データの `_venueSeatIndex` 観測が必要
- `docHidden: true` 下での測定なので、①が前面のときの値は未取得
- `venue-parity-structural-SPEC.md`(27KB) / `-IMPLEMENTATION-HANDOFF.md` は本追補では未読
- `buildVenueSeating`（誰が席資格を得るか）の内部ロジックは未読
