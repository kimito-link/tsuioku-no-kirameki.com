# to-spec: 会場「応援者ランキング」チラつき根治 — バンド量子化ヒステリシス(prevSupporterOrderKeys 方式)

> wayfinder→to-spec方式・手順2(実装仕様)。設計=Fable(claude-fable-5) / 地図・裏取り=司令塔(Claude Code) / 2026-07-30。
> 地図(正本): [venue-ranking-churn-MAP.md](venue-ranking-churn-MAP.md)。地図の行番号・関数実在は司令塔が実コード(v0.1.1189時点の`feat/voice-lag-budget-shadow`)で裏取り済み。

---

## 1. Problem Statement

会場モードの応援者トップNバー(`renderTopBar`・1〜3位バッジ)と席タイルの順位バッジ(`venueRank`)が、配信序盤の少コメント帯で**コメント1件来るたびに別人へ入れ替わる**。

- 直接原因(地図3.1): スコアの`log1p`正規化が低カウント域で急峻。count=1→2でスコアが10.27→16.27(約+58%)跳ねるため、発言1〜2回の人が複数並ぶ序盤は僅差の逆転が毎コメント発生する。
- 構造原因(地図3.2): `rankVenueContributors`は**前回の順位を一切参照しない無状態の毎回再計算**。席割りには`prevSeatByKey`の安定化先例(venueSeats.js:492 `assignVenueSeats`)があるのに、ランキングにだけ同じ思想が適用されていない。
- 描画側のdiff-skip(`_lastTopBarSig`・`_lastVenueRankByNode`)は「中身が本当に変わった」場合は素通しする設計なので、ここでは止まらない(地図3.3-3.4の通り、対策場所として不適)。

ユーザー体験への影響: 「1位」の称号が数秒おきに別人へ移る=称号の価値が毀損される。視聴者・配信者のどちらから見ても「誰が応援No.1か」が読み取れず、バッジ演出そのものが信頼を失う。

## 2. Solution

**採用: バンド量子化ヒステリシス**。スコアを幅`BAND=8`点のバンドに量子化し、「挑戦者は現職より上のバンドに到達して初めて追い越せる。同バンド内では前回の並びを維持する」という決定論的な安定化レイヤーを、`rankVenueContributors`(共有スコア源・不変更)の**後段**に純関数として1枚挟む。

なぜこの方式か:

- **ペアワイズ・マージン比較器(「差がM点開いたら逆転」をcomparatorに書く方式)は不採用**。ヒステリシス付き比較は非推移になり得る(例: M=6、score A=10/B=15/C=19、前回順A>B>C → A>B, B>C, C>A の循環)。非推移comparatorを`Array.sort`に渡すと結果がエンジン実装依存=**決定論制約(地図4章)違反**。バンド量子化+辞書式ソートキーはstrict weak orderingなので推移的・決定論的。
- **時間ベース保持(N秒ホールド)は不採用**。クロック状態が増える([[venue-seats-lastupdate-clock-mismatch-v1044]]の既知地雷)うえ、「本当に逆転した人」の反映まで遅延する。スコアは配信中単調非減少(count累積・hasGiftラッチ・giftPoints累積)なので、バンド境界での往復振動は原理上起きず、時間軸なしで安定する。
- **スコアカーブ(`resolveVenueRegularScore`)の変更は不採用**。どんなカーブでも僅差は生じるため根治にならず、VIP判定・席バッジと共有するスコア源の意味論を変えてしまう(地図4章のdrift防止制約に抵触)。

バンドの実効挙動(BAND=8・地図3.1の実測値より):

| count | score | band |
|---|---|---|
| 1 | 10.27 | 1 |
| 2 | 16.27 | 2 |
| 3 | 20.53 | 2 |
| 4 | 23.84 | 2 |
| 5 | 26.54 | 3 |
| 7 | 28.8 | 3 |
| 8 | 32.5 | 4 |
| ギフト | +30 | +3〜4 |

