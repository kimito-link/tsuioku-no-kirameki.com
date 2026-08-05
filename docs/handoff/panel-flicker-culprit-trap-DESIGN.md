# v0.1.1268 設計書 — 同期トラップで「display:none を書いた犯人」を名指しする

> 設計 = Fable(claude-fable-5) / 素材 = 会議ハーネス4体 / 裏取り = Claude Code(司令塔)
> 日付: 2026-08-05 ／ 第2ラウンド(v0.1.1267 の実測を受けて)
> ブリーフ: `panel-flicker-round2-brief-2026-08-05.md`

---

## ★この設計の最重要点(ここを外すとまた空振りする)

**トラップは MAIN world(`page-intercept-entry.js`)に置く。content-entry に置くと永遠に 0 のまま。**

Chrome の content script は **isolated world** で動く。DOM ノードは共有されるが
**JS のラッパーは world ごとに別物**。よって content-entry(isolated)から
`Object.defineProperty(host.style, 'display', ...)` しても、
**ページ(main world)の書き込みは別ラッパーを通るので絶対に発火しない**。

司令塔が chrome-devtools MCP で実証した実験は DevTools コンソール = main world だった。
この world 境界を見落とすと「実証済みの方法を実装したのに 0 が出る」という
最悪の空振りになる。**レビューで最初に確認する点。**

幸い本拡張は `page-intercept-entry.js` が既に MAIN world 常駐
(manifest 58行 `"world": "MAIN"` / document_start)。**manifest 変更は不要。**

### 副産物: 「自分が犯人」と誤報する経路が原理的に無い

world が分かれているため、拡張(isolated)の `host.style.display = ...` は
main world のアクセサを**物理的に通らない**。
→ reentrancy フラグ不要。自分の書き込みは既存の hostFlipCensus が持ち場のまま担当する。

---

## A. 結論 — 書き手は「ページ(main world)のスクリプト」が最有力

1. **拡張側の経路は閉じている**。display を書くのは `content-entry.js:3100` の1箇所のみ
   (司令塔が裏取り: `setProperty('display')` 0件 / host への `cssText`・`setAttribute('style')` 0件 /
   他ファイルからの inline 書き込み無し)。その計器 hostFlipCensus が 0。
2. **消失時の状態は拡張の経路では作れない**。v0.1.1266 以降、拡張が display:none を書くときは
   必ず `data-nls-hidden` 属性をセットで付ける(同一関数内で連続実行)。
   観測は「style に hidden 一式(display:none / pointer-events:none / opacity:0)が居るのに
   属性が無い」= `setInlineHostVisible(false)` の指紋なのに属性だけ欠ける
   = **過去に拡張が書いた style 文字列の"復元"**の形。
3. **styleAttr は3経路の地層**。height:600px=prewarm / width:933px=anchored の数値系 /
   max-width:100%=dock。現在のどの単一経路の出力とも一致しない
   = 誰かが古いスナップショットを丸ごと書き戻した形と整合。
4. 消失間隔 4008/4003ms(cv 0.001)+ 直前1.2秒の拡張無活動 + ニコ生の4秒ハートビート。

★ただし**断定はしない**。トラップは「他拡張の isolated world / ブラウザ内部」が犯人の場合
構造的に 0 を出すので、**0 の意味を三分岐で印字する**(§B-7)。

---

## B. 同期トラップの設計

### B-1. 包む対象とスコープ — 全てインスタンス限定・prototype 無改変

`page-intercept-entry.js` に `installHostDisplayWriteTrap(el)` を追加(IIFE 内・依存なし):

| 経路 | 実装 | スコープ |
|---|---|---|
| `el.style.display = v` | `Object.defineProperty(el.style,'display',{configurable:true,enumerable:true,get,set})` | インスタンス |
| `el.style.setProperty(...)` | `el.style.setProperty = function(...)` — **own property が prototype を shadow する** | インスタンス |
| `el.style.cssText = s` | prototype から descriptor を取り、インスタンスに転送 own accessor を定義 | インスタンス |
| `el.setAttribute('style',s)` | `el.setAttribute = function(...)` — own shadow。`name!=='style'` は即素通し | インスタンス |

