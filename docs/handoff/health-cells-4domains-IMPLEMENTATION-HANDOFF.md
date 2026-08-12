# 実装ハンドオフ: 診断ページ健全度セル（4領域）

> **この1枚だけで着手できる粒度**。設計の正本は `health-cells-4domains-DESIGN.md`（同ディレクトリ）。
> 現在 **v0.1.1361** / ブランチ `feat/sidepanel-first-layout`（push済）
> 2026-08-12 作成。設計=Fable / 会議=4体 / 裏取り=Claude Code

---

## 0. まず読む順（これだけ）

1. この1枚（着手手順・DoD・地雷）
2. `health-cells-4domains-DESIGN.md` の **§C-1**（MVPの判定表）と **§B**（三義の表）
3. `src/lib/healthCells.js` の `stateCell`(62行付近) と `summarizeHealthVerdict`(751行付近)

★全部読む必要はない。MVPは C-1 だけで完結する。

---

## 1. スコープ（MVPだけ・それ以外は今やらない）

**やること: `backfill-bottleneck` セル1個の新設。**

理由（設計§E）: 必要な観測値は `KEY_BACKFILL_LIVE_METRIC` に**全て書き込み済み**＝
新しい観測コードはゼロ。読み側の純関数1つ＋配線だけ。今日ユーザーが現在進行形で踏んでいる
「3000件が取れない」の律速を、状態速報1枚で名指しできるようになる。

**やらないこと（次以降）**:
- `lane-drop` セル（配線の要確認事項が残る）
- `voice-engine` セル（基線は既にあり緊急度が低い）
- `observedTiles` の新設（サムネの残り穴）
- `mark` フィールドのレンダラー対応（§B・MVPには不要）

---

## 2. 着手手順

### 2-1. ブランチ

現行 `feat/sidepanel-first-layout` の続きで良い（このブランチに v1349〜v1361 が入っている）。

### 2-2. TDD の順番（この順でやる）

**① 判定の純関数を先に書く**: `src/lib/backfillBottleneck.js`（新規）

```js
export function judgeBackfillBottleneck(metric, nowMs) { /* → { level, text, reason } */ }
```

- 入力は `KEY_BACKFILL_LIVE_METRIC` の値そのまま（下記の実在フィールドのみ使う）
- 出力は `{ level:'ok'|'warn'|'bad'|'na', text:string, reason:string }`
  （`reason` は機械可読トークン: `'stale-meter'|'bg-tab'|'yield-starved'|'bridge-waste'|'healthy'|'idle'`）
- **判定は設計§C-1 の表の順に上から1つだけ**採用（律速ポインタ方式）

**② その単体テストを書く**: `src/lib/backfillBottleneck.test.js`

必須ケース（設計§C-1 の7分岐すべて）:
- `running=1` かつ `ts` が16秒前 → `bad` / reason=`stale-meter`（★これが地雷#4の反転）
- `fg=0` → `warn` / reason=`bg-tab` / text に「裏タブ」と「前面に」
- `yieldWaitMsTotal/elapsedMs = 0.67` → `bad` / reason=`yield-starved`
- 同 `= 0.38` → `warn`
- `dataSegs=120, bridgingSteps=380` → `warn` / reason=`bridge-waste`
- 正常 → `ok` / text に「約1区画◯ms」
- `running=0` → `na` / text が `— 対象なし:` で始まる
- `dataSegs=3`(10未満)で橋渡し比が高い → **`bridge-waste` にしない**（開始直後の暴れ防止）

**③ healthCells に配線**: `buildHealthCells` へ `backfillLiveMetric` を追加

★**ここが一番の落とし穴**（下の §4 地雷1）。`buildHealthCells` の引数に
`backfillLiveMetric` は**現在入っていない**。呼び出し側3箇所も直す必要がある。

**④ wiring テストを書く**: `src/lib/backfillBottleneckWiring.test.js`

- `status-entry.js` が `renderHealthCells` に `backfillLiveMetric` を渡していること
- `healthCells.js` が `judgeBackfillBottleneck` を import していること
- ★**配線数を `toBe(n)` で断言**（1箇所以上ではなく数で）

**⑤ 変異で赤を確認**（DoD。§3参照）

### 2-3. 実在フィールド（これ以外を使わない・裏取り済）

`KEY_BACKFILL_LIVE_METRIC`（`src/lib/storageKeys.js`・値 `nls_backfill_live_metric_v1`）:

```
lid, running(0|1), seg, rows, genSteps, dataSegs, bridgingSteps,
yields, yieldWaitMsTotal, elapsedMs, fg(0|1), ts
```

書き手: `src/extension/content-entry.js` の `publishBackfillLiveMetric`
（1Hz min-gap ＋ 5秒心拍 `BACKFILL_LIVE_METRIC_HEARTBEAT_MS`。v1356 で心拍を追加済＝**詰まっても ts が進む**）

読み手: **status-entry.js のみ**。
⚠️ **popup は絶対にこのキーを読まない・import しない**（`storageKeys.js` の JSDoc に構造的分離が明記。
読むと v0.1.657 の「実況は完走時だけ」が壊れる）。

---

## 3. 完了判定（機械的・これが全部緑なら完了）

```bash
npm run verify:cc
```

