# 会場モードの「配置と見た目」3つの判断 — 設計書(DESIGN)

> **設計=Fable / 会議素材=無料会議13体のうち5体 / 裏取り=司令塔(実コードの行番号・関数名・数値を確認) / 2026-10-17**
> 3段構えワークフロー(council-fable)の手順2の産物。実装ハンドオフ: [venue-layout-3decisions-IMPLEMENTATION-HANDOFF-2026-10-17.md](venue-layout-3decisions-IMPLEMENTATION-HANDOFF-2026-10-17.md)
> コードは変更していない(設計のみ)。

## 0. お題と結論(先出し)

ユーザー指示(2026-10-17):「コメント入力欄が会場に覆われる」「広告列の飾りが会場とポップアップで違う」「👥一覧パネルがヘッダーを覆う」の3つは**会議で決める**。

| 判断 | 結論 | 要ユーザー判断 |
|---|---|---|
| Q1 コメント入力欄 | **「しまう/戻す」(tuck)** を採用。会場を閉じずに会場の箱だけ隠し、既存の右下ピルを「▲ 会場に戻る」にする。集計・DOM・パネル状態は保持 | なし(配信者が会場を開いたままコメントする頻度は**推測**。頻度が低い前提で「必要なときだけ1タップ」にした) |
| Q2 広告段 | **会場の広告段を `--gift` → `--ad` にする(1語)**。popup/別窓と同じ飾りなしになり、「3画面は同じ」が1行で満たされる | **あり**: 「広告段をギフトと同じ金色カードにするか/飾りなしのままか」の二択。価値序列(広告pt vs ギフトpt)は未確定なので今は決めない |
| Q3 一覧パネル | パネルの**下端を「会場の箱の最大上端」より上に固定**(`max-height:72vh` → `bottom: calc(var(--nlsb-venue-max-h,48vh) + 88px)`)。あわせて外側クリックで**自分の開閉ボタンを除外** | なし |

## 1. 確認済みの事実(実測。実コードで裏取り済み)

1. **コメント入力欄はニコ生ページ側の固定位置**: 表示幅 420/640/900 で `[226,544,358,36]`、1280/1600 で `[219〜265,688,358,36]`(x,y,w,h)。ウィンドウの高さには依存しない。
2. **会場の箱(`.nlsb-seating`)は画面の下端に固定**。高さ約346〜480px(`max-height: var(--nlsb-venue-max-h,48vh)`・[venueBar.js:873](../../src/extension/venueBar.js))。下端は `H−79px`(stage の下余白)。実測 [x,y,w,h]: 1280x720 → [38,295,1188,346] / 1280x1000 → [38,441,1188,480] / 900x900 → [10,389,865,432] / 420x900 → [10,389,385,432]。
3. したがって**覆われるかはウィンドウ高さ×レイアウトで決まる**。実測(入力欄の中心の elementFromPoint): 1280x720=覆われない / 1280x1000・1600x900=覆われる(案内文・空欄注記) / 640x900=トップバー / 900x900=応援レーン。★「720は覆われない」は**1280x720(広いレイアウト・y=688)のみの実測**。狭いレイアウト(入力欄 y=544〜580)の 420x720・900x720 は箱が 295〜641 を占めるため**覆われると予測(未実測・要実測)**。
4. **広告段の器**: 会場は `makeWrap('nl-story-userlane-tier-wrap--gift')`([venueBar.js:2419](../../src/extension/venueBar.js))で、CSS(:1243)= 余白6px・枠1px・金寄りの背景。popup/別窓はギフトが `--gift`(金色カード)、広告が `--ad`(**CSS規則なし=飾りなし**)。会場の広告段は popup より内幅が14px狭い。経緯: v0.1.1047(ひな壇3D→応援レーン段組みへ統一)で会場が広告にも `--gift` を付けた。意図か写し漏れかは記録上不明。★parity テスト(`laneCssSync.parity.test.js`)は CSS セレクタの集合を比べるだけで、DOM にどのクラスを付けるかは見ない=この差は検査に見えない。
5. **一覧パネル**: `.nlsb-roster-panel`([venueBar.js:1623](../../src/extension/venueBar.js))= `position:absolute; top:8%; left:50%; width:min(560px,92vw); max-height:72vh; z-index:6`(親は fixed 全面の stage)。ヘッダーは seating の最上段=画面下半分の中にあり、パネルの縦範囲(8%〜80%)と重なる。実測: 420/640 でヘッダー6ボタン全部、1280 で4/6が押せない。
6. `--nlsb-venue-max-h` は [venueBar.js:5320-5326](../../src/extension/venueBar.js) で **seating の inline style に**注入(値は常に 48=`resolveVenueMaxHeightVh`・[venueViewport.js:114](../../src/lib/venueViewport.js))。パネルは stage の子なので、注入先が seating だとパネルからは見えない。
7. 外側クリックで閉じる処理(v0.1.1648 で document のキャプチャ段階)は、**自分の開閉ボタンを除外していない**([venueBar.js:3841](../../src/extension/venueBar.js) `onRosterOutsideClick`・:4107 `onDiagOutsideClick`)。ヘッダーが押せるようになると「開いている状態で『👥一覧』を押す→キャプチャで閉じる→ボタンで再度開く」の二重トグルが顕在化する。
8. `[hidden]` 安全網(v0.1.1650)により、会場配下の `hidden` 属性は `display:none !important`。tuck に `hidden` を使うと `seatsHost.clientWidth` が0になり perRow の再計算が変わる → **tuck は `visibility` で行う**。

