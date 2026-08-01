# 埋もれるコメントを拾う「ピックアップ枠」設計

> **設計=Fable(claude-fable-5) / 会議=4体(groq/nvidia) / 裏取り=司令塔(Claude Opus)**
> 作成: 2026-08-02 ／ 3段構えワークフローの手順2の産物
> 発案: ユーザー（BSP＝ニコ生バックステージパスの特別コメント枠を参照）
> 実装未着手。着手は [comment-pickup-ticker-IMPLEMENTATION-HANDOFF.md](comment-pickup-ticker-IMPLEMENTATION-HANDOFF.md) から。

## 経緯（なぜこの設計になったか）

「コメントが下だと埋もれるので、ピックアップしてこういうのどうかな」というユーザー発案。
司令塔の当初案は**「読み上げから漏れた(drop)コメントを拾う」**だったが、
**会議の批判役と実コードの両方に否定され、撤回した**。この撤回が設計の核心。

## ★司令塔の当初案が否定された経緯（重要）

### 批判役(groq/gpt-oss-120b)の指摘
> ドロップは音声合成の処理速度が追いつかないだけで、**内容的に重要かどうかは全く無関係**。
> スパムや荒らしコメントも同様にドロップされる。これを優先表示すると
> 配信者の意図に反するノイズが画面を占拠する。

### 実コードによる追い打ち（司令塔が裏取り確認）
`src/lib/voicePlayer.js:180` `_notifyDropped(item)` は **`item.onDropped()` を引数なしで叩くだけ**。
永続するのは `dropCountGateTotal` 等の**件数カウンタのみで、捨てた本文は保持していない**。
本文は破棄と同時にGCされ、かつ voicePlayer は content script 文脈で動くため、
ticker(popup/live-view) へ運ぶには**新しい storage 書き込みが必須＝地雷2に正面衝突**。

**結論**: drop の実測（毎分10件が音声で届かない）は**この機能が存在すべき理由**としてのみ使い、
**どのコメントを選ぶかには一切使わない**。

## 実測の前提（すべて裏取り済み）

- 読み上げは1件2.5〜3.0秒＝**1分20件が物理上限**。実測 需要31.8件/分 vs 供給21.1件/分
- **毎分10件前後は音声では絶対に届かない**（捨てるのは意図的な設計判断）
- コメント長: 平均12.8文字 / 中央値11文字 / p95=28文字
- 匿名が7〜9割

## ★描画経路（実コードで特定済み）

**唯一の絞り所**: `src/lib/commentTickerLatestHtml.js:23` `buildCommentTickerLatestHtml()`
——3画面すべてがこの純関数を通る。

| 画面 | file:line | 関数 |
|---|---|---|
| ①POP（能動） | `src/extension/popup-entry.js:3466` | `renderCommentTicker` |
| ②passive dock | `src/extension/popup-entry.js:7214` | `applyCommentTimelineMirrorForPassive` |
| ③純Web | `app/live-view.js:491` | `paintCommentTimelineMirror` |

- 鏡は **`commentTimelineMirror`**（`nls_comment_timeline_mirror_v1`）。**laneMirror ではない**
- `is-latest-only` / `is-paused` は無条件付与で外れない＝**旧マーキーは既にデッドコード**
- ticker に per-comment の見た目差分は**一切ない**
- 一方 応援タイムライン(`supportTimelineHtml.js:99-190`)には**既にギフト🎁バッジ・ptチップ・
  selfクラスが出荷済み**。VIP/tier色分けだけがどこにも無い

---

# 設計本文（Fable出力・そのまま採用）

## A. 理想の体験フロー

1. `nl-comment-ticker` は今と同じ位置・同じ1枠のまま。
2. **穏やかなとき（〜数件/分）: 挙動は今と完全に同じ**（最新1件が留まる）＝退行ゼロ。
3. **速いとき**: 「最新1件を追いかけて上書きし続ける」のをやめ、**7秒に1回、直近到着から
   1件を決定的に選んで7秒留める**。ギフトがあれば最優先。
4. 候補が1件も残らないとき: **従来どおり最新1件**（枠が空・staleになることは構造上ない）。
5. 0コメント: 既存の空状態。計器には「表示0件=判定不能」が明示的に出る。

要約: 「流れて埋もれる」の対義は「留まる」。留まる枠は既に存在する。
変えるのは**「何を留めるか」の選定だけ**。

## B. 統合アーキ（3コンポーネント）