→ 序盤の主戦場2〜4コメが同一バンドに畳まれ、1コメント差の逆転が消える。逆転はバンド跨ぎ(例: 2コメの現職に対し挑戦者が5コメ到達)でのみ、**同一commit内で即時に**起きる。ギフトは+30点≒3〜4バンドで即座に決定的逆転=「ギフト=大応援」の価値序列([[effect-intensity-respects-value-hierarchy]])と整合。

### 地図6章の4問への回答(設計判断)

**Q1. ヒステリシスの解除条件(数式)**:

```
band(x) = Math.floor(score(x) / VENUE_SUPPORTER_RANK_BAND)   // BAND = 8
挑戦者が現職を追い越す ⇔ band(挑戦者) > band(現職)
```

固定マージンでも相対比率でもなく**絶対バンド**。時間条件なし。ソートキー全体は(辞書式・上から優先):
1. `band`降順
2. `prevIndex`昇順(前回安定化順の位置。前回リストに居なければ`+Infinity`)
3. `score`降順
4. `count`降順
5. `key`昇順

重要な性質: **prevOrderKeysが空のとき、この順序は素の`rankVenueContributors`順(score降順→count降順→key昇順)と完全一致する**(bandはscoreの単調関数なので「band降順→score降順」≡「score降順」)。つまり初回commit・配信切替直後・既存テストの挙動は不変。

**Q2. 最低発言数の底上げ: しない**。`minScore=1`(既定`VENUE_VIP_REGULAR_MIN_SCORE`)を維持。根拠: venueSeats.js:288-294に記録されたv0.1.739の実測=「実際のニコ生では席に座る名前付きユーザーの発言は1〜5回が大多数」であり、絶対閾値は「誰も光らない」空白を生んだ前科がある。count≥2に上げると大半の実配信で序盤のバーが空になり「全員主役」方針(venueSeats.js:711のコメントにも明記)に反する。チラつきはヒステリシスだけで解決でき、底上げは不要。

**Q3. 状態を持つ場所: 純関数側(venueSeats.js)に新関数**。ただし`rankVenueContributors`本体は一切変更しない(VIP候補選定との共有=drift防止の正本venueSeats.js:313-315を保護)。新純関数`stabilizeVenueSupporterOrder`を`buildVenueSeating`内の後段に挟み、その**単一の安定化済み順序から`rankByKey`(席バッジ)と`topSupporters`(トップバー)の両方を導出**する。理由:
- `renderTopBar`側(描画レイヤー)だけで安定化すると、席バッジ`venueRank`は素の順のまま揺れ続け、**バーの1位と席の🥇が食い違う新しいdrift**が生まれる(地図5章第3項の警告そのもの)。buildVenueSeating内なら両者は同一tick・同一ソースで一貫する。
- 純関数ならvitestでDOMなしに全ケース検証できる(venueSeats.jsの設計思想「DOM操作は無い(テストしやすい設計)」を踏襲)。

**Q4. 状態の持ち回し方: `prevSeatByKey`と同型のprevXxx引数パターン**。venueBar.jsの閉包変数`supporterOrderKeys`(`seatByKey`の隣・line 3213)→`buildVenueSeating`のopts`prevSupporterOrderKeys`→戻り値`supporterRank.orderKeys`を書き戻す。理由:
- `assignVenueSeats`/`prevSeatByKey`の既存先例と完全に一貫(venueSeats.js:682-685で既にランキングにもprevを渡す前例あり)。
- **状態のライフサイクルを`seatByKey`と同一化**できる=配信切替リセット(venueBar.js:4716 `seatByKey = new Map()`)と同じ場所で`supporterOrderKeys = []`するだけで、リセット漏れ(前配信の現職を持ち越す事故)を構造的に防げる。モジュールスコープ変数をvenueSeats.js側に持つと純関数性が壊れ、venueBar側に持つと`renderTopBar`系の描画dedup状態(`_lastTopBarSig`等)とランキング状態が混ざる。

## 3. User Stories

