# 地図(wayfinder): 会場「応援者ランキング」チラつきの実装地図

> wayfinder→to-spec方式・手順1(地図)。コードはまだ変更していない。事実には参照先を付け、推測は「推測」と明記する。

## 1. 入口になる画面・データフロー

- 画面: 会場モード(standalone)の「たぬ姉」列トップバー(応援者トップNバー、画像で確認した「1位バッジが入れ替わる」表示)。
- 呼び出し起点: [venueBar.js:5060](src/extension/venueBar.js) `scheduleRosterCommit`(rAFで1フレーム1回に間引き済み)、または[venueBar.js:5002](src/extension/venueBar.js)`commitDisplay`直接呼び出し(発言者の即着席経路)。どちらも最終的に`renderSeats(rows)`を呼ぶ。
- データが流れる順番:
  1. 発言行(rows)が`liveRoster`/`baseRows`として蓄積される(コメント到着のたびに更新)。
  2. `renderSeats(rows)` [venueBar.js:4138](src/extension/venueBar.js) が呼ばれる。
  3. `buildVenueSeating(incomingRows, opts)` [venueSeats.js:673](src/lib/venueSeats.js) が participants を集計し、席割り(`seats`)と応援者トップN(`topSupporters`)の両方をこの1回の呼び出しで生成する。
  4. `topSupporters`は`rankVenueContributors(participants, opts)` [venueSeats.js:321](src/lib/venueSeats.js) の結果を`slice(0, topSupportersN)`しただけ(既存コメント: 「スコア源は席の順位バッジ(rankByKey)と共有、drift しない」[venueSeats.js:710](src/lib/venueSeats.js))。
  5. `renderSeats`が`renderTopBar(seating.topSupporters)` [venueBar.js:4156](src/extension/venueBar.js) を呼び、DOMへ反映。

## 2. 関係する主要ファイルと責務

| ファイル | 責務 |
|---|---|
| `src/lib/venueSeats.js` | 純関数群。参加者集計・スコアリング・順位付け・席割り。DOM操作は無い(テストしやすい設計)。 |
| `src/extension/venueBar.js` | DOM描画本体(4000行超)。`renderSeats`/`renderTopBar`がscore計算結果をDOMへ反映する。 |
| `src/lib/venueViewport.js` | 表示件数の絞り込み(`selectStableVisibleMembers`)・レイアウト計算。席表示の「安定選択」の既存実装がここにある。 |

## 3. コアロジックの中身(事実ベース)

### 3.1 スコア計算: `resolveVenueRegularScore` [venueSeats.js:252](src/lib/venueSeats.js)

```
score = 100 * (0.55 * commentNorm + 0.30 * giftFlag + 0.15 * giftPointsNorm)
commentNorm = min(1, log1p(count) / log1p(commentCap=40))
```

実測値(count 0〜5、giftFlag=0のとき):
| count | score |
|---|---|
| 0 | 0.000 |
| 1 | 10.266 |
| 2 | 16.271 |
| 3 | 20.532 |
| 4 | 23.837 |
| 5 | 26.537 |

count=1→2だけでscoreが約58%増加する(事実・上記コマンドで検算済み)。

### 3.2 順位付け: `rankVenueContributors` [venueSeats.js:321](src/lib/venueSeats.js)

```js
scored.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  if (b.count !== a.count) return b.count - a.count;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
});
```
score降順→count降順→key辞書順。決定論的(同一入力なら同一出力)。**状態を持たない=前回の順位を一切参照しない**(毎回ゼロから計算)。これが「入れ替わりやすさ」の直接原因。

### 3.3 描画側のdiff-skip: `renderTopBar` [venueBar.js:4113](src/extension/venueBar.js)

```js
const sig = list.map((x) => `${x.rank}:${x.participant?.key || ''}`).join('|');
if (sig === _lastTopBarSig && _topBarShownOnce) return;
_lastTopBarSig = sig;
```
sigが変わらなければDOMを触らない。**これは「無駄な再描画」を防ぐものであって、「ランキングの中身が実際に変わった」場合はsigが変わるので素通りする**。今回の症状はここではなく、3.2の順位計算そのものが揺れている。

### 3.4 バッジのdiff-skip: `_lastVenueRankByNode` [venueBar.js:4396-4405](src/extension/venueBar.js)

```js
if (_lastVenueRankByNode.get(node.seat) !== venueRank) {
  if (venueRank >= 1 && venueRank <= 3) node.seat.dataset.venueRank = String(venueRank);
  else delete node.seat.dataset.venueRank;
  _lastVenueRankByNode.set(node.seat, venueRank);
}
```
v0.1.1182で追加。**同一座席ノードのvenueRank属性が不変なら書き込みをスキップする**局所diff-skip。これはバッジの明滅(delete→再代入の無駄書き込み)を直したものであり、「誰が1位か」自体の入れ替わりには無関係(座席ノードが変われば当然venueRankも変わる)。

### 3.5 既存の「安定選択」パターン(参考になる先例)