## 2. 会議の裁定(少数意見の採否)

| 案 | 出所 | 裁定 | 理由 |
|---|---|---|---|
| 入力欄の置換/複製/オーバーレイ | qwen | **不採用** | ニコ生の `___comment-text-box___…` と送信機構は拡張の外。複製は状態管理が壊れる |
| 「3画面の同じ」を「意味の同一」へ読み替え(広告=銀/プラチナ) | qwen | **不採用** | ユーザー指示の再定義 |
| サイドドロワー | qwen/llama | **不採用** | 新しい UI 面=過剰 |
| 会場を折りたたみバーに | qwen | **不採用(tuck の過剰版)** | 既存トグルの再利用で足りる |
| 箱を入力欄より上に(`top: calc(入力欄bottom+10px)`) | llama | **不採用** | 入力欄はページ側の座標で会場CSSから参照できない。箱を上へ押すと映像を覆う |
| 箱の高さを30%以下に | gpt-oss | **不採用** | 48vh は会議確定済み・撤回理由なし |
| 広告は金色の濃度80% | gpt-oss | **不採用** | 価値序列が未確定で根拠なし |
| z-index でヘッダーを前へ | gpt-oss | **不採用** | パネルが欠けるだけで解決にならない |
| **飾りなしに揃える** | llama | **採用(Q2)** | 1語で「3画面は同じ」を満たす |
| **パネルは高さ制限で解く** | gpt-oss | **採用の方向(Q3)** | ただし z-index 案は不採用 |

★会議の統合表は、nvidia(統括役)が 503 で欠落し、批判役が統合を兼ねた回=参考扱い(`council-lead-fallback-biases-synthesis`)。

## 3. A. 理想の体験フロー

1. 配信者がサイドパネル(幅≈420)で会場を開く。映像は見える。広告段は①応援レーンと同じ飾りなし、ギフト段は金カード=「どこで見ても同じ」。
2. 「👥一覧」を押す → パネルは映像の上に出るが**会場の箱にはかからない**。ヘッダーの6ボタンは押せたまま。もう一度押す/✕/Esc/外側クリックで閉じる(二重トグルなし)。
3. コメントを打ちたい → ヘッダーの「✍ しまう」を1タップ → 会場の箱と吹き出しが消え(状態は保持)、右下に「▲ 会場に戻る」。ニコ生の入力欄がそのまま押せる。打ち終わったらピルを1タップ → 瞬時に元の会場(再集計なし・席順同じ)。
4. 会場を✕で閉じれば tuck も解除(閉→開で必ず通常状態から始まる)。

## 4. B. 統合アーキ(すべて venueBar.js 内の既存部品に接ぐ)