加えて**手で確認する項目**:

1. `npx vitest run src/lib/backfillBottleneck.test.js` が緑（7分岐すべて）
2. **変異で赤**を1件ずつ確認し、変異が**適用されたことまで確認**する
   （CRLF/エスケープで空振りした前科が2回ある。`node -e` で置換し、置換前後のバイト数を出す）
   - 判定順を入れ替える（`fg=0` を最後に）→ 赤
   - `stale-meter` の分岐を消す → 赤（★詰まったとき黙る状態に戻る）
   - `dataSegs≥10` のガードを外す → 赤（開始直後の誤検知）
   - wiring: `backfillLiveMetric` の受け渡しを1箇所消す → 赤
3. **実機で行が出ること**（通し検査）: 状態速報に `取り込み律速` のセルが現れる
   ★これを確認せずに「実装完了」と言わない（v0.1.1295 で行が1つも出ない状態で出荷した前科）

---

## 4. 地雷（この作業で踏みうるもの・全部実績あり）

| # | 地雷 | 回避 |
|---|---|---|
| 1 | **`buildHealthCells` の引数に `backfillLiveMetric` が無い** | 呼び出し3箇所を直す: `status-entry.js:1815`(renderHealthCells) / `aiShareFullText.js:267` / 同 `:300`。★1箇所でも漏れると「セルが出ない」。wiringテストで数を断言 |
| 2 | **popup がこのキーを読むと v0.1.657 が壊れる** | status 側だけに閉じる。popup-entry.js を触らない |
| 3 | **化石値で色を出す** | 判定の**最初の分岐**に鮮度を置く（設計§D）。ただし `running=1` の沈黙は na でなく **bad** |
| 4 | **異常時だけ描画すると消える** | `running=0` でも na セルを**出す**。`if(値>0)` で行ごと消さない |
| 5 | **判定の二重実装** | 既存 `backfillLiveThroughputLine`(`backfillRinkuNarration.js:467`)は**数値の羅列のまま残す**。名指しは新セルだけ。両者が別々に判定しない |
| 6 | **`max-lines` 上限** | `popup-entry.js` は 22119 行で上限に張り付いている。**この作業では触らない**はずだが、触るなら同値に戻すこと |
| 7 | rAF/performance.now を鮮度比較に混ぜる | `ts` は `Date.now()` 生成（content-entry.js で確認済）。比較も `Date.now()` で |

---

## 5. 転記元の実在パス一覧（裏取り済）

| 用途 | パス |
|---|---|
| セルの作り方(`stateCell`) | `src/lib/healthCells.js:62` 付近 |
| 総合判定 | `src/lib/healthCells.js:751` 付近（`bad`→異常あり / `warn`→注意 / **na と processing は影響しない**） |
| 化石値ガードの先例 | `src/lib/healthCells.js` の `VENUE_SEATS_CLOSED_MS`(5分) / `GIFT_EFFECT_FOSSIL_MS`(2時間) |
| 書き手 | `src/extension/content-entry.js` の `publishBackfillLiveMetric` |
| 心拍 | 同ファイル `BACKFILL_LIVE_METRIC_HEARTBEAT_MS`(5秒・v1356) |
| キー定義 | `src/lib/storageKeys.js` の `KEY_BACKFILL_LIVE_METRIC` |
| 既存の文章行(数値の羅列) | `src/lib/backfillRinkuNarration.js:467` `backfillLiveThroughputLine` |
| status 側の表示ゲート | `src/extension/status-entry.js:1554` 付近（`running===1 && now-ts<15000`） |

---

## 6. 参考: 次の版でやること（MVPの後）

優先順は設計§E のとおり:

1. **`observedTiles` の新設**（サムネ・設計§C-2）— `venueYukkuriNamedCensus.js` の
   `observeVenueYukkuriNamedTile` 先頭で無条件加算。「検査対象0」と「検査スキップ」を分ける
2. **`lane-drop` セル**（設計§C-3）— ★先に(要確認): `summarizeLaneTileOscillation` の結果が
   `buildHealthCells` の入力に乗っているか。乗っていなければ `capturedAt` 付きで同梱する配線から
3. **`voice-engine` セル**（設計§C-4）— ★先に(要確認): ON成功時に `lastEnableFailReason` が
   クリアされるか。されないなら分岐順で誤発火を防ぐ
4. ~~**`VOICE_DIAG_FRESH_MS` の一本化**~~ → ★**v0.1.1367 で「統合しない」に訂正・完了**。
   コードを読んだ結果、同名だが**別物**だった(重複ではない):
   - `healthCells.js` = live 固着判定を**適用するかの境界そのもの**(実効90秒)
   - `voiceDiag.js` = `judgeValueFreshness` に渡す**基準値**。化石値と出る実効境界は**10分**
   一本化すると healthCells 側が 90秒→60秒 に縮み、**v0.1.1004 の誤発火(「待機8・最終発話
   5.5日前」で🔴)が戻る=退化**。よって値は統合せず、`healthCells.js` を
   `VOICE_LIVE_JUDGE_WINDOW_MS` へ**改名**して名前の衝突だけ解消した(実効境界は不変)。
5. **`mark` フィールドのレンダラー対応**（設計§B）— グリフ＋ARIA
