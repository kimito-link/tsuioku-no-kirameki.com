# 応援パネル4秒周期消失 — 決着設計書 (v0.1.1267)

> 設計 = Fable(claude-fable-5) / 素材 = 会議ハーネス4体 / 裏取り = Claude Code(司令塔)
> 日付: 2026-08-05 ／ 3段構えワークフローの手順2の産物
> 会議ブリーフ: `panel-flicker-council-brief-2026-08-05.md`
> Fableブリーフ: `panel-flicker-fable-brief-2026-08-05.md`

---

## 経緯(なぜこの設計に至ったか)

3日・15版(v0.1.1250〜1266)追って直らなかった。会議(4体)は3対1で
「(a)ニコ生側が優勢・案B(body直下fixed)を実装せよ」と結論したが、
**司令塔が実コードで裏取りして統括役の根拠を1つ潰した**:

- `hostStyleTrace=0` は証拠にならない。observer は **host 自身しか見ておらず親は観測対象外**
  (content-entry.js:2870 `observe(host, {...})`)
- かつ `_hostStylePrevVisible` を MutationObserver と rAFループが**共有**しており
  (2855/2867 と 2892/2897)、rAFが毎フレーム上書きするので MutationObserver 側の
  `becameHidden` はほぼ成立しない = **計器が壊れている**

さらに **Fableが第3の欠陥を発見**(司令塔が裏取り済み):

- `startHostStyleMutationTrace` は `if (_hostStyleObserver) return`(2846)により
  **初代 host に一度だけ付く**。呼び出しは host 生成時の1箇所(4121)のみ。
  → host が再生成されると**死んだノードを永久に見張る**。
    v0.1.1264以前に「3個生成」が実在した以上、observer が現物を見ていた保証すら無い。

**結論: 「外部の書き手を直接見た」証拠はまだ一度も取れていない。**
だから本版は「直す」より先に「必ず何かが確定する」ことを最優先にする。

---

## A. 結論: (a)ニコ生側(外部要因)優勢。機序は「host のインライン style 上書きの喪失」

健全な計器2つが拡張の無罪を示している:

1. `hostFlipCensus=0` — display 書き換えは1入口(`setInlineHostDisplay`:2922)に集約済みで
   全経路がここを通る。内部の直接カウントが0 = 拡張は display を書いていない。
2. `vanishForensics` — 消失3回中2回で直前1.2秒の足跡ゼロ。全 hide 経路は関数先頭で
   無条件に `trail()` を呼ぶ(2923 / 3021)。走っていれば必ず残る構造で、残っていない。
3. 消えた瞬間の値が旧CSS既定と完全一致 = 機序は「インライン上書きが失われて既定へ落ちた」。
   拡張は host.style へ**プロパティ単位でしか書かない**(`cssText`/`setAttribute('style')` は
   host に対して存在しない。13066 の cssText は別要素)。**拡張自身がこの状態を作る経路が無い**。
4. 内部犯の有力候補は実験で潰れている: autoshow_off(v0.1.1263で無罪)/ host 3個生成(v0.1.1264で0回)。
   残る(b)の状況証拠は「4.0秒 = LIVE_POLL_MS と同周期」の一致のみ → **本版の位相計器で白黒つける**。

★ただし裁定が外れた場合も必ず名指しで反証が出る形にする(B節)。

---

## B. 1版で二分する実験(★復帰ゲートは止めない)

批判役の「片方向では不十分」に、**ablation なしの双方向同時測定**で答える。

**方向1: 機序の検証。** v0.1.1266(既定 display:block + `[data-nls-hidden]` 属性正本)により、
外部が style 属性を消しても症状は出ない(無害な no-op)。しかし**攻撃自体は続く**ので、
修理した MutationObserver(attributeOldValue 付き)に **書き手の指紋(old→new の実文字列)**が残る。

**方向2: 時計の検証(位相測定)。** 消失ごとに
`Δ = 消失時刻 − 直近の LIVE_POLL_MS tick 時刻` を記録する。