- original は**装着前に closure へ保存**。display setter の転送は保存済み original
  `setProperty.call(el.style,'display',v)` を使う(自分の shadow を再帰しない)。
  getter は `getPropertyValue('display')`(`this.display` は無限再帰)。
- **ページ全体への副作用ゼロ**(prototype 不改変)。会議の批判役が指摘した
  「他拡張・ページと競合する」懸念はこれで消える。
- 未捕獲経路(意図的スコープ外): `removeProperty('display')` / `removeAttribute('style')` /
  `Element.prototype.setAttribute.call(host,...)` 直呼び。
  観測された終状態は「style に display:none が**存在する**」ので対象外。註記のみ残す。

### B-2. 捕獲条件とコスト

- **stack 採取は「none へ向かう書き込み」のみ**(display への 'none' 代入 /
  `setProperty('display','none')` / cssText・setAttribute の値が `/display\s*:\s*none/`)。
- stack は**最初の4回だけ**採取、以後はカウンタのみ(4秒周期で無限に伸びるのを防ぐ)。
- 全 wrapper は O(1)・DOM 走査なし。
- 記録は「try{記録}catch{} → 必ず original を呼ぶ」の順。**記録の失敗が書き込みを壊さない**。
- ★**値の改変・拒否は今版では絶対にしない**(観測に徹する)。
  犯人特定前の対処は v0.1.1250(唯一の復帰経路を塞いだ)の再演リスク。

### B-3. 装着タイミングと張り直し

host は content-entry(isolated)が作るので main world は自力で見つけられない。**arm イベント駆動**:

- content-entry 側: `window.dispatchEvent(new CustomEvent('nls:hwt-arm'))` を**ちょうど2箇所**から:
  1. `ensureInlinePopupHost()` 内、`ensureHostAncestryMutationTrace(host)` の直後
  2. rAF tick の既存 pointer 比較ブロック内に専用変数で:
     `if (host !== _hwtArmedHost) { _hwtArmedHost = host; ...dispatch... }`
     → フレーム毎の追加コストは**ポインタ比較1個**(v0.1.1201 の教訓)
- page-intercept 側: `addEventListener('nls:hwt-arm', ...)` で host を取り、**WeakSet で idempotent** 装着。
- 移設(親変更)では style オブジェクトは不変なので張り直し不要。**再生成のみ**が対象。
  observer と違い「初代固着」は WeakSet 判定で起こらない。

### B-4. 報告経路(main → isolated)

既存の token 付き `postNlsIntercept`(88行)に新 MSG を追加:
- `MSG_HOST_WRITE_TRAP = 'NLS_HOST_WRITE_TRAP'`
- ①**装着結果**(armed:true/false + 失敗 reason)を装着試行のたび即時1回。
  ★**0 と未計測を区別するため必須**
- ②捕獲は main 側で集約し **1秒スロットル**で送る:
  `{counts:{prop,setProperty,cssText,setAttribute}, noneWrites, newSamples:[{route,valueHead(80字),frames(先頭3行×160字),t}]}`
- content-entry 側: 既存 NLS リスナー(token 検証込み)に分岐を1つ追加。

### B-5. 新 pure lib: `src/lib/hostWriteTrap.js`

```
createHostWriteTrapState()
noteHostWriteTrapArmed(state, ok, reason)
noteHostWriteTrapReport(state, detail)        // counts合算・samples cap4
pickCulpritFrame(frames, ownExtensionOrigin)  // 自拡張とトラップ自身のフレームを飛ばし最初の外部フレーム
classifyCulpritUrl(url, ownOrigin)            // 'page'|'other-extension'|'own-extension'|'unknown'
snapshotHostWriteTrap(state)
formatHostWriteTrapLine(snap)
```
`ownExtensionOrigin` は content-entry 側で `chrome.runtime.getURL('')` を渡す(lib は純関数のまま)。