| # | 部品 | 既存の接点 | 新規 |
|---|---|---|---|
| B1 広告段の器 | `adWrap = makeWrap('…--gift')` :2419 | クラス名を `--ad` に。CSS追加なし |
| B2 パネルの縦域 | `.nlsb-roster-panel` :1623 / `--nlsb-venue-max-h` 注入 :5320-5326 / stage :2557・`stage.append(…, rosterPanel, speechPanel, diagPanel, …)` :2882 | CSS: `bottom:` 1行・`max-height` 削除。JS: 注入先を stage に |
| B3 開閉ボタン除外 | `onRosterOutsideClick` :3841 / `onDiagOutsideClick` :4107 / `rosterBtn` :2631 / `diagBtn` :2639 | 各1行 `if (rosterBtn.contains(target)) return;` |
| B4 tuck | `root`/`stage`/`seating`/`.nlsb-bubble-layer`/`.nlsb-toggle`(:565・`html.nlsb-venue-open .nlsb-toggle{display:none}` :597)/`toggle` click :7021/`setOpen` :6967 | 状態 `tucked` 1個・`setTucked(bool)` 1関数・ヘッダーボタン1個・CSS 3規則 |

配線: `setOpen(false)` → `setTucked(false)` を先頭で。`toggle` click → `tucked ? setTucked(false) : setOpen(!open,true)`。**Esc は触らない**(tuck 中は入力欄にフォーカスがあり、Esc はニコ生側の意味を持つ可能性)。

## 5. C. 具体機構

### C1(Q2・v1)
- [venueBar.js:2419](../../src/extension/venueBar.js) → `const adWrap = makeWrap('nl-story-userlane-tier-wrap--ad');`
- CSS 変更なし(`--ad` に規則が無い=popup と同じ飾りなし。:2324 の `--gift .nl-story-userlane` 打消しは広告段に当たらなくなり、:2316 の行 surface が効く=popup と同じ構造)。
- `laneCssSync.parity.test.js` の宣言変更なし(セレクタ集合は不変)。
- 価値序列が「金色」と決まった場合(今回はやらない): `.nl-story-userlane-tier-wrap--ad {…}` を popup.html(:1004 の直後)/ app/live-view.html(:885 の直後)/ venueBar.js の SYNC 区間(:1243 の直後・`.nlsb-venue-lane-stack` 接頭辞付き)に**同時追加**+:2324 の打消しに `--ad` 併記(区間外)。3面揃えば parity 宣言は不要。

### C2(Q3・v2)
- CSS `.nlsb-roster-panel`: `max-height: 72vh;` を削除し `bottom: calc(var(--nlsb-venue-max-h, 48vh) + 88px);` を追加(88 = 実測の箱下端オフセット 79px + 余白 9px。コメントに実測根拠を書く)。`.nlsb-roster-list{overflow-y:auto}` は既存。flex 子の `min-height:0` が無ければ足す(要確認)。
- JS :5320-5326: `seatsHost.parentElement`(=seating)→ `stage` に注入先を**置換**(両方に書かない=正本1つ)。カスタムプロパティは継承するので seating の `max-height: var(--nlsb-venue-max-h,48vh)`(:873)はそのまま効く。`stage` がその関数スコープから見えるか要確認(見えなければ `seatingHostEl.closest('.nlsb-stage')`)。
- JS :3841 / :4107: `if (target && (rosterPanel.contains(target) || rosterBtn.contains(target))) return;`(diag も同様)。add/remove の行は触らない。
- 高さ別の期待値(パネル縦域 = 0.08H 〜 H−48vh−88): H=720→58〜286(228px)/900→72〜380(308px)/1000→80〜432(352px)。短い窓で一覧5〜7行=許容(モーダルなのでスクロール)。

### C3(Q1・v3)
- CSS(VENUE_CSS・LANE_CSS_SYNC 区間の**外**・`.nlsb-seating {` 本体は触らず別規則):
  - `.nlsb-root.nlsb-is-tucked .nlsb-seating, .nlsb-root.nlsb-is-tucked .nlsb-bubble-layer { visibility: hidden; pointer-events: none; }`
  - `html.nlsb-venue-open.nlsb-venue-tucked .nlsb-toggle { display: inline-flex; }`(:597 の `display:none` を詳細度で上回る。`.nlsb-toggle` の既定 display と同じにする=要確認)
  - `.nlsb-root.nlsb-is-tucked .nlsb-gift-proj { visibility: hidden; }`(投げ物は席起点)