- 拡張の4秒時計が上流なら Δ は消失間でほぼ一定(**locked**)
- ニコ生側の独立した4秒タイマーならレート差で Δ が歩く(**walking**)

→ **復帰ゲートに一切触らずに「どちらの時計が消失を駆動しているか」が判る**。
cv 0.001 の高精度な周期性がここでは武器になる。

### 結果マトリクス(全分岐が確定を生む)

| 1往復後の観測 | 裁定 |
|---|---|
| 消失0 + style属性の外部書き換え痕あり | **(a)確定**。1266が根治。書き換え文字列が指紋 |
| 消失0 + 痕なし | **症状決着**。機序=CSS既定への落下で確定、書き手は不問のまま封じた |
| 消失継続 + hint=`ext-attr-hide` | **(b)確定**。hostHideReason/trail が経路名を名指し |
| 消失継続 + hint=`ancestor-collapsed` | **(a)確定・軸=親崩壊**。崩壊祖先を名指し→次版でB案が初めて正当化される |
| 消失継続 + hint=`style-wiped` | **(a)確定・host狙い撃ち**。Δ位相で時計の持ち主も判明 |
| 消失継続 + hint=`css-removed` | **(a)確定** + `styleReattachCount` が再取付回数を出す(実害も同時に止まる) |
| host が null で遷移を採れず | `unknown` + 理由を明示出力(**判定不能を判定不能と言う**) |

★ユーザーに読んでもらう行は **`hint:` と `位相:` の2行だけ**(往復1回で足りる)。

---

## C. 実装する案: A案(min-width/min-height 自衛)+ 計器修理 + 残穴封鎖

本版の「賭け」はA案ではなく、**①1266属性体制の残穴封鎖 ②計器の修理**。
A案は幾何軸(幅潰れ)への安価な保険として同乗させる。

- 統括の「親が display:none なら A は無効」は正しい。**が、その場合は計器が親を名指しする**ので
  版は無駄にならない(=「Aに賭けて外れたら1版無駄」という批判は計器同乗で無効化)。
- **外れたときの損害**: CSS 2行。最悪でも狭い列でのはみ出し(既存 max-width が上から抑える)。
  `[data-nls-hidden="1"]` は `display:none !important` なので min-* は非表示状態に無効
  = **既定動作は壊れない**。

### 差分

**1. 新規 `src/lib/inlineHostVanishClassifier.js`(純関数のみ)**

`classifyVanishSnapshot(snap)` → `{ hint, detail }`。判定順序を固定:
1. `hiddenAttr==='1'` → `'ext-attr-hide'`
2. `cssAlive===false` → `'css-removed'`
3. 祖先のどれかが `display:'none'` または w===0&&h===0 → `'ancestor-collapsed'`
4. `hostDisplay==='none'` かつ styleAttr に `display` を含まない → `'style-wiped'`
5. hostDisplay が none 以外なのに 0x0 → `'geometry-only'`
6. 入力欠損/上記以外 → `'unknown'`

`assessVanishPhase(deltas)` → サンプル<3 は `'insufficient'` / max−min<120ms は `'locked'` /
それ以外 `'walking'`。

**2. `src/lib/hostVanishForensics.js` 拡張**
- `noteVanishWithTrail` の obs に `snapshot`(入力+hint)と `pollDeltaMs` を追加(samples上限4は維持)
- `f.pollDeltas` 配列(最大6件)を追加
- `snapshotVanishForensics` / `formatVanishForensicsLine` に hint 行・位相行を追加

**3. `src/extension/content-entry.js`**
- **計器修理①**: `_hostStylePrevVisible`(2836)を廃止し `_hostMutPrevVisible` /
  `_hostRafPrevVisible` に分離(2855/2867 と 2892/2897 をそれぞれ置換)
