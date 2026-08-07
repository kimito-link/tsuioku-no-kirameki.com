# three-screen-verdict-DESIGN.md — 3画面突合判定（①POP / 会場 / ③WEB鏡）設計書

- 作成: 2026-08-07（council素材 + 司令塔裏取り事実に基づく Fable 設計）
- 状態: 設計のみ。実装未着手。
- 発端の実機事象（同一時刻・同一配信）: ①POP=0件描画（domTilesPainted:0 / entriesLen:21 /
  heavySettleState:"empty-covered"）／会場=76人表示／③WEB鏡=21件。
  人間がスクショ2枚を並べて初めて「①だけ壊れている」と分かった。
- 制約（最優先）: **新しい観測点・storageキー・ポーリング・パネルは一切作らない。**
  足してよいのは「既存の値を突き合わせる純ロジック」だけ。出力は速報の1行。

---

## A. 理想の体験

ユーザーは状態速報を1回コピーするだけで、次のどれかが**1行**で分かる:

- 「①（拡張パネル）だけが壊れている。会場と記録は無事。popupを開き直せばよい」
- 「会場だけが壊れている。watchをF5すればよい」
- 「①が最近データを共有していない（鏡が古い）。popupを開いたままにすればよい」
- 「材料が足りず判定できない。数十秒後にもう一度コピーすればよい」

**この判定は「3画面一致✅」を絶対に主張しない。** 緑を名乗る行はこの機構には存在しない
（理由は §Q6。健全時は沈黙し、既存の画面別診断行に任せる）。

---

## B. 判定アーキテクチャ（3層・コンポーネント3個）

```
[入力層]  既存diagの読み出しのみ（新規観測ゼロ）
   ①: buildStoryUserLaneRenderDiag の戻り
       （verdict / domTilesPainted / entriesLen / lastRunAgoMs / heavySettleState）
   会場: buildVenueLaneParity の戻り
       （mode / mirrorAgeSec / visibleShown / painted）
   鏡: KEY_LANE_MIRROR スナップショット（capturedAt / buckets 5段の合計件数）
        │
[純ロジック層]  judgeThreeScreen(snapshot) … 新規ファイル1つ・純関数1つ（§E）
   B-1 世代アンカー検査 … 3値が「同じ鏡世代」を見ているかを capturedAt で束ねる（§Q2）
   B-2 判定表        … 片側証拠の論理結合。等値比較は一切しない（§C）
        │
[出力層]  既存速報フォーマッタに1行追加（新パネル禁止）
   verdict ∈ { pop_broken | venue_broken | mirror_stale | indeterminate | silent }
   silent のとき行は出さない
```

- 入力層は**読むだけ**。3つの値は今日すでに速報/診断に存在していたもの（実機事象の
  0 / 76 / 21 はすべて既存計器の出力）。
- 純ロジック層は DOM / chrome.* / Date.now 非依存（nowMs を引数で受ける）= 単体テスト可能。
- 出力層は速報の組み立て済み関数（formatLines 系）への1行差し込みのみ。

---

## Q1【判定ロジック】どれが壊れていると言い切れるか

### 原則: 「件数の等値比較」で言い切ろうとしない。「片側証拠の合成」で言い切る。

①=0 / 会場=76 / 鏡=21 を「数が違うから異常」と読むのは不可能（数え方が違う・上限が違う・
時刻が違う）。言い切れるのは次の**構造**があるからである:

1. **鏡は①だけが書く**（唯一の書き手）。鏡に21件あり capturedAt が新しい
   → ①の供給パイプラインは publish 時点まで生きていた、という①自身の物証。
2. **①の自己申告**: `verdict === 'source_but_no_dom'`（entriesLen>0 ∧ domTilesPainted===0、
   storyUserLaneRenderProbe.js 行421 で既存）＝「供給はあるのに私は描けていない」。