1. **空の状態**: 参加者ゼロ(または全員score<minScore)→`topSupporters`は空配列、`supporterRank.orderKeys`も空。`renderTopBar`の既存空ガード(venueBar.js:4116-4119)がそのまま働き、バーは出ない/畳まれない。クラッシュしない。
2. **序盤の僅差**: A(2コメ)・B(1コメ)・C(1コメ)が居てB・Cに交互にコメントが来る→Bが2コメ(band2)到達時にAと同バンドとなり**prevIndexでAが上のまま**。Bが5コメ(band3)に到達して初めてAを追い越す。1位バッジの入れ替わりは「毎コメント」から「バンド跨ぎの節目のみ」へ。
3. **明確な逆転**: 2位Bがギフト送信(+30点≒+3〜4バンド)→**同じcommitで即座に**1位バッジがBへ移る。遅延なし(時間ベース保持を採らなかった効能)。
4. **配信切替時のリセット**: `activeLiveId`変化(venueBar.js:4713ブロック)で`supporterOrderKeys = []`→新配信は素のscore順から開始。前配信の現職特権は持ち越さない(`clearDisplay`が既にトップバーを畳む挙動とセット)。
5. **ランキングから落ちる側**: 現職がparticipantsから消えた(**司令塔裏取りで確認: `pruneRoster`が窓超え/LRUで在席から実際にdeleteする経路が存在する。venueLiveRoster.js:134-136**)場合、`droppedKeys`計器に記録して自然除外。バー表示人数が減るcommitはsigが変わり正しく再描画される(v0.1.1037-1042「消す側」教訓への対応)。
6. **VIP演出との将来整合**: `selectVenueVipRegularKeys`は現在`vipRegular:false`で無効(venueBar.js:4150-4151)。今回不変更。将来再有効化する際、VIPは**順序なし集合**なのでバンド内入れ替えの影響は受けないが、「バッジ上位3人が必ずVIP集合に含まれる」見た目の一貫性が欲しければstabilized順のheadを食わせる改修を**その時に**判断する(本仕様のFurther Notesに明記して申し送り)。

## 4. Implementation Decisions

変更ファイルは2つのみ。新規ファイルなし。

### 4.1 `src/lib/venueSeats.js` — 新純関数+定数

```js
/** 応援者ランキングのヒステリシス・バンド幅(点)。count1→2の跳ね(+6.0点)が
 *  同一バンドに畳まれやすく、ギフト(+30点)は3〜4バンド跳ねて即逆転する幅。 */
export const VENUE_SUPPORTER_RANK_BAND = 8;

/** 前回順として持ち回すkey数の上限(バー8人×3の余裕。これ以下は非表示ゾーン=視覚churnなし)。 */
export const VENUE_SUPPORTER_ORDER_KEEP = 24;

/**
 * @param {Array<{ key: string, score: number, count: number }>} ranked
 *   rankVenueContributorsの出力(score降順)。この関数は再スコアリングしない。
 * @param {ReadonlyArray<string>} [prevOrderKeys] 前回の安定化済みkey列(先頭=1位)
 * @param {{ band?: number, keep?: number }} [opts]
 * @returns {{
 *   order: Array<{ key: string, score: number, count: number }>,  // 安定化済み全順位
 *   orderKeys: string[],      // 次回prevOrderKeysに渡す(keep件に切詰め)
 *   droppedKeys: string[],    // prevに居たが今回rankedに居ないkey(消す側の計器)
 *   overtakeCount: number     // prevの順位関係がバンド跨ぎで逆転した組数(prev同士の転倒数)
 * }}
 */
export function stabilizeVenueSupporterOrder(ranked, prevOrderKeys, opts = {})
```

実装規定:
- `prevIndex`は`prevOrderKeys`上の位置(Map化してO(1)参照)。不在は`Number.POSITIVE_INFINITY`。
- ソートキーは§2 Q1の5段辞書式。key昇順まで完全にタイブレークするので`Array.sort`の安定性にすら依存しない。
- `overtakeCount`は「prevに両方居る要素ペアのうち、最終順序がprevと逆になった組数」(prev側はkeep≤24件なのでO(k²)で十分軽い)。
- 不正入力(非配列・key無し要素・prevの重複key)は既存関数群と同じ流儀で黙って無視(fail-safe)。