### B-6. 速報の1行(犯人の名指し)

```
犯人トラップ ⚠ 外部が display:none を7回書いた(経路:setAttribute)
  犯人: https://live2.nicovideo.jp/.../watch_client.js:1:84213 (t.restoreLayout) [分類:ページ]
  書込値: "display: none; pointer-events: none; height: 600px; ..."
犯人トラップ ✅ 装着済み・外部の書き込み0回(消失が続くなら書き手はページではない)
犯人トラップ ⚪ 未装着(arm未受信 / defineProperty失敗:<reason>)
```

配線3点セット([[fastdiag-lite-is-the-printer-subset]]):
1. content-entry の速報組立**2箇所**に `hostWriteTrap: {...}` 追加
2. `statusFastDiagLite.js` に passthrough(2行)
3. サンプルは frames 3行×160字×4件 cap で lite の軽さを守る

### B-7. ★出たものの読み方(次の1往復で判定を終える分岐表)

| 観測 | 判定 |
|---|---|
| ⚠ + nicovideo.jp フレーム | **ページ確定・関数名入手** → 次版で対処設計 |
| ⚠ + chrome-extension://他ID | 他拡張(main world 注入型) |
| ⚠ + 自拡張ID | 計器矛盾(hostFlipCensus と突合)— 起きないはずの分岐を敢えて用意 |
| ✅ 0回のまま消失継続 | 書き手は**他拡張の isolated world か ブラウザ内部**(この方法の構造的死角)。
  次の一手 = **他拡張を全無効化して1配信試す** |
| ⚪ 未装着 | reason を読む(arm 不達なら wiring / defineProperty 失敗なら platform 制約) |

### B-8. 補助計器(10行・裁定Cの裏付け)

`captureVanishSnapshot` に `lastStyleMutation` を追加:
`_hostAncestryTrace.entries` から `attr==='style'` の最後の `{oldValue,newValue,ageMs}` を添付
(既に 120字 slice 済みのリングを読むだけ)。
old が「見えている style」で new が「hidden 一式を含む全文」なら
**1回の mutation で丸ごと書き換え** = setAttribute/cssText 型の復元が確定する。

---

## C. 未解決論点の裁定

**(1) `max-width:100%` は残骸(確度: 中)。**
dock_bottom が同時に書く position:fixed / left / right / bottom / z-index / box-shadow /
border-radius が styleAttr に**1つも無い**。styleAttr は136字で160字 slice に達していない
= **切り詰めではなく完全な全文**。「dock がその瞬間走った」なら消えない値が消えている以上、
過去の dock 通過の地層。**配置モード競合の追加調査に版を使わない**
— トラップが書込値を丸ごと採る + B-8 の old→new で次版の速報が機械的に決着させる。

**(2) 位相Δの「walking=外部」は撤回する。**
書き手が拡張内部の4秒 tick の非同期後段(microtask/rAF/observer)でも Δ はばらつく。
**非対称に読み直す: locked だけが「内部の4秒 tick が上流」を示す。walking は何も証明しない。**
修正は `formatVanishPhaseLine` の walking 文言を
「別の時計 **または** 同一時計の非同期後段(この計器では区別不能)」に変更 + docstring のみ。
閾値・構造は触らない(トラップが同期で答えを出すので投資しない)。

---

## D. テスト(書いた直後に変異で赤を確認してから commit)

`src/lib/hostWriteTrap.test.js`(新規):
1. `pickCulpritFrame`: [自拡張frame, 外部frame] → 外部を返す。
   **変異**: 全フレーム自拡張 → 'own-extension' 分類(スキップフィルタ削除で赤)
