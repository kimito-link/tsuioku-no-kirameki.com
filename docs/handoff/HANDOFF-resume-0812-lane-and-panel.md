# 引き継ぎ 2026-08-12 夕 — レーン/パネル/計器の整理

> 次のセッションはこの1枚から始める。ブランチ **`feat/sidepanel-first-layout`**(push済)
> 現在 **v0.1.1367** / commit `9fcf20bd`
> ★dist の差分は pre-push フックのビルドで必ず1つずれる。追いかけない。

---

## ★★続き(2026-08-12 夜・v1367 まで)— 次はここから

### 済(v1367・verify:cc 全ゲート緑・push済)
1. **レーン78件中19件の根治**。真因=**v1363 は構造的に一度も発動できなかった**。
   軽い read 成功時(popup-entry.js:16146)が `readAtMs` 無しでキャッシュを丸ごと上書き
   →`decideHeavyChunkReadReuse` が fresh-read 不成立→次 refresh は必ず reuse:false
   →v1363 の救済分岐が bail(RACE)。`heavyRacePaintedFromCache:0` は偶然ではない。
   直し=`lib/heavyCachePreserve.js`(新設・純関数)。**タイル19→9の縮小も同一原因**
   (heavy が bail し続け light_summary の暫定がそのまま出ていた)。
2. **`VOICE_DIAG_FRESH_MS` は「一本化しない」に訂正**(設計書2件も訂正済)。
   同名だが別物: healthCells=判定適用の境界(実効90秒) / voiceDiag=judgeValueFreshness の
   基準値(実効10分)。統合すると v0.1.1004 の誤発火が戻る=退化。改名のみで衝突解消。
3. **黒画面 v1365 は効いた**(表示遅延 18,137ms→44ms)。①は決着。

### ★黒画面の続き(v1368・計器の誤診断は是正済 / 症状は未確定)

**v1368 で「幕が残っている=JSが途中で止まった疑い」の誤名指しを是正した。**
真因: cloak は popup.html:1 の `<html>` に**静的に**書かれている＝iframe 再ロード直後は
JS 起動前から必ず `cloak==='1'`。visible/reload フェーズがその瞬間を掴むと誤診断した。
直し=`readyState!=='complete'` なら「まだ読み込み中(JS起動前)」と名乗る。
★**complete なのに幕が残る本物の固着は従来どおり🔴**(退化させていない)。

**★実ブラウザで出荷ビルドを実測した(chrome-devtools MCP・`prefers-color-scheme: dark`)**:
```
popup.html   t+16ms ready=loading cloak=1 / t+400 complete cloak=1 / t+700 cloak=null(解除)
             どの時点も --nl-bg=#fffaf2 / color-scheme=light / 中央の塗り主あり
sidepanel.html t+16ms〜3500ms すべて iframe が rgb(255,250,242) を塗っている
             窓 1889x2045・0x0 の時間帯なし・html/body は grad で塗り済み
```
⇒ **ダーク環境でも黒い時間帯は再現しなかった**。容器側(sidepanel.html / popup.html)の
既存の防御(color-scheme:light の meta+inline / 静的グラデ)は**効いている**。

★**つまり「私の環境では再現しない」状態に戻った**。スクショの暗い帯は実機固有の条件
(Chrome のパネル滑り出し / 拡張の実ロード / 実データ)が要る。**ここから先は速報が要る**:
次にパネルを開いて暗かったら、**v1368 の速報**を見る。名指しが
- 「まだ読み込み中(...)」→ **JS起動前の正常な過程**。黒の正体は別(幕ではない)
- 「幕(cloak)が残っている」(complete で)→ **本物の固着**。JS の解除経路を追う
- 「中身が空(bodyの子要素0)」→ popup.html 自体が読めていない
★どれが出たかで次の一手が変わる。**v1367以前の速報の cloak 名指しは信用しない**(誤診断)。

### ★★黒画面の真因を特定・根治(v1369)— 5件目にして再現できた

**真因 = `about:blank` の隙間**。iframe は src が読まれる前に**about:blank の文書**として
存在し、そこには popup.html の手当ても sidepanel.html の `<style>` も**届かない**。
`color-scheme` が `normal` のまま＝OSダークだと Chrome がその文書のキャンバスを暗色で塗る。

**実測(chrome-devtools・出荷ビルドを拡張として実ロード・dark・460x1000)**:
```
t+4〜8ms  url=about:blank  cs=normal  inlineStyle=NO  kids=0  ← ここが黒
t+12ms〜  url=popup.html   cs=light   inlineStyle=yes
```
**直し**: iframe【要素】に `color-scheme: light` を1行(sidepanel.html)。
★iframe 要素の `background:#fffaf2` は既にあったが、**要素の地であって
中の文書のキャンバスはその上に合成される**ため救えなかった。ここが7版外し続けた理由。