### 4.2 `src/lib/venueSeats.js` — `buildVenueSeating`の変更(venueSeats.js:673)

- optsに追加: `prevSupporterOrderKeys?: ReadonlyArray<string>`、`supporterRankBand?: number`(テスト/実配信チューニング用の注入口)。
- 現在`rankVenueContributors`が`selectVenueTopRankKeys`内(line 701-708、内部で369行目に呼び出し・司令塔裏取り済み)とtopSupporters用(line 718-721)で**2回**呼ばれているのを**1回に統合**し、その結果を安定化に通す:

```js
const contributorOpts = {
  commentCap: opts.vipRegularCommentCap,
  giftPointsCap: opts.vipRegularGiftPointsCap
};
const stabilized = stabilizeVenueSupporterOrder(
  rankVenueContributors(participants, contributorOpts),
  opts.prevSupporterOrderKeys,
  { band: opts.supporterRankBand }
);
// 席バッジ: stabilizedの先頭topRankN件から。selectVenueTopRankKeysは呼ばなくなるが削除しない。
const rankByKey = topRankN > 0
  ? new Map(stabilized.order.slice(0, topRankN).map((r, i) => [r.key, i + 1]))
  : new Map();
// トップバー: 同じstabilizedからslice(0, topSupportersN)(rank = 安定化順のidx+1)。
```

- 戻り値に追加: `supporterRank: { orderKeys, droppedKeys, overtakeCount }`。
- minScoreの既定(=1)は`rankVenueContributors`内で従来通り適用される(挙動不変)。
- `selectVenueTopRankKeys` / `selectVenueVipRegularKeys` / `rankVenueContributors`の**シグネチャ・実装は不変更**(公開API・既存テスト・VIP経路の保護)。

### 4.3 `src/extension/venueBar.js` — 配線(4箇所・すべて既存パターンの隣)

1. **状態宣言**(line 3213 `let seatByKey = new Map();`の隣・司令塔裏取り済み):
   `let supporterOrderKeys = [];`と計器`let _supporterRankDrops = 0; let _supporterRankOvertakes = 0;`
2. **renderSeatsのbuildVenueSeating呼び出し**(line 4145-4152)に`prevSupporterOrderKeys: supporterOrderKeys`を追加。
3. **書き戻し**(line 4154 `seatByKey = seating.seatByKey;`の直後):

```js
supporterOrderKeys = seating.supporterRank.orderKeys;
_supporterRankDrops += seating.supporterRank.droppedKeys.length;
_supporterRankOvertakes += seating.supporterRank.overtakeCount;
// 消す側の計器(値が変わったときだけ書く=diff-skip文化に合わせる)
if (topBar.dataset.rankDrops !== String(_supporterRankDrops))
  topBar.dataset.rankDrops = String(_supporterRankDrops);
if (topBar.dataset.rankOvertakes !== String(_supporterRankOvertakes))
  topBar.dataset.rankOvertakes = String(_supporterRankOvertakes);
```

4. **配信切替リセット**(line 4713-4716ブロック内・司令塔裏取り済み): `supporterOrderKeys = []; _supporterRankDrops = 0; _supporterRankOvertakes = 0;`

`renderTopBar`(line 4113)と`_lastVenueRankByNode`(line 4396付近)は**一切変更しない**。安定化は上流で済んでおり、sigの変化頻度が下がるのは意図通り(sigは内容ベースであり時間ベースでないため「再描画されなくなる」副作用は起きない — 地図5章第2項の懸念への回答)。

## 5. Testing Decisions

すべて`src/lib/venueSeats.test.js`(vitest・コロケーション・日本語it名の既存流儀)に追加。出荷ゲートは`npm run verify:cc`一本。

