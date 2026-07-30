# 設計書 — スクロール白化ゼロ保証(scroll-whiteout root-cause & freeze)

- 設計: Fable(claude-fable-5サブエージェント) / 裏取り: 司令塔(Claude Code)
- 日付: 2026-07-13
- 位置づけ: `/council-fable` 3段構え(会議ハーネス→Fable設計→実装引き継ぎ)の手順2の産物
- 会議素材・地雷マップの生ログ: このセッションのscratchpad(council-answers-whiteout.json / fable-brief-whiteout.md)。要点はこの設計書に統合済みのため別途保存はしない。

## 背景 — なぜこの設計を作ったか

実機診断で「スクロールすると応援パネルが一瞬白くなって消え、遅れて再描画される」現象が1回観測された(`scrollWhiteoutDiag`: kind=host, visibleNow:false)。プロジェクトには「host/iframeには一切触れない」という強い既存制約がある(過去の点滅事故=venue-cleanup-2026-07-10の教訓)。この制約を破らずに白化を根絶する設計。

## 裏取り済みの決定的事実(Exploreエージェント調査+Fable+司令塔の実ファイル確認)

- `src/lib/scrollWhiteoutProbe.js`の`judgeWhiteoutTransition`は**観測専用の純関数**。白化を防ぐ処理は一切実装されていない。`content-entry.js`の`ensureScrollWhiteoutSampler()`がscrollイベントに乗り250msスロットルで`video`要素と`#nls-inline-popup-host`を測定するだけ。
- host移設(iframeリロードを伴う)の発火箇所は最低7箇所存在(`host_created`・`anchored_video`・`floating_body`・`dock_body`等)。
- 既存の「host/iframe不可侵」ガード`shouldSkipInlineHostMoveForVenue`(`inlineHostMoveProbe.js:86`)は3条件AND(`venueOpen && hostConnected && hostHasIframe`)で移設をskipするが、**`venueOpen`という静的フラグに限定されており、スクロール中かどうかとは無関係**。既存ガードはスクロール白化を一切防いでいない。
- reflow対策自体は既にv0.1.407で高度化済み(ResizeObserver/IntersectionObserverで変化検知時のみdirtyフラグを立て、実描画はスクロール停止後にまとめて1回行う)。
- **Fableの新規発見(実ファイルで裏取り確認済み)**:
  1. 観測サンプルの`visibleNow:false`は「hostの高さが0になった」のではなく「hostに`display:none`か`visibility:hidden`が付いていた」ことを意味する(`visibleNow = display!=='none' && visibility!=='hidden'`という判定式のため)。
  2. 「スクロール中」を表す状態は、既に`content-entry.js:2956`の`pageFrameLayoutScrollDebounceTimer`(モジュール変数)として存在する。scrollイベントごとにセットされ、停止後debounce経過でnullに戻る。**新規グローバル状態を増やす必要はない**。
- 過去の類似バグ(別現象・複数タブ間の白化)の教訓: `memory/handoff_2026-06-04_web_version_and_whiteflash_session.md`で「省電力中プレースホルダをcontentに入れたら実機で両タブ白化が発生しrevert」。教訓: contentの描画初期化に手を入れるのは回帰リスクが大きい。

## A. 理想の白化ゼロ保証フロー

```
scroll発生
 │
 ├─ [W-1 相関計器] 白化を検知したら「直近の移設(reason/何ms前)+hostのdisplay/visibility実値」を
 │   同一サンプルに焼き込む → 状態速報コピペ1枚で真犯人が読める
 │
 ├─ [W-2 スクロール凍結] スクロール中(debounceタイマー係留中)は host移設を skip
 │   (venue凍結と同じ3条件AND思想: scrollingNow && hostConnected && hostHasIframe)
 │   → skipされた移設は、スクロール停止後の debounce発火 renderPageFrameOverlay が
 │      同じ判定を再評価して自然に実行する(遅延キュー不要・自己回復)
 │
 └─ [W-3 再描画側是正(条件付き)] W-1で「移設なし白化」が実測されたときのみ、
     該当render関数の「一旦hidden→再表示」窓を style-diff 化(実測前は着手禁止)
```

保証の意味論: 「白化ゼロ」= **`whiteoutCount`が増加しない**こと(計器が正)。✅は目視でなく計器の増加停止で判定する(既存原則`feedback-trust-status-report-over-browser-check`踏襲)。

## B. 統合アーキ(3コンポーネント)

| # | コンポーネント | 正本ファイル | 役割 |
|---|---|---|---|
| W-1 | 白化↔移設 相関計器 | `src/lib/scrollWhiteoutProbe.js`(拡張) | 白化サンプルに真犯人手がかりを同梱する純関数 |
| W-2 | スクロール凍結ガード | `src/lib/inlineHostMoveProbe.js`(拡張) | `shouldSkipInlineHostMoveWhileScrolling`純判定+skip計器 |
| W-2' | ガード配線 | `content-entry.js` | 既存ラッパー横に`shouldSkipHostMoveWhileScrollingNow(host)`を追加し、既存7箇所を`shouldSkipHostMoveNow`(venue OR scrollの合成)に置換 |