★**なぜ今まで見つからなかったか**: popup.html(v1289) と sidepanel.html(v1294/1316) は
既に手当て済みで、**どちらの文書にも属さない隙間**だけが残っていた。さらに自己診断は
`iframe.contentDocument` を読むので、この時間帯は「読めない/未レイアウト」に落ちて
**構造的に観測から漏れていた**([[zero-count-may-mean-unmeasured-2026-08-04]] と同型)。

★**測り方の教訓**: `file://` で popup.html を開く検証では**再現しなかった**。
拡張として**実ロード**(`install_extension` → `chrome-extension://`)して初めて
about:blank の隙間が現れた。**出荷ビルドを実ブラウザに拡張として読ませること**。

### ★未解決(次の一手)— サイドパネルの黒
**ユーザー報告(スクショあり)「サイドパネルを出すタイミングで黒くなる」は未解決。**
★私は一度「残り660msは追わない」と言ったが、**スクショで撤回した**。理由:
パネルは一瞬でなく**開いている間ずっと暗く**、タイトルは出るのに**中身が空でグレーの帯だけ**
=[[cloak-hides-content-not-background-2026-08-10]]の「地の色だけで中身が無い」。
窓0x0(49msで終了)でも白フラッシュでもない。**これは黒画面の4件目の系統**。

調査済(ここまで判明・次はこの続きから):
- `.nl-init-shade` の背景は `var(--nl-bg, #f6fff8)`。**ダーク用フォールバックは v0.1.1319 で撤去済**
  =シェードは犯人ではない(popup.html:199-217 のコメントが根拠)
- `prefers-color-scheme: dark` は popup.html に**2箇所だけ**(3068行 .nl-top-support-rank /
  8083行 .nl-export-wait)。**どちらもパネル地の色ではない**=犯人ではない
- `:root` は `color-scheme: light` 宣言済(popup.html:52・v0.1.1289 で light 固定)
- ★**次に見るべき**: 速報の `サイドパネル自己診断` が **🔴黒くなりうる / 原因=幕(cloak)が
  残っている=JSが途中で止まった疑い / ★あとから黒くなった(起動1秒後のvisibleで検知・2回)**
  と出ている。**「あとから黒くなった」が2回**=起動直後ではなく**後発**。
  cloak 解除は `revealPopupPrimaryOnce()`(popup-entry.js:4056 の removeAttribute)だけ。
  **誰かが cloak 属性を再付与しているか**(4043行 setAttribute の呼び元)を追うのが本線。
- ★注意: 幕は `opacity:0` で**中身だけ**隠す(背景は塗る)。スクショが「グレーの帯」なのは
  中身が消えた状態と整合する。**版を重ねる前に「再付与の呼び元」をコードで確定させること**
  ([[code-can-confirm-without-field-data-2026-08-12]])。

### 未着手(据え置き)
- 健全度セル残り2領域(`lane-drop` / `voice-engine`)= `health-cells-4domains-*.md`
- 計器チャンネル基盤 v1352以降 = `HANDOFF-instrument-channels-2026-08-12.md`

---

## 0. まず結論(この日に何が変わったか)

**18版出荷(v1349〜v1366)。症状は実際に軽くなった。**

実機の最終速報(v1365適用時)で確認できた数字:

| 項目 | 朝 | 夕 |
|---|---|---|
| 即時プッシュ 表示遅延 | **18,137ms** | **1ms**(平均69ms) |
| レーン描画 | 158件中**18件** | **241件**(たぬ姉237人) |
| タイルの縮小 | 39→3 / 158→7 | **0回** |
| heavyEverSettled | **false**(46回race) | **true** |
| 総合判定 | 🟡 注意 | **🟢 取り込み中 ✓** |

---

## 1. ★ユーザー確定の判定基準(最重要・これを外すと全部無駄)

> 「計器の価値は【読んで直せたか】だけで測る。読んでも直せないなら測定値が低い。
>  誤誘導するなら価値は負(マイナス)。」

正本メモリ = [[instrument-value-is-measured-by-fixes-2026-08-12]]

この日、**私が作った嘘の計器を5件直した**。計器を足すこと自体は成果ではない。

| 版 | 何が嘘だったか |
|---|---|
| v1355→v1357 | 「✅増え続けている」と出しながら実際は13→8に減っていた(候補数を数えていた) |
| v1358→v1361 | ID無し(広告主)を数え始めたのに、セル側のゲートが旧のままで**画面に出なかった** |
| v1358→v1366 | 「ゲスト」(ニコ既定の placeholder)を名前ありと誤検知 |
| v1356 | 詰まると計器の更新が止まり**行ごと消えていた**(一番知りたい瞬間に黙る) |
| v1353→v1354 | インライン script が CSP でブロックされ**一度も実行されなかった** |

★**セルを足す前に必ず自問する**: この行を読んで次の一手が決まるか / 異常時に必ず出るか /
他の数字と矛盾しないか / 測っている対象は主張と同じか。

---

## 2. 直した症状(真因つき・全てコードで確定)