```
describe('stabilizeVenueSupporterOrder(応援者ランキングのヒステリシス)')
  it('prevOrderKeysが空なら素のscore降順と完全一致(初回・後方互換)')
  it('同一バンド内では前回の並びを維持する(1コメント差では入れ替わらない)')
  it('バンドを跨いだ挑戦者だけが追い越す(2コメ現職 vs 5コメ挑戦者)')
  it('ギフト送信者(+30点)は同一commitで即座に上位へ')
  it('新規参加者は同一バンドでは現職の下に入る(prevIndex優先)')
  it('現職がrankedから消えたらdroppedKeysに載る(消す側の計器)')
  it('overtakeCountがバンド跨ぎ逆転の組数を数える')
  it('orderKeysはkeep件(既定24)に切り詰められる')
  it('決定論: 同一入力で2回呼んでも同一出力')
  it('不正入力(非配列prev / 重複key / key欠落要素)で落ちない')

describe('buildVenueSeating × supporterRank(安定化の一気通貫)')
  it('prevSupporterOrderKeysを渡すとtopSupportersと席のvenueRankが同じ安定順を共有する(driftしない)')
  it('supporterOrderKeysを次回prevに渡す2tickシミュレーションで僅差入れ替えが起きない')
  it('序盤シナリオ回帰: 1〜2コメ帯で交互にコメントが来ても1位が毎commitで交代しない')
  it('prevSupporterOrderKeys未指定なら従来挙動(既存topSupporters/venueRankテストが緑のまま)')
```

- 2tickシミュレーションは**本番の`buildVenueSeating`を実import**して回すこと([[integration-test-must-import-real-code]] — 手書きコピーの偽装テスト禁止)。
- reality-checker検証時の変異テスト指示: ソートキーから`prevIndex`段を一時削除→ヒステリシス系テストが赤くなることを確認して復元(v0.1.1189で実施した変異検証と同型)。
- venueBar.js側の配線ミス(import忘れ・opts渡し忘れ)はlintが捕捉([[verify-cc-lint-catches-unwired-import-2026-07-07]])。DOMテストは追加しない(既存文化=ロジックはlib側で検証、実機は反映3手順後の実配信で`topBar.dataset.rankDrops/rankOvertakes`と1位バッジの静止を目視/状態速報確認)。

## 6. Out of Scope

- **VIP演出(金色オーラ)の再有効化**: しない。`vipRegular:false`のまま。`selectVenueVipRegularKeys`も不変更。
- **席バッジvenueRankの安定化**: **今回の対象に含む**(明言)。同一stabilized源から導出するため追加コストゼロであり、除外するとバーの1位と席の🥇が食い違う新driftを生むため。
- 席割りそのもの(`assignVenueSeats`/`rankVenueParticipants`)の変更: しない(prevSeatByKeyで安定済み)。
- スコア式`resolveVenueRegularScore`(重み・commentCap・logカーブ)の変更: しない。
- `renderTopBar`のDOM構造・sig-skip・空ガードの変更: しない。
- 時間ベースの表示保持(N秒ホールド): 不採用(§2で理由記載)。
- 状態速報(statusFastDiag)への計器の正式配線: 今回は`topBar`のdataset属性+閉包カウンタまで。lite passthrough([[fastdiag-lite-is-the-printer-subset]])を伴う正式配線は実配信で必要と判明したら次フェーズ。
- renderSeats全体のsig-skip/diff-skip再導入: **禁止事項として遵守**(v0.1.1032撤回済み)。本設計はランキング計算の上流1点のみに介入し、描画パイプラインには触れない。

## 7. Further Notes(実装時の注意・地雷)