```
[1] 選定: src/lib/pickTickerHighlight.js（新規・純関数・状態なし）
      pickTickerHighlightEntry(list, nowMs) → { entry, why, stats }
      ①は displayEntries、②③は restoreCommentTimelineRows の row をそのまま渡す
      （内部アダプタで {ts, kind, text, userId, commentNo} に正規化）

[2] 描画: commentTickerLatestHtml.js（MVPでは無変更。Patch 2 で variant 追加）

[3] 計器: why/stats を既存 fastDiag へ tickerPick として相乗り（新storageキーなし）
```

**鍵となる設計判断: キューを持たない・状態を持たない。**
選定は「現在時刻を7秒バケットに丸め、そのバケット開始までに到着した直近8秒の候補から
決定的に argmax」する純関数。3面が別タイミングで呼んでも同一バケットなら同じ答え
＝**面ごとのタイマー状態も鏡への新フィールドも一切不要で、①②③のパリティが計算で保証される**。

## C. 具体機構

```
BUCKET_MS = 7000（最小表示秒数=バケット幅）
LOOKBACK_MS = 8000（境界の取りこぼし防止）
MIN_TEXT_LEN = 4 / SWEET_LEN_MAX = 60 / DUP_EXCLUDE = 3

pickTickerHighlightEntry(list, nowMs):
  1. bucketAt = nowMs - (nowMs % BUCKET_MS)   ← 決定性の核
  2. 正規化: ts, kind, text(trim+空白圧縮), userId, commentNo（①entry形/②③row形の両対応）
  3. 候補 = ts ∈ (bucketAt - LOOKBACK_MS, bucketAt]
  4. フィルタ（D節）
  5. score = (kind==='gift' ? +100 : 0)
           + (len 4..60 ? +10 : len 61..120 ? +5 : 0)
           - (窓内の同一正規化本文の出現数-1) * 8
  6. argmax（同点は ts 降順 → commentNo 降順）。score ≤ 0 なら候補なし
  7. 候補なし → pickLatestCommentEntry(list) にフォールバック（既存関数を実import）
  8. → { entry, why: 'gift'|'scored'|'fallback'|'none',
         stats: { candidates, filteredTooShort, filteredDup, filteredSameUser } }
```

呼び出し側（3面共通・各1〜3行）:
```js
const picked = pickTickerHighlightEntry(rows, Date.now());
const key = `${picked.why}:${picked.entry?.commentNo||''}:${picked.entry?.at||picked.entry?.capturedAt||''}:${picked.entry?.userId||''}`;
if (segA.dataset.nlTickerKey !== key) {
  segA.dataset.nlTickerKey = key;
  segA.innerHTML = buildCommentTickerLatestHtml(...);
}
```

計器（既存 fastDiag 相乗り・**liteのpassthrough必須**）:
```
tickerPick: { gift, scored, fallback, none,
              filteredTooShort, filteredDup, filteredSameUser,
              domWriteTotal, lastWhy, lastBucketAt }
```

## D. 偽陽性・ノイズ潰し

- **連投/コピペ祭り**: 正規化本文が窓内3回以上 → 候補外（`filteredDup++`）。
  合唱は候補にならないが**フォールバックの最新1件としては従来どおり流れる＝消しはしない**
- **極短スパム**（「w」「888」）: 正規化後4文字未満は候補外。ギフトは免除
- **1人占拠**: 直前バケットと同一 userId は候補外。**匿名（空ID）には適用しない**＝匿名を巻き添えにしない
- **NGワード辞書・感情判定は入れない**（閾値調整地獄を避ける）。全フィルタは「回数と長さ」の機械的規則のみ
- **全部弾かれたら最新1件**＝偽陽性の最悪ケースが「現状維持」になるフェイルセーフ構造

## E. MVP（1つだけ作るなら）

**Patch 1: `pickTickerHighlight.js` 新設＋3書き手の差し替え＋diff-skip＋計器＋テスト。これだけ。**
`buildCommentTickerLatestHtml`・CSS・popup.html・鏡スナップショットは**1バイトも触らない**。

完了判定（機械的）:
1. ユニットテスト緑。**②③向けは `buildCommentTimelineMirrorSnapshot` の実出力を実import**して
   選定に食わせる（手書きfixture禁止）。書いた直後に `if(false)` 前置の変異で赤を確認
2. `npm run verify:cc` 緑
3. 実機: 20件/分超の配信で `tickerPick` が出て **`gift+scored ≥ 1`**
   （＝最新1件以外が実際に選ばれた証拠）
4. **`domWriteTotal` が 経過秒/7 + α を超えない**（＝コメント毎に書き換えていた現状より
   **軽くなった**ことの数値証拠）
5. 0件配信では `none` が増え他が0（空でも計器が原因を語る）

判定不能: `gift+scored+fallback = 0` なら「表示0件=判定不能」。
`fallback` のみで `scored=0` かつ到着ありなら「ピックアップ不発」＝filtered三兄弟で原因が一意。

