# 引き継ぎ 2026-08-19 — 「受信+破棄=送信の1.51倍」の正体（コードで決着）

> **★最新の結論は §7。§2〜§3 は途中経過で、主犯の特定を後から差し替えている。**
> **結論: 「二重注入」ではない。3つの数は母集団も期間も違い、比較そのものが成立していない。**
> ブランチ `feat/lane-density-lod` / v0.1.1452 / **コードは1文字も変更していない（調査のみ）**

---

## 0. 何を調べたか

memory と `HANDOFF-2026-08-17-comment-delay-investigation.md` §3 に、
**未実証のまま**こう残っていた:

```
送信 370,041 / 受信 310,750 / 破棄 247,763
→ 受信+破棄 = 558,513 = 送信の 1.51倍
「送っていない量が届いている」＝計上されていない送信元がいる
有力候補: injectIntoExistingTabs() が二重注入を止めていない
```

**この仮説は誤りだった。** 以下すべて実コードで確認済み。

---

## 1. ★前提が誤っていた（引き継ぎの記述が事実と違う）

引き継ぎにはこう書かれていた:

> content-entry.js には **二重注入を止める latch が無い**（`__nlsContentLoaded` 相当が存在しない）

**★これは事実と異なる。latch は存在する。**

| 場所 | 実際のコード |
|---|---|
| [content-entry.js:19302](../../src/extension/content-entry.js) | `if (!__nlsBootGlobal.__NLS_CONTENT_ENTRY_STARTED__) {` |
| [page-intercept-entry.js:30](../../src/extension/page-intercept-entry.js) | `if (window.__NLS_PAGE_INTERCEPT__) return;` |

出荷 dist にも入っている（`grep -c __NLS_CONTENT_ENTRY_STARTED__ extension/dist/content.js` → **2**）。
＝**MAIN world も isolated world も両方 latch 済み**。二重注入は起きない。

さらに `background.js:1046` の分岐は **排他** で、
`update` なら `reloadExistingWatchTabs`、それ以外なら `injectIntoExistingTabs` の
**どちらか一方**しか走らない（両方は走らない）。

---

## 2. ★真の説明（コードで確定）

### (a) 送信と受信は「1対1」ではない

| | 誰が何回数えるか | コード |
|---|---|---|
| **送信** | primary iframe **1つ宛に1回**だけ | [content-entry.js:4176-4189](../../src/extension/content-entry.js) |
| **受信** | **生存する iframe が各自1回ずつ** | [popup-entry.js:6471](../../src/extension/popup-entry.js) |

★`sentCount` は「送った回数」、`receivedCount` は「受け取った iframe の延べ数」。
**同じものを数えていない。** 比を取ること自体が誤り。

### (b) ★INLINE パネルの iframe は実際に複数生成される（計器が既に証拠を持っている）

[content-entry.js:3503-3511](../../src/extension/content-entry.js) に**実測記録付き**でこうある:

```
v0.1.1125 盲点計器: 「2つできてる」(ユーザー証言)の実在を数字で残す。
dedupe は非primaryを即 remove するため(実測: 注入→削除まで約74ms)、
瞬間の重複はこのカウンタでしか観測できない。
```

`:4003-4011` にはさらに「host_created が**同じ1ミリ秒に3回**…パネルが3個作られ」の実測記録。

### (c) nonce は「iframe 単位」ではなく「content script 単位」

[content-entry.js:2986-2991](../../src/extension/content-entry.js) の `_instantPushNonce` は
モジュール変数で**1タブに1つ**。それを `:3896` で**全 iframe の src に同じ値**で焼く。
受信側 [popup-entry.js:6232](../../src/extension/popup-entry.js) は自 URL の `pn=` を読むだけ。

★**帰結: 同時に生きている iframe は全員 nonce 検証を通過し、全員が `receivedCount` を加算する。**

### (d) 破棄が増える唯一の道

[popup-entry.js:6414](../../src/extension/popup-entry.js) — `rejectedCount` が増えるのは
**「type は正しいが nonce が一致しない」**ときだけ（type 違いは早期 return、
nonce 未設定はノイズ回避で計上しない）。