1. **非推移comparatorの禁止**: 「差がM点で逆転」をペアワイズ比較で書き直したくなっても不可(§2冒頭の循環反例)。必ずバンド量子化+5段辞書式キーのまま実装すること。
2. **後方互換の要**: prev空⇔素のscore降順、の恒等性(bandがscoreの単調関数であること)が既存テスト緑維持の根拠。BANDを「scoreの非単調な変換」に変えるとこの恒等性が壊れる。
3. **スコア単調非減少の前提と反例(司令塔裏取りで確定)**: count累積・hasGiftラッチ・giftPoints累積により**個々のparticipantのスコアは下がらない**が、**`pruneRoster`(venueLiveRoster.js:134-136)が窓超え/LRU満席時に参加者を在席リストから丸ごとdeleteする**ため、「スコアが下がる」のではなく「参加者ごと消える→再度発言すればスコア0から再スタート」という経路が実在する。これは§7の想定通り`droppedKeys`計器でカバーされる設計だが、**再入室後に一時的に順位が下がって見える(元の常連が新規扱いでbandが低く復帰する)ことはある**。これは既存のprevSeatByKey方式の席割りにも同型の挙動があり(一定時間で席喪失後は新規復帰)、本設計だけの新規リスクではないため許容する。
4. **`selectVenueTopRankKeys`は削除しない**: buildVenueSeating内部では使わなくなるが、公開APIとして既存テスト(venueSeats.test.js:316-332等)が依存。
5. **リセットの不変条件**: `supporterOrderKeys`は「`seatByKey`がリセットされる場所では必ず一緒にリセット」。現在それはline 3213(初期化)とline 4716(配信切替)の2箇所。`resetSpeechTracking`(line 3920付近)はseatByKeyを触らないので対象外。
6. **検証運用の地雷**: reality-checker実行中にcommitしない([[reality-checker-stash-detaches-head-2026-07-07]])。新規ファイルは作らないのでtree-map再生成は原則不要だが、`verify:cc`が最終判定。version bumpは1変更=patch 1つ+manifest/package/changelog同期+ユーザー反映3手順の併記(AGENTS.md §12.5)。
7. **`buildVenueSeating`の呼び出しはvenueBar.js内でline 4145の1箇所のみ**(line 4218-4222は`collectAudienceFaceUserIds`であり別物・司令塔裏取り済み)。配線漏れの心配はrenderSeats経路だけ見ればよい。

---

## 未解決の質問(実装前にユーザー判断が要る場合のみ確認、それ以外はデフォルト方針で進めてよい)

1. **計器の正式配線**: `rankDrops`/`rankOvertakes`を状態速報(statusFastDiag full+lite passthrough)へ載せるか。今回はdataset属性止まり。実配信でlagVerdict同様の遠隔切り分けが必要になった時点で判断。
2. **BAND=8の最終値**: 実配信最適化ではなく設計判断。`supporterRankBand`optsで注入可能にしてあるので、実配信で「粘りすぎ/まだ揺れる」が観測されたら6〜12の範囲で調整(コード変更は定数1つ)。
3. ~~count減少経路の実在~~ → **司令塔裏取りで確定済み**(Further Notes 3参照)。追加確認不要。
4. **再オープン時のリセット**: `resetSpeechTracking`(配信切替・再オープン)経由で`supporterOrderKeys`もリセットすべきか。本仕様は「seatByKeyと同一ライフサイクル」原則で不要と判断(3213/4716の2箇所のみ)。
5. 地図5.1の「たぬ姉」列がtopSupporters由来かの実機確認は、反映3手順後の初回配信で行う。

## 仕様に根拠がない断定(assumption list)

- `VENUE_SUPPORTER_RANK_BAND = 8`という具体値(実測表からの設計判断であり実配信での最適値ではない。opts注入で調整可能)。
- `VENUE_SUPPORTER_ORDER_KEEP = 24`という具体値(バー8人×3の余裕という設計判断)。
- topBarのdataset属性が既存のDOM census系計器(venueDomCensus)から観測可能である(同計器の実装詳細は未読)。
- 拡張のターゲット環境(Chrome)で`Array.sort`はES2019安定ソート保証がある(ただし本設計はkey昇順まで完全タイブレークするため、この仮定が崩れても決定論は保たれる)。