3. **他の読み手の生存証明**: 会場が `mode:'mirror'` で `visibleShown>0`、かつ鏡世代が
   新鮮（§Q2）→ 同じ鏡を読んで**描けている画面が実在する**＝鏡・storage・描画対象データは無罪。

この3つが同時に立つとき、消去法ではなく**陽性証拠の合成**で「①の描画だけが壊れている」と
言い切れる。各証拠は自分の画面のことしか主張しない（片側証拠）ので、画面間の同時刻等値性を
一切要求しない。これが Q2 の穴を判定ロジック側から塞ぐ土台になる。

### 言い切り条件（裏取り済みの値のみ使用）

**🔴 pop_broken（①が壊れている）** — 3条件AND:
- ①: `probe.verdict === 'source_but_no_dom'` ∧ `lastRunAgoMs !== null` ∧
  `lastRunAgoMs <= VENUE_LANE_MIRROR_SOFT_WINDOW_MS`（自己申告が新鮮）
- 会場: `mode === 'mirror'` ∧ `visibleShown > 0` ∧ 世代アンカー成立（§Q2）
- 鏡: `capturedAt > 0` ∧ `nowMs - capturedAt <= SOFT` ∧ buckets合計 > 0

**🔴 venue_broken（会場が壊れている）** — 対称形:
- ①: `probe.verdict === 'ok'` ∧ `domTilesPainted > 0` ∧ `lastRunAgoMs <= SOFT`（①は描けている）
- 会場: `mode === 'mirror'` ∧ `visibleShown === 0` ∧ 世代アンカー成立
- 鏡: 新鮮 ∧ buckets合計 > 0

**🟡 mirror_stale（鏡が古い＝①が最近publishしていない）**:
- `capturedAt <= 0` または `nowMs - capturedAt > SOFT`。
  `> HARD(900s)` なら「popup実質不在」級として文言を強める（venueLaneParity.js の既存二段窓と
  同じ意味論。会場が fallback 降格する閾値と判定の閾値が一致するので画面と速報が矛盾しない）。
- mirror_stale は pop_broken / venue_broken より**優先**（古い鏡を根拠に画面を有罪にしない）。

**⚪ indeterminate（判定不能）**: 上記の必要材料が1つでも欠けたとき（§Q2の表参照）。
**silent（沈黙）**: どの行も立たないとき。行を出さない。健全の主張は既存の画面別診断に任せる。

---

## Q2【同一時刻の保証】★最重要 — 「世代アンカー」方式

### 批判役の穴の正確な言い直し

3つの diag は別tick・別書き手で storage に書かれる。「タイムスタンプが付いている」ことと
「同じ瞬間を写している」ことは別物。等値比較を前提にする限りこの穴は塞げない。

### 塞ぎ方（2段構え）

**(1) そもそも同時刻等値性を要求しない判定にする（§Q1の片側証拠方式）。**
「①の0件」と「会場の76件」を突き合わせるのではなく、各画面が**自分の観測時点**で立てた
自己申告フラグ（source_but_no_dom / visibleShown>0）を、各々の鮮度ゲート付きで合成する。
片側証拠は多少時刻がずれても意味が変わらない（「①は直近3分以内のどこかで描けていなかった」
∧「会場は直近3分以内のどこかで描けていた」は、同時刻でなくても「①だけ壊れている」を含意する
— ①が3分窓内で自然回復するなら次回コピーで silent に戻るだけで、誤断罪にはならない）。

**(2) それでも残る「会場の申告がどの時点のものか不明」問題を、鏡の capturedAt を
共通の世代番号として使って束ねる（世代アンカー）。**

鏡は①だけが書く単一ソースなので、`capturedAt` は3画面が共有する唯一の「世代ID」である。
- 判定側は今 `mirrorAgeNowSec = (nowMs - capturedAt)/1000` を計算できる。
- 会場は自分が paint した時点の鏡年齢 `mirrorAgeSec` を申告している（venueLaneParity.js 行150）。
- 両者が**同じ鏡世代**を見ていれば、`skewSec = mirrorAgeNowSec - venue.mirrorAgeSec` は
  「会場が観測してから今までの経過秒」の上界になる。