nonce が食い違うのは、**content script が再生成されて新しい nonce になったのに、
古い iframe がまだ生きている瞬間**。`pn=` が変わると `isLvOnlyIframeSrcDiff`
（[:3855-3860](../../src/extension/content-entry.js)）が **false** を返すので
iframe は**作り直される**＝古い方は短命だが、その間に届いた分を破棄として計上する。

### (e) 3つの数は「同じ母集団」ではない

[diagFlushThrottle.js:118-137](../../src/lib/diagFlushThrottle.js) の `flushBody` は
`read → 畳み込み → write`。`flushMutex`(:78) は**自コンテキスト内しか直列化しない**。
送信側(content script)と受信側(iframe)は**別プロセスで同じ1本のキー**
`nls_instant_push_diag_v1`（[instantPushDiagKey.js:9](../../src/lib/instantPushDiagKey.js)）を
read-merge-write する＝**lost update が起きる**（ソース自身が「競合は許容」と明記）。

★ただし lost update は**減る方向**にしか働かないので、1.51倍を作る主犯ではない。

---

## 3. ★結論

> **「送っていない量が届いている」のではない。
> 　1回の送信を、複数の受け手が別々に計上している。**

比 1.51 は **「平均して約1.5個の iframe が同時に生きていた」** と読むのが自然。
dedupe が約74msで効くため、倍率が 2.0 ではなく **1.5前後の半端な値**になる点とも整合する。

★**CPU/メモリを1.5倍無駄遣いしている、という読みは誤り。**
postMessage は `contentWindow` 1つ宛に1回だけ（[:4176](../../src/extension/content-entry.js)）。
**送信コストは増えていない。** 増えているのは**計器の数字だけ**。

---

## 4. ★実機で確認すべきことは【1点だけ】

この説明が正しいなら、**`duplicateSeen` が非0**のはず。

- 記録場所: [inlineHostMoveProbe.js:64-67](../../src/lib/inlineHostMoveProbe.js) `recordInlineHostDuplicateSeen`
- ★**問題: この値は状態速報に出ていない**（`status-entry.js` / `aiShareFullText.js` に
  `duplicateSeen` の文字列が無いことを grep で確認済み）
  ＝ **決め手になる数字が、報告に乗らないので誰も見られない**
  （[[screen-only-info-never-reaches-the-report-2026-08-11]] と同じ型）

| duplicateSeen | 判定 |
|---|---|
| **非0** | ★本説明で確定。**実害は無い**（計器の数字が増えるだけ）→ 直すのは「計器の読み方」 |
| **0** | 本説明は誤り。別シナリオ（古いビルドの iframe が残る等）を疑う |

★**次の版でやるべきは「`duplicateSeen` を速報に出す」1行だけ。**
計器を新設する必要は無い（**既に数えている**）。
[[counting-is-not-fixing-2026-08-13]] の逆で、**数えているのに読み手が居ない**状態。

---

## 5. ★やってはいけないこと

- ❌ `injectIntoExistingTabs()` に latch を足す … **既に latch はある**。足しても何も変わらない
- ❌ 「二重注入を直した」と称する版を切る … **二重注入は起きていない**
- ❌ `sentCount` と `receivedCount` を比較する検査を書く … **単位が違う**ので恒偽になる
- ❌ 即時プッシュ経路の本体に触る … 地雷（`popup-entry.js:6406` のコメント参照）

---

## 6. 未確認（正直に）

- **1.51 の出所**: リポジトリ内に文字列 `1.51` は**無い**。上記引き継ぎの手計算のみ。
  分子・分母がこの6フィールドのどれだったかは**未確認**
- **測定時の watch タブ枚数**: 未確認。複数枚なら (e) のキー共有だけでも比は動く
- **`duplicateSeen` の実値**: 未確認（速報に出ていないため）＝ §4 がそのまま次の一手

---

## 7. ★★追加調査（同日・自分の結論を殺しにいった結果、説明が入れ替わった）

> **§3 の「平均1.5個のiframeが同時に生きていた」は主犯ではない。取り下げる。**

### ★反証: 受信【単独】では送信を超えていない

```
受信/送信 = 310,750 / 370,041 = 0.84  ← ★1未満
破棄/送信 = 247,763 / 370,041 = 0.67
```

「複数iframeが各自加算する」が主犯なら **受信 > 送信** になるはず。**なっていない。**
さらに dedupe は約74ms で効くので、比0.51を重複だけで作るには
**毎秒6.9回パネルが重複生成される**必要がある＝現実的でない。