- **計器修理②**: `startHostStyleMutationTrace` → `ensureHostAncestryMutationTrace(host)`(~40行)。
  `_hostTraceHost`/`_hostTraceParent` を保持し、どちらか変わったら disconnect→再observe
  (**初代固着の根治**)。host は
  `{attributes:true, attributeOldValue:true, attributeFilter:['style','class','hidden','aria-hidden','data-nls-hidden']}`、
  parent+grandparent は同filter(styleのみで可)、parent のみ `childList:true`
  (removedNodes に host が居るときだけ記録)。記録は
  `{nowMs, level, attr, oldValue(120字切詰), newValue(120字切詰)}` リング12件。
  stack 採取は host の becameHidden 遷移時のみ
- **配線**: rAF tick(2880)先頭で
  `if (host !== _hostTraceHost || host.parentElement !== _hostTraceParent) ensureHostAncestryMutationTrace(host)`
  — hot path 追加は**ポインタ比較2つのみ**。これ1箇所で生成+全移設経路を覆う。4121 は新関数名に置換
- **消失スナップショット**: rAF の遷移ブロック(2892-2897)で**遷移時のみ**採取:
  `host.getAttribute('style')`(160字切詰) / `data-nls-hidden` / 祖先3階層
  `{tag, class(40字), display, w, h}`(getComputedStyle×3・遷移時限定) /
  `cssAlive = !!document.getElementById(PAGE_FRAME_STYLE_ID)?.isConnected` /
  `pollDeltaMs = Date.now() − _lastLivePollTickAt`
- **位相計器**: `let _lastLivePollTickAt = 0;` を追加し、4秒 poll の tick 先頭
  (watch/非watch 両分岐より前の共通地点)で `_lastLivePollTickAt = Date.now()`(1行)
- **残穴封鎖(本命の防御)**: `ensurePageFrameStyleAlive()` 新設 —
  `if (!document.getElementById(PAGE_FRAME_STYLE_ID)) { _pageFrameStyleReattachCount++; ensurePageFrameStyle(); }`。
  復帰ゲートブロック2箇所(12820/12896)の先頭で呼ぶ(4秒に1回のO(1))。
  **理由**: 1266体制で拡張 `<style>` が消えると `[data-nls-hidden]` ルールが死に
  「こん太を押す前に出てしまう」逆事故になる。**既定動作の維持に必須**。カウンタは(a)の直接証拠にもなる
- **A案**: 3392 の CSS ブロックへ `min-width:280px; min-height:120px;` を追加。
  「hidden 時は display:none !important なので無効・既定動作に影響なし」をコメント明記
- **診断出力**: 新フィールド(hint / pollDeltas / phase / hostAncestryTrace要約 / styleReattachCount)を
  **statusFastDiagLite に必ず passthrough**([[fastdiag-lite-is-the-printer-subset]])

**4. 版**: v0.1.1267・patch 1つ・manifest/package/changelog 同期・`npm run verify:bump`・
出荷は `npm run verify:cc` 一本。

---

## D. 計器の設計(出力例)

```
消える直前の足跡 ⚠ 3回消失(足跡64件)
  [1] 0x0 display:none hint:style-wiped Δpoll:+1832ms
      style属性: "" ← "width:100%;display:block;opacity:1;…"(old 120字)
      祖先: DIV(933x600 block) > DIV(1280x720 flex) > MAIN(…)
      直前に走った処理: (なし=外部)
位相: pollDeltas [1832,1840,1828] → locked(拡張の4秒時計と同位相=内部が上流)
hostAncestryTrace: host:style×2 / parent:0 / 再attach×1 / 観測対象=現host ✅
styleReattach: 0回
```

- **親を観測対象に入れる**: parent+grandparent を attributeOldValue 付きで観測
- **壊れた変数共有の修理**: Mut用/rAF用の2変数に分離。旧名は完全削除(E節で再発防止)
- **「判定不能」の表現**: hint に `'unknown'` を持ち理由を detail に出す。
  さらに「観測対象=現host か」を常時併記(**初代固着の再発を毎回自己申告させる**)。
  0 は必ず観測回数と併記([[zero-count-may-mean-unmeasured-2026-08-04]])
