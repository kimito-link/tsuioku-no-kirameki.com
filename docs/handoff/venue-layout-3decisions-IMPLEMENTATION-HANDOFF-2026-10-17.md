# 会場の配置3判断 — 実装ハンドオフ(この1枚だけで着手できる)

> 設計: [venue-layout-3decisions-DESIGN-2026-10-17.md](venue-layout-3decisions-DESIGN-2026-10-17.md)(設計=Fable / 裏取り=司令塔 / 2026-10-17)。**実装は別チャット/別モデルで**。このハンドオフは設計の「やる順番」と「合格の測り方」だけを書く。理由・捨てた案は設計書を読む。

## 読む順
1. 設計書 §0(結論)・§1(確認済みの事実)・§9(地雷)
2. `src/extension/venueBar.js`(CRLF・約7000行)の該当行: 広告段 :2419 / `.nlsb-roster-panel` :1623 / 注入 :5320-5326 / 外側クリック :3841・:4107 / 開閉 :6967・:7021
3. `scripts/audit/runtime-venue-audit.mjs`(実ブラウザ計測の土台・`itemF`=クリック透過・`itemB`=押せる要素・`G`=popup との style 差)

## スコープ(3版・順に・各版は独立してマージできる)
| 版 | 内容 | 変更の大きさ |
|---|---|---|
| **v1** | 会場の広告段の器を `--gift` → `--ad`(1語)。**同時にユーザーへ質問**(下記) | venueBar.js 1語 + wiring テスト1本 |
| **v2** | 一覧パネルの下端を「会場の箱の最大上端」より上に固定 + 開閉ボタンを外側クリックから除外 | CSS 1規則 + JS 数行 |
| **v3** | コメント入力のための「しまう/戻す」(tuck) | CSS 3規則 + JS 約30行 |

**やらない**: スマホ向け(safe-area・dvh・タッチ専用UI)・入力欄の置換/複製・自動で閉じる/縮める・ドロワー・価値序列の決定(ユーザー判断待ち)。

## 着手手順(全版共通)
1. `git checkout -b feat/venue-layout-v<N>`(master から。積む場合は前版のブランチから)。
2. 先に**実ブラウザで「前」を計測して JSON/PNG を保存**(下の計測)。
3. TDD: 先にソース固定テストを書いて赤を確認 → 実装 → 緑。
4. 実ブラウザで「後」を計測して前後差を確認(推測で「直った」と言わない)。
5. 「元に戻すと赤くなる」変異を各テストに1つ以上(テスト対象の規則/呼び出しを一時的に外して赤を確認→戻す)。
6. bump 3点(`package.json` / `extension/manifest.json` / `src/lib/changelog.js`・summary 35字以内)+ `tsuioku-no-kirameki/index.html` の版数。`changelog` は20版上限(`node scripts/split-changelog.mjs`)。
7. `npm run verify:cc`(`.html`・`scripts/`・新規テストを `git add` に含める。★v0.1.1650 で `.html` を add し忘れた実績あり)。

## v1(広告段)
- 変更: `venueBar.js:2419` `const adWrap = makeWrap('nl-story-userlane-tier-wrap--ad');`。CSS・parity 宣言は触らない。
- テスト `src/lib/venueAdTierWrap.wiring.test.js`: `makeWrap('nl-story-userlane-tier-wrap--ad')` が1回・`makeWrap('nl-story-userlane-tier-wrap--gift')` が1回(ギフト段のみ)。`extension/popup.html` と `app/live-view.html` に `.nl-story-userlane-tier-wrap--ad {` の規則が**無い**ことも固定(金色化したら意図的に宣言を変える)。
- 計測: `runtime-venue-audit.mjs` の G(会場と popup の style 差)で `ad/tierWrap` の padding・border・background の差が消える(`same` に移る)。
- changelog summary 例: 「会場の広告段を①と同じ飾りなしに」。
- **ユーザーへの質問(同時に出す)**: 「広告段をギフトと同じ金色カードにしますか(popup・別窓・会場の3面を同時に金色化)/ ①と同じ飾りなしのままにしますか」。金色に決まったら: `.nl-story-userlane-tier-wrap--ad {…}` を popup.html(:1004 直後)/ app/live-view.html(:885 直後)/ venueBar.js の LANE_CSS_SYNC 区間(:1243 直後・`.nlsb-venue-lane-stack` 接頭辞付き)に**同時追加** + :2324 の打消しセレクタに `--ad` 併記(区間外)。