判定:

| skewSec | 意味 | 扱い |
|---|---|---|
| 0 ≦ skew ≦ SOFT/1000 (180) | 会場の申告は180秒以内の観測 | 世代アンカー成立=会場証拠を採用 |
| skew < 0 | 会場は今読んだ鏡より**新しい**鏡を見ていた=判定と会場の間で鏡が再publishされ世代がずれた | ⚪ indeterminate |
| skew > 180 | 会場の申告が古すぎる | ⚪ indeterminate |
| venue.mirrorAgeSec === -1 または capturedAt <= 0 | 年齢不明（既存の -1 セマンティクス） | ⚪ indeterminate |

**保証できないときに✅が出ない仕組み**: この機構には✅が存在しない（§A・§Q6）。
保証できないとき出るのは ⚪ の1行だけで、しかも「何が欠けたか」を名指しする
（evidence.missing に 'pop_fresh' | 'venue_anchor' | 'mirror_captured_at' 等を列挙）。

**閾値の根拠（新マジックナンバーを増やさない）**: 使う定数は
`VENUE_LANE_MIRROR_SOFT_WINDOW_MS = 180_000` と `HARD = 900_000`（venueLaneParity.js
行18・34）の**再利用のみ**。SOFT は「完璧な診断シート」の W_soft としてプロジェクトが既に
裁定した「鏡が新鮮」の定義であり、①の `lastRunAgoMs` の鮮度・会場 skew の許容にも同じ値を
使うことで、「会場は鏡を新鮮扱いしているのに3画面判定は古い扱いする」という判定間矛盾が
構造的に起きない。新しい調整ノブはゼロ。

---

## C. 具体機構（関数シグネチャ・型・判定表）

### 新規ファイル: `src/lib/threeScreenVerdict.js`（純関数のみ・DOM/chrome非依存）

```js
import { VENUE_LANE_MIRROR_SOFT_WINDOW_MS, VENUE_LANE_MIRROR_HARD_WINDOW_MS } from './venueLaneParity.js';

/**
 * 3画面突合判定。既存diagの値だけを受け取り、片側証拠の合成で1判定を返す。
 * 等値比較・新観測・副作用は一切ない。
 *
 * @param {{
 *   nowMs: number,
 *   probe: null | {              // ① buildStoryUserLaneRenderDiag の戻り(の必要部分)
 *     verdict: string,           //   'source_but_no_dom' | 'ok' | 'not_started' | ...(既存のまま)
 *     domTilesPainted: number,
 *     entriesLen: number,
 *     lastRunAgoMs: number|null,
 *     heavySettleState: string   //   判定には使わず evidence への転記のみ(§D-4)
 *   },
 *   venue: null | {              // 会場 buildVenueLaneParity の戻り(の必要部分)
 *     mode: 'mirror'|'fallback',
 *     mirrorAgeSec: number,      //   -1 = 不明
 *     visibleShown: number
 *   },
 *   mirror: null | {             // 鏡 KEY_LANE_MIRROR スナップショット(の必要部分)
 *     capturedAt: number,        //   epoch ms。<=0 = 不明
 *     bucketsTotal: number       //   5段の件数合計(呼び出し側で reduce するだけ)
 *   }
 * }} snapshot
 * @returns {{
 *   verdict: 'pop_broken'|'venue_broken'|'mirror_stale'|'indeterminate'|'silent',
 *   line: string|null,           // 速報に出す1行。silent のとき null
 *   evidence: {                  // 開発者向け(速報JSONにそのまま同梱・新キー不要ならliteに1フィールド)
 *     mirrorAgeNowSec: number,   // -1=不明
 *     venueSkewSec: number|null, // 世代アンカーの skew。null=計算不能
 *     popFresh: boolean,
 *     missing: string[],         // indeterminate の理由キー列
 *     heavySettleState: string
 *   }
 * }}
 */
export function judgeThreeScreen(snapshot) { /* 純ロジック */ }
```