- `assignVenueSeats` [venueSeats.js:492](src/lib/venueSeats.js): `prevSeatByKey`を受け取り、前回座っていた人の席を最優先で維持する(1)→新規参加者で残り席を埋める(2)、という2段階アルゴリズム。**「一度座った人は理不尽に追い出されない」という考え方が既に席割りには実装されている**が、topSupportersランキングには同じ考え方が適用されていない(推測ではなく構造的事実: `rankVenueContributors`はprevの状態を一切受け取らない)。
- `selectStableVisibleMembers` [venueViewport.js:133](src/lib/venueViewport.js): 表示件数を絞る際に「直近発言者を先に確保→残り枠を元順で埋める→表示は元の並び順に戻す」という安定化ロジック。順位そのものではなく「表示するかどうか」の安定化。

## 4. 既存の設計判断とその根拠(壊してはいけない境界)

1. **renderSeats全体のsig-skip/diff-skip再導入は禁止**。v0.1.1032で実機ちらつき回帰を招き撤回済み([[venue-lobby-removal-2026-07-14]]系メモリに記録)。局所的な対策に限定すること。
2. **応援レーンchurn根治(v0.1.1037-1042)の教訓**: 「消す/空にする側」に計器・diff-skipが無かったことが真犯人だった([[story-userlane-churn-fillanetier-v1039]])。ランキングから「落ちる」側の挙動を軽視しないこと。
3. **スコア源の単一化(drift防止)**: `selectVenueVipRegularKeys`(VIP演出候補)と`rankVenueContributors`(順位バッジ+topSupporters)は同じ`resolveVenueRegularScore`を共有する設計判断([venueSeats.js:313-315](src/lib/venueSeats.js)のコメントに明記)。対策がこの共有を壊すと再びdriftする。
4. **決定論であること**: `Math.random`等の非決定要素はプロジェクト全体で使用禁止(voice-lag-decomposition実装時にも確認済みの既存方針)。
5. **「一度光った人が理不尽に沈黙で消えない」**という会場全体の演出方針([[effect-intensity-respects-value-hierarchy]]系メモリに近い価値観、ただしこれは直接ランキングに言及したものではなく類推)。

## 5. 変更すると壊れうる箇所

- `rankVenueContributors`はVIP演出候補選定(`selectVenueVipRegularKeys`)からも呼ばれる共有関数。ここに状態(前回の順位等)を持ち込むと、VIP演出判定にも影響が及ぶ可能性がある(要調査事項、5.1参照)。
- `renderTopBar`の`sig`ベースdiff-skipは、ランキング内容(rank+key)が変わったら必ず再描画する前提で書かれている。ランキング側にヒステリシスを入れると、sigの変化頻度自体が下がり、意図とは別の副作用(例: 一定時間再描画が起きなくなる)が生じないか確認が必要。
- `buildVenueSeating`は`seats[].venueRank`(席バッジ)と`topSupporters`(トップバー)の両方に同じ`rankByKey`/`rankVenueContributors`の結果を使っている。ランキング側だけを安定化させ、席バッジ側は従来通りにする場合、二重管理にならないよう設計に注意。

### 5.1 未確認の前提(要追加調査)

- `selectVenueVipRegularKeys`は現在`vipRegular: false`で呼び出し元から無効化されている([venueBar.js:4151](src/extension/venueBar.js) `vipRegular: false`コメント「光らせ演出(金色オーラ)はユーザー要望で無効」)。**つまり現状、VIP演出自体は動いていない**。ヒステリシスをrankVenueContributors側に入れても、VIP演出(現在無効)への影響は実質ゼロと推測されるが、将来再有効化されたときに二次影響が出る可能性がある(未確認)。
- `topSupportersN`の既定値(`VENUE_TOP_SUPPORTERS_BAR`)が何人分か、および画像で見えた「たぬ姉」列が本当に`topSupporters`由来か、それとも別の集計(`rankByKey`経由の席バッジ)由来かは、ユーザー提供のスクリーンショット1枚からの推測に留まる(会場モードの実画面構造とラベル対応の追加確認が望ましいが、コード読解上は「1位/2位/3位のバッジ付き列」に該当する処理は`renderTopBar`のみ)。

## 6. 実装前に決める必要がある質問

1. **ヒステリシスの解除条件**: 「一度1位になった人は、どれだけ差が開いたら/どれだけ時間が経ったら明け渡すべきか」の具体的な閾値をどう決めるか(固定マージンか、相対比率か)。
2. **最低発言数の底上げ**をする場合、「誰もランキングに乗らない」空白期間の許容度(既存方針「全員主役」との整合)。
3. **表示安定化(N秒間は前回の並びを保持)**を入れる場合、スコア計算(`rankVenueContributors`)自体を変えるのか、それとも`renderTopBar`呼び出し側(topSupporters配列を受け取った後)で時間ベースの安定化レイヤーを1枚挟むのかの設計選択。後者なら`rankVenueContributors`(共有関数)には手を入れず`renderTopBar`または新規の中間関数だけで完結できる可能性がある(要Fable検討)。
4. **状態の持ち回し方**: `venueBar.js`はモジュールスコープの状態変数(`_lastTopBarSig`等)を既に持っている。新しい安定化ロジックの状態(前回1位のkey、そのkeyが1位になった時刻等)もこのパターンを踏襲するのが自然か、それとも`buildVenueSeating`に`prevTopSupporters`的な引数を追加して純関数側に寄せるべきか(後者は`assignVenueSeats`の`prevSeatByKey`パターンと一貫するが、呼び出し元でその状態を保持・受け渡す配線が増える)。