### ① レーンが18件しか描けない(会場も同じ)= v1363
**真因**: 再利用時の `heavyDataPromise` は解決済み Promise だが `.then()` が
1マイクロタスク遅れる。その間に refresh(450msごと)が走り世代が進むため**必ず bail**。
v1035 の「次の refresh が settled で始まる」自己修復が**永久に成立しない**。
**直し**: 手元に全件があれば世代が進んでも描く(別配信混入は snapshotKey が担保済)。
実読みの遅い結果は従来どおり bail。効いた回数=`heavyRacePaintedFromCache`。

### ② タイルが39→3に消える = v1359
**真因**: 軽い供給の「既に描けているなら何もしない」判定が storage read の
**await より前**にあり、await 中に heavy が描き切ると古い判断のまま短い候補で上書き。
**直し**: 書き込む直前に再判定(`shouldSkipLightSupplyAfterAwait`・lib へ抽出)。

### ③ サイドパネルが暗いまま = v1365
**真因**: 裏タブで重い paint を見送るのは正しいが、その復帰(visibilitychange)の
間隔が `INLINE_EMBED_WATCH ? 400 : POLL_INTERVAL_MS` で、サイドパネルは**3000ms側**。
最悪は直前の可視イベントで復帰ごと捨てられる。
**直し**: `INLINE_EMBED_WATCH || INLINE_SIDE_PANEL ? 400 : ...`

### ④ 化石値で毎回「注意」= v1360
8.5日前の会場座席・8.7日前のギフト演出が🟡のまま総合判定を汚していた。
上限を設けて na('対象なし')に落とす。

---

## 3. ★未解決(次にやること)

### 3-1. 起動直後の黒(まだ出る・ただし正体は判明済)
**v1365 の効果は未測定**(最後の速報は修正前セッション)。次にパネルを開いて
まだ暗ければ、速報のこの3つを見る:

```
窓0x0の継続    ← ここが症状の長さと一致するなら【拡張の外】。追わない
幕(cloak)      ← t+400ms 付近で解除されていれば正常
初回シェード    ← v1364 で追加。最大10秒(CSS保険15秒)中身を覆う
```

★[[sidepanel-black-is-zero-area-window-2026-08-12]]: 窓が0x0の間は
**CSSもJSも塗れない**(Chromeのパネル滑り出し)。ここが原因なら版を重ねない。

### 3-2. 診断ページが重い
実機で `更新所要 1272ms / popupDiag 712ms` を観測(その後 248ms まで改善)。
再発したら popupDiag の中身を分解する。

### 3-3. 健全度セルの4領域設計(会議+Fable済・MVPだけ実装済)
- 正本: `docs/handoff/health-cells-4domains-DESIGN.md`
- 着手: `docs/handoff/health-cells-4domains-IMPLEMENTATION-HANDOFF.md`
- **MVP(`backfill-bottleneck`)は v1362 で実装済**
- 残り: `lane-drop` / `voice-engine` / `observedTiles` / `mark`フィールドのレンダラー対応
- ★`VOICE_DIAG_FRESH_MS` が **2ファイルに別値(90秒/60秒)** で存在(裏取り済)。一本化が要る

### 3-4. 計器チャンネル基盤(v1349-1351 実装済・残り版あり)
正本: `docs/handoff/HANDOFF-instrument-channels-2026-08-12.md`
v1352以降(段taxonomy・recordIntake・venueSeats移行)は未着手。

---

## 4. ★この日踏んだ地雷(次も踏む)

| # | 地雷 | 回避 |
|---|---|---|
| 1 | **popup-entry.js は max-lines 上限(22119)に張り付いている** | 行を増やせない。コメントを圧縮するか lib へ抽出する。毎回これで3〜4往復した |
| 2 | **新しい健全度セルは diagnosisRegistry への登録が必須** | 登録漏れは completenessScore のテストが検出する(v1362で実際に止まった) |
| 3 | **timeAuthorityRegistry は単調減少のみ** | 時点フィールドを持つ新ファイルは追加禁止。`CANONICAL_TIME_FIELD` へ委譲する |
| 4 | **バンドラが日本語を \uXXXX にする** | dist の確認で素の grep を使うと「無い」と誤読する(1回踏んだ) |
| 5 | **CRLF で置換が空振りする** | `node -e` の置換は必ず適用バイト数を出して確認 |
| 6 | **検査が整形に依存すると赤くなる** | 条件式だけを固定する。改行位置やブロックの書き方を pin しない(2回踏んだ) |
| 7 | **`indexOf('dist/popup.js')` がコメント中の言及を掴む** | `<script src="...">` の実体で固定する |
| 8 | **拡張ページにインライン script は書けない** | CSP `script-src 'self'`。必ず別ファイル。`extensionCspInlineScript.test.js` が全HTMLを検査 |

---

## 5. 反映手順(★git pull は書かない)

**拡張リロード → watch タブ F5**。
★コメビュ/会場は**それ自体を開き直す**(watch の F5 では入れ替わらない)。
★同じ作業ツリーなので `git pull` は不要([[never-tell-user-to-git-pull-2026-08-12]])。