### 判定表（上から順に評価・最初に立った行で確定）

前提記号: `SOFT=180_000ms` / `HARD=900_000ms`（再利用）。
`mirrorAgeNow = nowMs - mirror.capturedAt`（capturedAt<=0 なら不明）。
`skew = mirrorAgeNow/1000 - venue.mirrorAgeSec`。
`popFresh = probe.lastRunAgoMs !== null && probe.lastRunAgoMs <= SOFT`。
`venueAnchored = venue.mode==='mirror' && venue.mirrorAgeSec >= 0 && mirrorAgeNow既知 && 0 <= skew <= 180`。

| 優先 | 条件 | verdict |
|---|---|---|
| 0 | probe===null ∧ venue===null ∧ mirror===null | silent（判定材料が場に無い=行を出さない。速報の他行が既に「diagなし」を報じる領分） |
| 1 | mirror===null ∨ capturedAt<=0 | indeterminate（missing:['mirror_captured_at']） |
| 2 | mirrorAgeNow > HARD | mirror_stale（popup不在級の文言） |
| 3 | mirrorAgeNow > SOFT | mirror_stale |
| 4 | probe===null ∨ ¬popFresh | indeterminate（missing:['pop_fresh']） |
| 5 | venue===null ∨ ¬venueAnchored | indeterminate（missing:['venue_anchor']） |
| 6 | probe.verdict==='source_but_no_dom' ∧ venue.visibleShown>0 ∧ mirror.bucketsTotal>0 | **pop_broken** |
| 7 | probe.verdict==='ok' ∧ probe.domTilesPainted>0 ∧ venue.visibleShown===0 ∧ mirror.bucketsTotal>0 | **venue_broken** |
| 8 | それ以外すべて | silent |

- 行6は今日の実機事象（0/76/21）をそのまま `pop_broken` と名指しする。
- 行8（silent）が既定＝**疑わしきは黙る**。緑の行は存在しない。
- 行4・5の indeterminate は「3画面判定をしようとしたのに材料が欠けた」場面に限る。
  probe.verdict が 'not_started' / 'empty_source' / 'empty_source_anonymous' /
  'errored' 等のときは行6・7の条件に合致せず行8（silent）に落ちる＝既存の画面別診断行が
  既にその症状を報じており、二重報知しない。

---

## Q3【出力の形】速報の1行（実文面）

すべて「何が壊れているか」＋「次の一手」を1行に収める。開発者語彙（verdict名・変数名）は
evidence（JSON側）にのみ入れ、行には出さない。

1. **pop_broken**
   `🔴 応援レーン: 拡張パネル(①)だけ表示が止まっています(会場と記録は正常)。対処: popupを閉じて開き直す→直らなければ拡張を🔄リロードしてください`
2. **venue_broken**
   `🔴 応援レーン: 会場だけ表示できていません(①と記録は正常)。対処: watchページをF5してください`
3. **mirror_stale（SOFT超・HARD以内）**
   `🟡 応援レーン: ①からの共有データが${mirrorAgeNowSec}秒前で止まっています。対処: popup(拡張パネル)を開いたままにしてください`
4. **mirror_stale（HARD超）**
   `🔴 応援レーン: ①からの共有データが${Math.round(mirrorAgeNowSec/60)}分前で止まっています(popupが閉じられている可能性大)。対処: popupを開いてください`
5. **indeterminate**
   `⚪ 応援レーン3画面判定: 材料不足で今回は判定できません(不足=${missingの和訳: 例「会場の観測が古い」})。数十秒おいてもう一度コピーしてください`
6. **silent** — 行なし。

---

## Q4 / D.【偽陽性の潰し方】

### 個別の潰し方