- **hot path 非汚染**: 恒常追加はポインタ比較2つ。getComputedStyle 追加は消失遷移の瞬間のみ

---

## E. テスト(変異で赤にする対象)

1. `inlineHostVanishClassifier.test.js`: classify 6分岐 各1ケース + 優先順位ケース
   (hiddenAttr=1 かつ親0x0 → ext-attr-hide が勝つ)。assessVanishPhase 3分岐。
   **各条件を反転/削除する変異で対応テストが赤になることを書いた直後に確認**
2. `hostVanishForensics.test.js` 拡張: snapshot/pollDelta 保存・format に hint/位相行・samples上限4維持
3. wiring(**数で断言**):
   - `_hostStylePrevVisible` の出現 `toBe(0)`(旧名復活の変異で赤)
   - `ensureHostAncestryMutationTrace(` 呼び出し `toBe(2)` + `if (false)` 前置で赤
     (★regexは前後のアンカーまで固定すること。[[mutation-test-needs-anchored-regex-2026-08-05]])
   - `ensurePageFrameStyleAlive(` 呼び出し `toBe(2)`(復帰ゲート2分岐)
   - `_lastLivePollTickAt = Date.now()` `toBe(1)`
   - statusFastDiagLite に新キー(hint/pollDeltas/styleReattach)が各 `toBe(1)`
   - CSS ブロックに `min-width:280px` が `toBe(1)`

---

## F. 捨てた案と理由

- **B案(body直下 fixed)**: 実測は host **自身**の computed display:none であり、祖先から出しても
  機序が変わる保証がない。全 placement のレイアウト契約を壊す上、直っても直らなくても
  原因が確定しない(**変数を2つ同時に動かす**)。`ancestor-collapsed` が確定した将来版でのみ正当化
- **C案(復帰ゲート停止)**: v0.1.1250 の地雷そのもの。`recoverCount==vanishCount` は
  ゲートが**現に唯一の復帰経路として機能している証拠**。止めれば「2秒消える」が「永久に消える」になる。
  位相測定で止めずに同じ情報が採れる
- **D案(ShadowDOM)**: Shadow が守るのは子孫。攻撃面は host 要素自身の style 属性と祖先であり、
  shadowRoot を持たせても host の computed display:none は防げない。大改修に見合う防御ゼロ
- **おとり要素(sentinel div)**: 祖先スナップショットで同じ二分ができるため冗長
- **タイマー総当たり ablation**: 往復数十分の制約下で多分岐探索は不可能。位相Δで代替
- **統括の「cv0.001 は setInterval では出ない」論**: 誤りなので根拠に使わない
  (setInterval(4000) は通常この精度が出る)。だからこそ位相を実測する

---

## G. 地雷と回避策

- **復帰ゲート/autoshow ゲートの条件には一切触れない**(1250/1258の「消す側と戻す側の競り合い」)。
  本版の変更は観測+CSS+`<style>`生存ガードのみ。生存ガードは「壊れているなら直す」型だが、
  正常系では完全 no-op で、[[repair-gate-needs-to-know-normal-2026-08-05]] の
  「何が正常か」を getElementById の有無という一義的な条件で教えてある
- **hot path**: paint毎の走査・querySelectorAll は一切足さない(1201の前科)
- **速報肥大**: oldValue/styleAttr は必ず切り詰め(120/160字)・リング上限固定
- **lite passthrough 漏れ** = 計器が永久に見えない。wiring テストで固定(1124の前科)
- **min-width は hidden 状態に無効**であることをコメント+CSSテストで固定
- 変異テストは**書いた直後に赤を確認してから緑に戻す**
- push直後の dist buildId 1ズレは追わない。reality-checker 実行中に commit しない
- push報告には反映3手順(pull→拡張リロード→watchタブF5)を併記し、
  **読んでもらう行は「hint:」と「位相:」の2行だけ**と明記する