2. `classifyCulpritUrl`: nicovideo.jp→'page' / 他ID→'other-extension' / 自ID→'own-extension'
3. `noteHostWriteTrapReport`: 5件目で `noneWrites=5, samples.length=4`(cap)
4. `formatHostWriteTrapLine` 三態: ⚪は理由を含む / ✅は「書き手はページではない」を含む /
   ⚠は犯人フレームを含む。**0の意味区別を文字列で断言**
5. `statusFastDiagLite.test.js`: passthrough。**変異**: 行削除で赤
6. wiring(**数で断言**):
   - `nls:hwt-arm` dispatch が `toBe(2)`
   - NLS リスナー内 `NLS_HOST_WRITE_TRAP` 分岐が `toBe(1)`
   - page-intercept-entry.js の arm リスナー登録が**無条件実行文**であることを
     行頭アンカー正規表現で断言(`if(false)` 前置変異で赤
     — ★regex は前後のアンカーまで固定。[[mutation-test-needs-anchored-regex-2026-08-05]])
   - 速報組立2箇所への `hostWriteTrap:` 配線が `toBe(2)`
7. `inlineHostVanishClassifier.test.js`: walking 文言変更への追従

---

## E. 捨てた案と理由

- **prototype patch**: インスタンスの own property shadow で同じ呼び出しを捕獲でき、
  ページ・他拡張との競合リスクがゼロになる。ページ全体介入の理由が消滅
- **isolated world(content-entry)での装着**: ページの書き込みは別ラッパーを通るため
  **原理的に捕獲不能**。★今回最大の落とし穴
- **MutationObserver 再挑戦**: 禁止(非同期・スタック消失は確定事項)
- **トラップ内で none を拒否/即復元する防御**: 犯人特定前の対処は v0.1.1250 の再演リスク
- **全書き込みで stack 採取**: 4秒毎に無限に伸びる。cap4+カウンタで十分
- **位相計器の作り直し**: トラップが同期で犯人を取るため判定機能ごと不要化。文言修正のみ
- **`chrome.scripting.executeScript({world:'MAIN'})` 動的注入**: page-intercept が既に常駐

---

## F. 地雷と回避策

1. **world 境界(再掲・最重要)**: content-entry に置いたら永遠に 0。実装先は page-intercept-entry.js
2. **二重計上/無限再帰**: 転送は closure 保存済み original を使う。getter は `getPropertyValue`
3. **報告スロットル**: postMessage は1秒集約。滝コメント時の洪水を作らない
4. **イベント偽造**: `nls:hwt-arm` はページも発火できるが、装着対象は自 host のみ +
   WeakSet idempotent で実害なし
5. **速報肥大**: frames 3行×160字×4件 cap。**lite passthrough 必須**
6. **prewarm 経路**: host 生成は `ensureInlinePopupHost` に集約済みなので arm 1箇所目が覆う
7. **pre-push フックの dist buildId 1ズレ**は既知。追わない
8. **既定動作**: 本版は表示ロジックに一切触れない(観測のみ)。
   「こん太を押すまで出さない」に影響する diff が入っていたら設計違反
9. 出荷: patch bump v0.1.1268・manifest/package/changelog 同期・`npm run verify:cc` 一本

---

## 変更ファイル一覧(実装粒度)

| ファイル | 変更 |
|---|---|
| `src/extension/page-intercept-entry.js` | `installHostDisplayWriteTrap` + arm リスナー + 1秒スロットル報告 |
| `src/lib/hostWriteTrap.js`(新規) | state/note/pickCulpritFrame/classify/snapshot/format の純関数群 |
| `src/lib/hostWriteTrap.test.js`(新規) | D-1〜4 |
| `src/extension/content-entry.js` | arm dispatch 2箇所 / NLS リスナー分岐1 / 速報組立2箇所 / `captureVanishSnapshot` に lastStyleMutation |
| `src/lib/statusFastDiagLite.js` | hostWriteTrap passthrough(2行) |
| `src/lib/inlineHostVanishClassifier.js` | `formatVanishPhaseLine` の walking 文言 + docstring のみ |
| 既存 wiring テスト | D-5〜7 |