## v2(一覧パネル)
- CSS `.nlsb-roster-panel`: `max-height: 72vh;` を削除し `bottom: calc(var(--nlsb-venue-max-h, 48vh) + 88px);` を追加(88 = 実測の箱下端オフセット 79px + 余白 9px。コメントに実測を書く)。必要なら `.nlsb-roster-list` に `min-height:0`。
- JS :5320-5326: `--nlsb-venue-max-h` の注入先を seating から `stage` へ**置換**(両方に書かない)。`stage` がスコープにあるか確認(無ければ `seatsHost.closest('.nlsb-stage')`)。seating の `max-height: var(--nlsb-venue-max-h,48vh)`(:873)は継承で効き続ける。
- JS :3841 `onRosterOutsideClick`・:4107 `onDiagOutsideClick`: 自分の開閉ボタン(`rosterBtn`/`diagBtn`)を除外(`target` が各ボタン内なら return)。add/remove の行は触らない(キャプチャ true のまま)。
- テスト `src/lib/venuePanelBottom.wiring.test.js`: `.nlsb-roster-panel {` 本体に `bottom: calc(var(--nlsb-venue-max-h` があり `max-height: 72vh` が無い / 注入先が `stage` / 2つの outside-click に各ボタンの `contains`。
- 計測: 一覧パネルを開いた状態で `.nlsb-header` の `covered` が **幅 420/640/1280(高さ900)すべて 0**(ヘッダー6ボタンが押せる)。`getComputedStyle(seating).maxHeight` が @900 で `432px`(注入先変更の退行がない)。
- 動作: 「👥一覧」を押して開く→もう一度押して閉じる(二重トグルしない)・✕・Esc・外側クリックのどれでも閉じる。

## v3(しまう/戻す)
- 設計書 §5 の C3 のとおり。要点: `let tucked`・`setTucked(next)`・ヘッダーに「✍ しまう」ボタン(`rosterBtn` の前)・`toggle` click の先頭で `tucked` なら `setTucked(false)`・`setOpen` で閉じるとき `setTucked(false)`。**`hidden` 属性は使わない**(`visibility:hidden` で隠す)。**Esc には何も足さない**。
- CSS は LANE_CSS_SYNC 区間の**外**に3規則。
- テスト `src/lib/venueTuck.wiring.test.js`: 3規則・`setOpen` 内の `setTucked(false)`・`onEscapeKey` に `tucked` が出てこない。
- 計測(9格子): 高さ 720/900/1000 × 幅 420/900/1280。tuck 中は `itemF().commentInput.passThrough === true` が9格子すべて。戻した後に席数(`.nlsb-root .nl-story-userlane-cell` 数)と開閉状態が tuck 前と一致。`_lastVenueSeatsDiagObs.lastUpdateAt` が変わらない(再集計なし)。
- **計測道具の拡張が先**: `runtime-venue-audit.mjs` の `setWidth` は height:900 固定。`--heights 720,900,1000` を足し、`setSize(w,h)`(`Emulation.setDeviceMetricsOverride`)にする。`vp()` で `innerHeight` が格子どおりかを毎回記録。入力欄が `found:false` のときは合格にせず「測れず」で赤。

## 機械的な完了判定
- `npm run verify:cc` OK(`deadSelectorRatchet.test.js` も緑のまま=新しいデッドを作らない)。
- 各版の前後計測 JSON/PNG があり、合格条件を満たす。
- 各テストを壊す変異で赤を確認済み。
- PR 本文に「実機未確認: 更新+F5 後の操作」を明記。**実機で効いたかはユーザーの観察後に判断**。

## 地雷(詳細は設計書 §9)
CRLF(Edit は短い一致で) / Bash heredoc はバックスラッシュを壊す(編集スクリプトは Write で .cjs) / VENUE_CSS は文字列(`${`・バッククォート禁止) / LANE_CSS_SYNC 区間内の直接編集は parity 赤 / `hidden` 属性は安全網で `display:none !important` / outside-click は document キャプチャ固定 / `git add` に `.html`・`scripts/`・新規テストを含める / 配信視聴中の `copy:ext` 禁止。

## 要確認(着手時に実コードで確かめる)
`.nlsb-roster-list` の flex `min-height:0` / :5320 のスコープから `stage` が見えるか / `.nlsb-toggle` の既定 display と初期文言の生成箇所(:2553 `🏟 会場モード`) / 420x720・900x720 の入力欄被覆(予測のみ・v3 の計測で確定) / venueBar.js の max-lines ラチェット値(赤なら `setTucked` を `src/lib/venueTuck.js` の純関数に切り出す)。