### ★破棄247,763の経路を全部潰した（どれも主犯になれない）

| 経路 | 判定 |
|---|---|
| nonce不一致 | `pn=` が変わると iframe は**作り直される**(`isLvOnlyIframeSrcDiff`=false, `content-entry.js:3855`)＝古い方は短命 |
| rows が sanitize で null | ★**実測で潰した**: 通常/匿名(`a:`)/`null`/空文字**すべて通過**。落ちるのは text>4096字 と commentNo>10桁のみ＝通常配信では稀 |
| 空配列 rows | 送信側 `:4162` が `!rows.length` で弾く＝送らない |
| status/liveview 埋め込みが横取り | ★`embedWatch` は `dock=status`/`liveview` でも **true**＝listener は登録される。**しかし `pn=` が無い**ので `expectedNonce` が空 → `:6414` の `_instantPushExpectedNonce &&` に阻まれ **rejectedCount は増えない** |

★**コードから毎分約4回の破棄を必然的に導く経路は見つからなかった。**

### ★★真の構造的欠陥：3つの数は「同じ母集団」ではない（これが本命）

**(1) この値は【リセットされない生涯累計】**
`applyInstantPushDiagDelta`(`instantPushDiag.js:96-101`)は全カウンタが単純加算で、
リポジトリ内に**リセット経路が存在しない**(grep 済み)。
即時プッシュは **v0.1.1092(2026-07-06)** 導入、速報は **v0.1.1413(2026-08-17)**
＝ **6週間・約320版ぶんの累計**。その間に nonce 機構自体が v0.1.1094 で変わっている。
**異なるコードが書いた数を1つの比で語ることはできない。**

**(2) ★送信側だけが構造的に取りこぼす（非対称）**

`diagFlushThrottle.js:96` — `note()` は `isContextAlive()` が false だと **no-op**。
`isExtensionContextAlive`(`reportSilentError.js:37`)は `chrome.runtime.id` を見る。

★**拡張をリロードすると content script の `chrome.runtime.id` は undefined になる。**
この瞬間、
- 未 flush の**最大10秒分**が失われる
- `pagehide` の緊急 flush も `hasExtensionContext()` で**弾かれる**(`content-entry.js:4079` `flushDiagFlushersNow`)

一方、受信側は**拡張ページ自身**なので、リロード時は iframe ごと作り直されて新 context で再開する。

| | 送信側 (content script) | 受信側 (iframe) |
|---|---|---|
| 居場所 | watch ページに**常駐** | 拡張ページ(作り直される) |
| 拡張リロード時 | ★**context 死＝最後の flush が黙って捨てられる** | 作り直し＝書けた分は残る |
| 6週間の回数 | **約320版ぶん** | 同左 |

★**送信ロスが34%あれば、比はちょうど 1.00 になる。**

```
送信ロス 0%  → 比 1.51
送信ロス20%  → 比 1.21
送信ロス34%  → 比 1.00   ←★
```

### ★結論（更新）

> **「1.51倍」は異常ではなく、【計器の設計上そうなる】。**
> 送信側だけが拡張リロードのたびに取りこぼす非対称な累計を、
> リセットせずに6週間・320版ぶん貯め、単位も母集団も違う3つを足して割った数字。

★**二重注入でもなく、重複iframeでもない。比較そのものが成立していない。**

### ★次の一手（更新・順序が重要）

1. ★**`duplicateSeen` を速報に出す**（既に数えている・`inlineHostMoveProbe.js:64`）
2. ★**計器に「いつから数えているか」を持たせる**（`since` フィールド）。
   ★これが無い限り、**将来また同じ誤読が起きる**。累計しか無い計器は
   「1時間の値」と「6週間の値」を区別できない＝比較不能
   （[[cumulative-value-shown-as-current-state-2026-08-12]] と同じ型）
3. 送信側の取りこぼしを**数える**（`note()` が no-op になった回数）。
   ★直すのではなく**まず数える**。取りこぼし量が分からない限り比は読めない

★**やってはいけない**: この比を根拠に即時プッシュ経路の実装を触ること。
　**実害は1つも確認されていない**（postMessage は1回・送信コストは増えていない）。