| 既知の正常な食い違い | 潰し方 | 判定表での帰結 |
|---|---|---|
| ③WEB鏡は最新60件上限（母数380で鏡60は正常） | **等値比較を機構ごと廃止**。判定が件数に問う質問は「>0 か ===0 か」だけで、上限は >0 を 0 に反転させ得ない | どの行の条件にも影響しない（構造的に発火不能） |
| 会場=着席人数 / ①=レーン人数で数え方が違う（76 vs 21） | 同上。76と21を比べるコードパスが存在しない | 同上 |
| 起動直後の数秒（各画面がゼロから埋まる途中） | ①側: `probe.verdict` を入力にする＝既存の 'not_started'（started===0）分岐が先に立ち 'source_but_no_dom' にならない。鏡側: 起動直後は capturedAt が無い/古い→行1〜3で止まる。会場側: 観測前は mirrorAgeSec=-1→行5で indeterminate | silent か indeterminate。🔴には到達しない |

### ★「例外が増えて肥大化する」リスクへの答え（批判役の自己指摘）

**judge に例外フィルタを1つも持たせない**ことで答える。構造は2つ:

1. **例外の置き場を judge の外に固定する。** judge は raw 件数ではなく各画面の
   「自己申告 verdict」を入力にする。匿名主体（withUidPercent）や not_started のような
   画面固有の正常差分は、**既にその画面の診断（buildStoryUserLaneRenderDiag の分岐、
   v0.1.1006 等）が吸収済み**であり、今後増える例外もその画面側の既存分岐に足される。
   judge の判定表は verdict 名の照合だけなので行数が増えない。
2. **等値比較の廃止で「差分の例外」というカテゴリ自体を消す。** 肥大化する例外リストとは
   「AとBの数が違うが正常なケース」の列挙である。数を比べなければ列挙対象が発生しない。

---

## Q5 / E.【MVP】

**作る。ファイル1つ・関数1つ・速報1行。**

- ファイル: `src/lib/threeScreenVerdict.js`（純関数のみ、約100行想定）
- 関数: `judgeThreeScreen(snapshot)` — シグネチャは §C のとおり
- 配線: 速報フォーマッタ（storyUserLaneRenderProbe の行を組む既存箇所）で、既に手元にある
  probe / venue parity / 鏡スナップショットを詰めて呼び、戻りの `line` を1行差すだけ。
  evidence は既存 fastDiag JSON に同梱（**lite passthrough 必須** — §G-1）。
- テスト: 判定表の8行 × 各1ケース＋今日の実機値(0/76/21)の再現fixture＋世代ずれ(skew<0)。
  wiring テストは「無条件呼び出し」と「差し込み箇所数 toBe(N)」で断言し、書いた直後に
  `if(false)` 前置の変異で赤を確認（プロジェクト既存規律）。

**作らない場合に何が困るか**: 今日と同じ「①だけ死んでいる」事象が再発したとき、また人間が
2画面のスクショを並べるまで誰も犯人を名指しできず、速報は「供給21件→画面0件」という
①視点の半分の真実しか言えない。

---

## Q6【なぜ今回は失敗しないのか】構造的説明

過去の失敗は2種類。それぞれ「気をつける」ではなく**コードパスの不在**で再発を封じる。

### 嘘の緑（✅を出して誤診）に対して
1. **出力集合に緑が無い。** verdict の型は
   `pop_broken|venue_broken|mirror_stale|indeterminate|silent` の5値で、「3画面一致✅」を
   表現する値が存在しない。嘘の緑は型レベルで書けない。
2. **等値比較のコードパスが無い。** 過去の嘘の緑は「古い値どうしを比べて一致→✅」だった。
   比較そのものを廃止したので、この故障モードには入口が無い。
3. **既定が沈黙。** 判定表の最終行は silent。条件を1つでも欠けば「何も言わない」に落ちる
   fail-closed（ackだけ見て✅を出した過去と逆向きの既定）。
4. **古い値は世代アンカーで indeterminate に落ちる。** 「鏡が11分古いのに✅」型は、
   行2〜3（mirror_stale が最優先）と skew 検査が先に立つため 🔴/⚪ の手前で必ず捕まる。