- JS: `let tucked = false;` と `setTucked(next)`(`root` の `nlsb-is-tucked`・`html` の `nlsb-venue-tucked` を toggle、`toggle.textContent` を「▲ 会場に戻る」/元の「🏟 会場モード」へ、tuck 時は `closeSpeechPanel()`・一覧/診断パネルを閉じ・`closeHoverCard()`)。ヘッダー右に `tuckBtn`(`.nlsb-comeview-btn`・「✍ しまう」・title「コメントを打つあいだ会場をしまう(記録は続きます)」)を `rosterBtn` の前に追加。`toggle` click :7021 の先頭で `if (tucked) { setTucked(false); return; }`。`setOpen` :6967 は閉じるとき `setTucked(false)`。
- 「必要なときだけボタンを出す」(入力欄の elementFromPoint 測定)は**やらない**: ニコ生 DOM のセレクタ依存を製品に入れない。測定は監査側(scripts/audit)だけ。

## 6. D. 偽陽性・退行つぶし

1. **計測道具**: `scripts/audit/runtime-venue-audit.mjs` に `--heights 720,900,1000` を足す(`setWidth` は height:900 固定=高さ格子は未対応)。`setSize(w,h)`(CDP `Emulation.setDeviceMetricsOverride`)に。各格子で (a) `itemF().commentInput.passThrough` と `hits[].hit` (b) `itemB(['.nlsb-header'])` (c) v3 では tuck 状態(「しまう」を click→再測→ピル click→再測)。
2. **前後比較(各版)**: v1 = `G.diffs` の `ad/tierWrap` の padding/border/background 差が消える / v2 = 一覧パネルを開いた状態で `.nlsb-header` の `covered` が 420/640/1280 すべて 0 / v3 = tuck 中 `commentInput.passThrough === true` が9格子すべて・戻した後に席数(`.nlsb-root .nl-story-userlane-cell` 数)と開閉状態が tuck 前と一致。
3. **偽陽性の芽**: (i) 入力欄の探索はニコ生 DOM 依存=`found:false` は合格でなく「測れず」として赤 (ii) 放送ごとに席数が違う=「覆われない」は elementFromPoint の**帰属**(`.nlsb-root` 配下か)で判定し座標では判定しない (iii) headless の `innerHeight` と `setDeviceMetricsOverride` の整合を毎回記録 (iv) v2 で `getComputedStyle(seating).maxHeight` が @900 で `432px`(注入先変更の退行がない)。
4. **ソース固定テスト(元に戻すと赤)**: `venueAdTierWrap.wiring.test.js`(`makeWrap('…--ad')` が1回・`--gift` が1回・popup.html/live-view.html に `--ad` 規則が**無い**ことも固定) / `venuePanelBottom.wiring.test.js`(`.nlsb-roster-panel {` 本体に `bottom: calc(var(--nlsb-venue-max-h` を含み `max-height: 72vh` を含まない・注入先が `stage`・`onRosterOutsideClick` 本体に `rosterBtn.contains`) / `venueTuck.wiring.test.js`(3規則・`setOpen` 内の `setTucked(false)`・`onEscapeKey` に `tucked` が**出てこない**)。既存の `venueClickThrough.wiring.test.js`・`hiddenSafetyNet.wiring.test.js` は無変更で緑のまま(tuck は hidden 属性を使わない)。
5. **既存動作の非退行**: スクロール/ドラッグ・ホバーカード・記録経路は触らない。v3 で tuck→戻すの前後で `renderSeats` が走らないこと(`_lastVenueSeatsDiagObs.lastUpdateAt` が変わらない)。

## 7. E. MVP(最初に出す1版)

**v1 = C1(広告段を `--ad` に)**: venueBar.js:2419 の1語+wiring テスト1本+監査の前後 JSON。bump 3点。changelog summary 例「会場の広告段を①と同じ飾りなしに」(35字以内)。**同時にユーザーへ1つ質問**: 「広告段をギフトと同じ金色カードにしますか(3面同時に金色化)/①と同じ飾りなしのままにしますか」。回答待ちの間に v2 へ進んでよい(v1 と独立)。