## F. 捨てた案と理由

1. **drop連動（司令塔の推し案）— 撤回**。批判が正しく、実コードが追い打ち（上記「経緯」参照）
2. **VIP/venueSeats依存の選定（lead案）**: 匿名7〜9割で表示が1〜2%に収束。さらに
   venueSeats は会場(content script)文脈にあり ticker へ運ぶには鏡へ新フィールドが必要
   ＝**地雷2/3/4を3つ同時に踏む**。MVPの選定は userId を一切優遇しない
3. **「最新1件を下部に薄く1行残す」（lead案）**: 新UI。「受け皿は既存」の前提に反する。
   フォールバック機構が同じ役割を果たす
4. **キュー+最小表示秒数+持ち越し**: 読み上げの破綻を表示側で再演することになる。
   **サンプリングにはキューが存在しないので溢れも遅延も原理的に起きない**
   （7秒×8.5枠/分に対し需要31.8件/分＝**約27%表示は仕様であって破綻ではない**）
5. **鏡への新フィールド追加**: MVPで使う ts/kind/text/userId は鏡rowに既に全部ある。
   追加ゼロなら「能動だけ着飾る」穴が発生し得ない
6. **リアクション数・感情インパクト（批判役の対案）**: 無視していない。「同一メッセージへの
   同時反応」＝本設計の重複カウントそのもので、MVPでは**スパム側の信号**として使う。
   正の信号への反転は実測が溜まってから判断
7. **(b)種類別スタイリング先行（批判役の本命）**: 不採用だが僅差（論点2参照）

## G. 地雷と回避策

| 地雷 | 回避策 |
|---|---|
| 1. paint毎DOM走査禁止 | 選定は**データ配列のみ**を歩く（DOM走査ゼロ）。DOM書き込みはdiff-skipで7秒に最大1回＝**現状より減る** |
| 2. storage書き込み増禁止 | 新キーなし。計器は既存 fastDiag への相乗りのみ |
| 3. 中継でフィールドが消える | MVPは**新フィールドゼロ**で原理的に回避。将来足す場合は必ず spread で運ぶ |
| 4. 鏡が正 | 本枠の鏡は `commentTimelineMirror`。②③は鏡row入力で①と同一関数を通す＝載せ忘れが起きようがない |
| 5. churn前科 | diff-skipキー `why+commentNo+ts+userId`。**「消す側」（フォールバック遷移）も同じ機構を通る**。filtered三兄弟が「なぜ候補から消えたか」を常時計上 |
| 6. 手書きfixture禁止 | 実producer出力をimport |
| 7. 計器は原因を語る | why と filtered内訳で理由が一意。「判定不能」枠を明示 |

---

# 必答論点への回答（要点）

**1. 「drop=重要ではない」への回答**: 全面的に認め、案を撤回した。実コードが二重に殺している
（本文を保持していない＋content script文脈のため運搬に新storage書き込みが必須）。

**2. (a)先行か(b)先行か → (a)先行**。絞り所の発見は批判役の(b)先行主張を**弱める**。
(b)のコストが「1純関数+CSS」まで下がったことで判断軸はコストから価値へ移る。
そして **ticker は常に1件しか見えないため、種別で塗り分けても「埋もれた発言を救う」効果はゼロ**
（1件は塗らなくても見える）。(b)が効く場所＝複数行が並ぶ応援タイムラインには
**既に出荷済み**。(b)の未実装分（VIP/tier色分け）は鏡フィールド追加が要り、むしろ(a)より高コスト。
**(b)先行は「安いが効かない」。**

**3. キューの捨て方 → キューを作らない**が回答。選ばれなかったコメントは持ち越されず消える。
遅延はバケット幅7秒で厳密に有界。

**4. 匿名7〜9割での偏り防止**: 選定信号を **userId 非依存**（種別・長さ・重複回数）に限定。
唯一の userId 使用は連続占拠防止で、**匿名には適用しない**。

**5. 計器**: C節の `tickerPick`。0件時は `none` のみ増加で「判定不能」を明示。

**6. 着手順序（1 patch = 1 コンポーネント厳守）**:
- **Patch 1（MVP）**: 選定一式。鏡・HTML・CSS 無変更
- **Patch 2（任意）**: `buildCommentTickerLatestHtml` に `variant` を追加し、
  gift選出時に `nl-ticker-latest--gift` ＋CSS1色。**kind は鏡rowに既在＝鏡への追加不要**
- **Patch 3（将来・要判断）**: VIP旗を足す場合のみ `buildCommentTimelineMirrorSnapshot` へ
  フィールド追加。その際は個別列挙を **spread運搬**へ改め、実producer出力を食うテストで検知