### 計器スパイラル（25版・症状ゼロ改善）に対して
5. **新規観測ゼロが仕様。** 入力は今日の実機事象で**既に印字されていた3つの既存値**のみ。
   純関数1つ＋1行なので「計器を足して様子を見る」というループの燃料が無い。
   indeterminate が出たときの evidence.missing が「どの既存値が欠けたか」を名指しするため、
   欠けの調査も新計器でなく既存配線の確認になる。
6. **調整ノブゼロ。** 閾値は既存 SOFT/HARD の再利用のみ。「閾値を変えて次の版」という
   スパイラルの回し先が無い。
7. **撤去が1行。** 速報の1行差し込みだけなので、役目を終えたら差し込み1箇所を消せば
   痕跡なく畳める（3,073行撤去した点滅計器の反省を初期条件に織り込む）。

---

## F. 捨てた案と理由

| 案 | 捨てた理由 |
|---|---|
| 3値の件数を（±許容差つきで）等値比較する | 上限60件・数え方違い・別tickの三重の偽陽性源。過去の嘘の緑の再演。許容差という新マジックナンバーも増える |
| 3画面が共通 tickId へ同時に書く「同期スナップショットキー」を新設 | 同一時刻保証としては正攻法だが、新storageキー＋全画面への書き込み配線＝制約1違反。計器スパイラルの入口 |
| ✅「3画面一致」を出す | 一致主張には等値比較が必須になり制約2に逆行。健全の報知は既存の画面別診断行で足りている |
| 判定不能時にリトライ/再読込を自動で回す | 新ポーリング＝制約1違反。⚪1行で人間に再コピーを促す方が安い |
| 会場76 vs ①21 の差を「席とレーンの換算表」で正規化して比較 | 例外フィルタ肥大化の典型。換算表は仕様変更のたびに腐る |
| judge を background 常駐で回して異常時に通知 | 観測でなく監視の新設。速報1行の範囲を超える |

---

## G. 地雷と回避策

1. **lite passthrough**（[[fastdiag-lite-is-the-printer-subset]]）: evidence/行を full にだけ
   足すと速報コピペに永久に出ない。statusFastDiagLite への passthrough と wiring 断言を
   実装タスクに明記する。
2. **venue parity が①側速報の JSON に同梱されていない可能性**: MVP は正直に
   indeterminate（missing:['venue_anchor']）を出す。実機で常に indeterminate なら、
   会場 diag の該当3フィールド（mode/mirrorAgeSec/visibleShown）を速報の extras 読みに
   **中継**する（既存値の転送であり新観測ではないが、extras=12秒間引き側に置くこと。
   コアreadに足すと大配信で固まる既知の地雷 [[status-extras-read-not-core-read]]）。
3. **鏡の再publish競合**: 判定の鏡読みと会場観測の間に①が publish すると skew<0。
   判定表行5で indeterminate に落とす（実装時に skew<0 を「異常」でなく「世代ずれ」として
   evidence に残す。ここを🔴にすると偽陽性）。
4. **heavySettleState を判定条件に使わない**: 今日の実機で 'empty-covered' は真の故障と
   共起した。計器名/状態名を根拠に無罪放免すると [[instrument-name-can-mislead-2026-08-06]]
   の再演になる。evidence への転記のみ。
5. **indeterminate が続いても計器を足さない**: まず evidence.missing を読む→既存配線を疑う、
   の順。2版続けて判定系を触ったら手を止める（[[instrument-spiral-25-versions-2026-08-06]]）。
6. **wiring テストの変異確認**: `if(false)` 前置と差し込み数 toBe(N) を書いた直後に実施
   （[[wiring-test-mutation-check-2026-08-01]] / [[wiring-test-must-assert-counts-2026-08-04]]）。
7. **mirrorAgeSec の -1 / lastRunAgoMs の null**: どちらも既存の「不明」セマンティクス。
   0 と混同すると偽陽性。判定表行4・5で必ず indeterminate 経由にする。