## 8. F. 捨てた案と理由

- **箱の最大高さを入力欄の手前まで**: 箱は下端固定で入力欄より下まで伸びる。高さを削っても露出しない。露出させるには箱を入力欄の下に押し込む=H=900 で97px(ヘッダーのみ)=本体機能の退行。
- **箱に穴(clip-path)**: ヒットテストにも効くので機能はするが、穴の位置はニコ生 DOM を JS で測る(セレクタ依存・resize/scroll 追従)+タイルが穴の形に欠ける。
- **箱を左右へ寄せる**: 幅420では入力欄がほぼ全幅(x=226〜584)で寄せる余地なし。
- **箱の pointer-events:none+子だけ auto**: 行 surface(`.nl-story-userlane` の背景・:2316)が不透明で入力欄を隠すため通らない。
- **「覆われているときだけボタンを出す」**: 製品内で elementFromPoint 測定とニコ生セレクタが要る。常設ボタンの方が壊れない。
- **自動で閉じる/縮める**: 「一度出た人は消えない」「触れそう」の判定も外部 DOM 依存。
- **現状維持+説明**: ✕→再オープンは `clearDisplay()` で DOM と集計を捨てるため再描画コストと席順の再計算が入る。
- **パネルを会場の箱の中に/ドロワー**: 席の高さを侵す(roster は「席の高さを侵さない overlay」が設計意図 :2873)/新しい面。
- **パネルの下端を JS で実測**: resize 追従と再計算が要る。48vh は固定値なので CSS で足りる。
- **Esc で tuck 解除**: 入力中の Esc をニコ生側から奪う恐れ。トグルピル1つで足りる。

## 9. G. 地雷と回避策

- **CRLF**: venueBar.js は CRLF。Edit は行末を含めない短い一致で。テストは `.replace(/\r\n/g,'\n')` 済みの型(`venueHeaderWrap.wiring.test.js`)を踏襲。
- **Bash の heredoc はバックスラッシュを壊す**: 編集用スクリプトは Write ツールで cjs ファイルとして作る。
- **max-lines 上限**: venueBar.js のラチェット値を要確認(`npm run verify:cc` で赤なら `setTucked` を `src/lib/venueTuck.js` の純関数(クラス名の配列を返す)に切り出す)。
- **VENUE_CSS は文字列**: `${` とバッククォートを CSS に書かない(`extractVenueSyncCss` が throw)。新規則は LANE_CSS_SYNC_BEGIN/END の**外**に置く(区間内直接編集は parity 赤)。
- **パリティテスト**: v1 はセレクタ集合不変=宣言変更なし。`--ad` 規則を足すなら3面同時。
- **pointer-events の継承**: root/stage/stage-layout は none(v1648)。tuck で seating を none にしても他は変えない。ピル `.nlsb-toggle` は `pointer-events:auto` 明示済み(`venueClickThrough.wiring.test.js` が固定)。
- **[hidden] 安全網**: tuck に `hidden` 属性を使わない。`visibility:hidden` で。
- **Esc/外側クリック配線**: outside-click は document キャプチャ(true)固定(テストが文字列一致)。ボタン除外は handler 本体に足すだけで add/remove 行は触らない。Esc 連鎖は不変。
- **`--nlsb-venue-max-h` の注入先変更**: seating の inline に残らないよう**置換**(両方に書かない)。`resolveVenueMaxHeightVh` の署名・値は不変。
- **監査の既定 height=900**: 高さ格子を足すまで「720 は覆われない」を一般化しない。
- **配信視聴中の copy:ext 禁止**・bump は1版1変更・`git add` は新規ファイルと `.html`/scripts を明示。
- **要確認一覧**: `.nlsb-roster-list` の flex `min-height:0` / :5320 からの `stage` スコープ / `.nlsb-toggle` の既定 display と初期文言の生成箇所(:2553 `🏟 会場モード`) / 420x720・900x720 の入力欄被覆(予測のみ) / venueBar.js の max-lines ラチェット値。