印字: `statusFastDiagLite`経由で新フィールドをpassthrough(**忘れると永久に見えない・v0.1.1124の実績地雷**)。

新規ファイルはゼロ。既存2つのprobe libに関数を足すだけ。新規グローバル状態もゼロ。

## C. 具体機構

### C-1. W-1 相関計器(scrollWhiteoutProbe.js 拡張)

`recordWhiteoutSample`のサンプルschemaに4フィールド追加:

```js
{
  lastMoveReason: string,   // _inlineHostMoveState.samples 末尾の reason('' = 移設記録なし)
  lastMoveAgoMs: number|null, // atMs - _inlineHostMoveState.lastAtMs(移設なしなら null)
  hostDisplay: string,      // getComputedStyle(host).display の実値('none' 等)
  hostVisibility: string    // 同 visibility('hidden' 等)
}
```

純関数1つ追加:

```js
/** 白化1件の真犯人分類。move: 直近1200ms以内に移設あり / repaint: 移設なしで不可視化 / unknown */
export function classifyWhiteoutCulprit({ lastMoveAgoMs }) {
  if (lastMoveAgoMs != null && lastMoveAgoMs <= 1200) return 'move';
  if (lastMoveAgoMs == null || lastMoveAgoMs > 1200) return 'repaint';
  return 'unknown';
}
```

閾値1200ms根拠 = whiteoutサンプラのthrottle 250ms + reflow debounce 150ms + interval 360ms + マージン。stateに`culpritMove`/`culpritRepaint`の集計カウンタを追加し`summarizeWhiteoutDiag`で出す。

配線(content-entry.js): host測定ブロック内で`_inlineHostMoveState.lastAtMs`と`samples.at(-1)?.reason`を読むだけ(同一モジュール変数・追加read/storageゼロ)。

### C-2. W-2 スクロール凍結(inlineHostMoveProbe.js 拡張)

**「スクロール中」の定義 = `pageFrameLayoutScrollDebounceTimer != null`(既存モジュール変数)。**

```js
// inlineHostMoveProbe.js に追加(venue版と同型・3条件AND)
export function shouldSkipInlineHostMoveWhileScrolling(input) {
  return (
    input?.scrollingNow === true &&
    input?.hostConnected === true &&   // 切断時は必ず再attach(鏡publish死守)= venue版と同一思想
    input?.hostHasIframe === true      // リロード実害がある状態のみ凍結
  );
}
export function recordInlineHostMoveScrollSkip(state) {
  state.scrollSkipCount = (Number(state?.scrollSkipCount) || 0) + 1;
  return state;
}
// summarizeInlineHostMoveDiag に scrollSkipCount を追加
```

content-entry.js側:

```js
function shouldSkipHostMoveWhileScrollingNow(host) {
  try {
    const skip = shouldSkipInlineHostMoveWhileScrolling({
      scrollingNow: pageFrameLayoutScrollDebounceTimer != null,
      hostConnected: Boolean(host && host.isConnected),
      hostHasIframe: Boolean(host && host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`))
    });
    if (skip) recordInlineHostMoveScrollSkip(_inlineHostMoveState);
    return skip;
  } catch { return false; } // fail-open(venue版と同一)
}
function shouldSkipHostMoveNow(host) {
  return shouldSkipHostMoveForVenueNow(host) || shouldSkipHostMoveWhileScrollingNow(host);
}
```

既存7箇所(3998 / 4149 / 5296 / 5303 / 5477 / 5484)を`shouldSkipHostMoveNow`に置換。`host_created`と`prewarm_offscreen`は`hostConnected=false`のため**ガードが自然に素通しする**(初回attachを止めない)。venue版の既存3条件は無変更。

**skip後の回復**: 停止後のdebounce発火(`renderPageFrameOverlay`)が同じ配置判定を再評価するので、必要な移設はそこで実行される。凍結解除キューは不要(venue凍結v0.1.1128と同じ自己回復パターン)。

### C-3. 印字・検証

- `statusFastDiagLite`に`scrollWhiteoutDiag`(新4フィールド+culprit集計)と`hostMoveDiag.scrollSkipCount`を**passthrough必須**+wiring断言テスト。
- テスト: 2つのlibにunit test(判定境界・skip計数・classify閾値)。`npm run verify:cc`一本で出荷判定。
- version bump 1つ+`npm run copy:ext`+ユーザー反映3手順。

## D. 真犯人切り分けの具体ロジック

**相関の取り方 = イベント時刻の突き合わせではなく「白化検知の瞬間に移設側stateを読んでサンプルに焼き込む」。** 両stateは同一モジュールのメモリ変数なので、リングバッファ同士を後から時刻でjoinする必要がない。

実測手順(1配信ぶん):
1. W-1のみ入れて配信ページで通常どおりスクロール。状態速報を1回コピペ。
2. `scrollWhiteoutDiag.samples[]`を読む。判定表:

| サンプルの中身 | 真犯人 | 次アクション |
|---|---|---|
| `lastMoveAgoMs ≤ 1200`かつ`lastMoveReason`あり | **host移設**(そのreasonが名指しされる) | W-2投入で根治 |
| `lastMoveAgoMs > 1200 or null`かつ`hostDisplay:'none'` | 再描画/hide経路 | W-3(条件付きフェーズ)へ |
| 同上かつ`hostVisibility:'hidden'` | 会場遮蔽の巻き添え | venue系の既知経路。判定除外を検討 |
| `visibleNow:true`で`nowH≤10` | 高さ潰れ(iframe/親レイアウト) | 別問題として切り出し |

3. W-2投入後、同条件でもう1配信。**`whiteoutCount`増加ゼロ かつ `scrollSkipCount > 0`**が「移設が犯人だった」ことの決定的証拠。skipが0のまま白化が続けば犯人はrepaint側=W-3へ。

## 論点C: repaint側が犯人だった場合の安全域

`ensureInlinePlayerObservers`/`ensureInlineHostReflowListener`の**中(検知・debounce機構)は触らない**。触ってよいのは各render関数の**style書き込み順序だけ**。それでも足りない場合のみ2026-06-04教訓ゾーン(content描画初期化)に接近するが、その判断はW-1の実測サンプルを添えて別途会議に戻す。**推測で先回りしてrender関数を触ることは本設計では禁止**。

## 論点D: CSS対症療法 vs 根治

**根治(W-2移設凍結)一択、CSSは入れない。** 理由: (1) compositing説は実測(visibleNow:false=スタイル不可視)と矛盾する。GPU合成遅延ならcomputed styleは変わらないはず。(2) `will-change`常設はメモリ/レイヤー爆発の副作用があり「どんな状態でも」の保証に逆行。

## E. MVP — W-1 相関計器を最初に作る

理由: 実観測は今のところ1回だけで、真犯人は未確定。「推測で直さず観測を先に」がこのリポの確立原則であり、W-2を先に入れると「直ったように見えるが犯人が別」の嘘の緑を作るリスクがある。W-1は既存2 libへの純関数追加+content-entry数行+lite passthroughで半日以内・回帰リスクほぼゼロ。W-2はその実測1枚を見てから同日中に積める軽さ(venue版の完全な同型)。

## F. 捨てた案と理由

| 案 | 捨てた理由 |
|---|---|
| CSS強制レイヤー昇格(will-change/translateZ) | 会議統括の推しだが、観測サンプル(visibleNow:false)と機序が矛盾。iframeリロード空白に無力。副作用あり |
| position: sticky化 | host配置契約の変更=「host/iframe不可侵」違反。placement 4モードすべての回帰テストが必要になり過剰 |
| MutationObserverでdetach検知→見た目でごまかす | ローディング演出全面禁止に抵触・対症療法・新規監視1本増 |
| 白化中プレースホルダ表示 | 2026-06-04に実機で両タブ白化を悪化させrevertした前科そのもの |
| 移設の遅延実行キュー(skip分を貯めて後で流す) | debounce発火のrenderが配置判定を再評価するので自己回復する。キューは状態を増やすだけの過剰設計 |
| 新規「スクロール状態マネージャ」lib | `pageFrameLayoutScrollDebounceTimer != null`で足りる。正本1つ原則・重量級基盤回避 |
| 2つのリングバッファを時刻でjoinする事後相関 | cap5/cap8で取りこぼす。検知瞬間の焼き込みなら確実+実装も小さい |

## G. 地雷と回避策

1. **fastDiagLite passthrough漏れ**(実績地雷・v0.1.1124で踏んだ): 新フィールドはliteに通さないとコピペに永久に出ない。wiring断言テストをセットでコミット。
2. **検証エージェント並走中のcommit禁止**(detached HEAD事故の実績)。
3. **ガードのfail-close化禁止**: 判定例外時は必ず`return false`(移設許可)。凍結が誤爆で永続すると①パネルが正位置に来なくなる。
4. **hostConnected条件を外さない**: 外すと初回attach/再attachまで凍結し鏡publishが死ぬ。
5. **`host_created`のdisplay:none窓はW-2では消えない**: 新規生成→render完了までのnoneは移設凍結の対象外。W-1が`hostDisplay:'none'`+`lastMoveReason:'host_created'`でこれを名指しする。
6. **whiteoutサンプラ自体のthrottle 250ms**: 250ms未満の白化は観測をすり抜ける。ゼロ保証の✅判定は「countが増えない」であって「白化が物理的に不可能」ではない。
7. **スクロール凍結中にplacement設定変更が来るケース**: floating→dock切替等は停止後debounceで自動追随するため実害なし(「切替が最大debounce ms遅れる」体感は仕様として許容)。

## 実装順まとめ

① W-1(scrollWhiteoutProbe拡張+content-entry焼き込み+lite passthrough+テスト・1 patch) → ② 実配信で状態速報1枚 → ③ 判定表で犯人確定 → ④ move犯ならW-2(inlineHostMoveProbe拡張+7箇所置換・1 patch) / repaint犯なら該当render関数のstyle書き順のみ是正 → ⑤ `whiteoutCount`増加停止+`scrollSkipCount>0`で✅。
