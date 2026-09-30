# 実装ハンドオフ: /live/ 脈拍レーン「熱いチップ」（本文非表示でコメントの中身を伝える）

> この1枚だけで着手できる。設計の正本は [`live-comment-heat-chips-DESIGN.md`](live-comment-heat-chips-DESIGN.md)
> （council-fable手順2、Fable設計・司令塔裏取り済み）。実装はこのハンドオフに従い、疑問があれば
> DESIGNのA〜Gへ戻って確認する（推測で進めない）。
>
> **★最重要の制約（何度でも読み返すこと）**: コメント本文は一切表示・保存しない。この機能が
> 見せるのは「誰が」「どれだけ増えたか（件数）」「種別」だけ。DESIGN §0の2問テスト
> （Q1入力=本文を使うか／Q2出力=本文が復元できるか）に照らして、実装中に少しでも
> 本文寄りの機能を思いついたら実装せずDESIGNのF「捨てた案」を確認すること。

## スコープ（MVPのみ・これ以外は作らない）

配信カードのコメント欄で、実測2点の間に実際にコメント件数が増えた人を「熱いチップ」として
脈拍レーンで強調する（丸く光る輪＋`+N`件バッジ）。増分に応じて複数回（最大3回）流す。
「コメントで応援した人」欄の行にも同じ`+N件`バッジを添える（reduced-motion時のパリティ）。
tier別のscale拡大・CSS変数化などの見た目の凝りは後回し（DESIGN §E参照）。

## 読む順

1. [`live-comment-heat-chips-DESIGN.md`](live-comment-heat-chips-DESIGN.md) 全体（特に§0の2問テストと§G地雷）。
2. [`src/lib/liveGiftPulse.js`](../src/lib/liveGiftPulse.js) — 既存の差分器（`createGiftPulseRegistry`・
   `diffGiftRows`・`tierForGiftDeltaPoints`・`pulseRowKey`）。今回はここに`tierFor`引数を1つ足すだけ。
3. [`src/lib/liveMotion.js`](../src/lib/liveMotion.js) — `supporterChipsFromLive`・`createSupporterFeed`
   （v0.1.1553で実装済み。今回は第2引数`heat`を追加する形で拡張）。
4. [`src/extension/live-ranking-entry.js`](../src/extension/live-ranking-entry.js) — `render()`
   （259-327行）・`renderRows`（137-164行、既に`pulse`引数を持つ）・`renderCommentCol`（203-212行、
   **まだ`pulse`を受け取っていない**）・`spawnDot`（695行付近）。

## 2026-09-30時点の実配線ポイント（司令塔が実際にReadして確認済み）

- `renderRows(rows, liveId, kind, pulse = null)`（137行）は既に`pulse`引数で`.delta`バッジを
  描ける構造を持つ（143-144行で`pulse.byKey.get(pulseRowKey(r))`、154行で`formatPtDelta`）。
  **ただし`formatPtDelta`（liveGiftPulse.js:103）は`+${n}pt`固定**。コメント用に単位を変える
  仕組みが要る（下記ステップ2参照）。
- `renderCommentCol(l)`（203行）は現在`pulse`を受け取らず、211行で
  `renderRows(commentRows(l), l.liveId, 'comment')`と`pulse`無しで呼んでいる。
  ここに`pulse`を追加で渡すだけで第3引数の配線が繋がる。
- `render()`内（281-326行）: `tracker.begin()`/`giftPulse.begin()`/`laneTracker.begin()`/
  `motion.begin()`が279-284行、対応する`.end()`が321-324行。新しい`commentPulse.begin()`/`.end()`
  もこの並びに追加する。
- カードのmapコールバック（286-320行）: `rows`・`gp`（298行`giftPulse.pulseFor`）・`track`
  （290-293行）の並びに、`commentPulse.pulseFor(l.liveId, commentRows(l), data.capturedAt)`を
  追加する。
- `spawnDot`関数はチップ生成時に`chip`オブジェクトを受け取る（v0.1.1553で実装済み）。
  `chip.heat`・`chip.tier`を追加参照するだけで済む。
- `_lastData`等の既存変数名・`commentRows`のimport元（`../lib/liveRankingView.js`）は変更しない。

## 着手手順（ブランチ＋TDD）

```bash
git checkout master && git pull
git checkout -b feat/live-comment-heat-chips
```

1. **`src/lib/liveGiftPulse.js`を拡張**（DESIGN §C-1）:
   - `createGiftPulseRegistry(tierFor = tierForGiftDeltaPoints)`に引数を追加。
   - `diffGiftRows(prevPoints, rows, spanMs, tierFor = tierForGiftDeltaPoints)`に引数を追加、
     内部の`tierForGiftDeltaPoints(d)`呼び出しを`tierFor(d)`に差し替え。
   - **既存呼び出し（引数なし）が今までどおりのtier分類で動くことをテストで確認**
     （`liveGiftPulse.test.js`の既存テストが無改変で通ること）。
   - `formatPtDelta`はそのまま残し、コメント用に`formatCountDelta(d)`（`+${n}件`）を新規追加。

2. **`src/lib/liveMotion.js`に契約8〜10相当のテストを先に書く**（DESIGN §C-5・§C-2）:
   - `tierForCommentDelta(d)`: `d>=10→'mega'`, `d>=5→'large'`, `d>=2→'medium'`, それ以外`'small'`。
   - `supporterChipsFromLive(live, heat)`: 第2引数`heat`（`PulseResult|null`）を追加。comment行は
     `heat.byKey.get(pulseRowKey(r))`から`heat`（delta）・`tier`をチップに付与、無ければ`heat:0, tier:null`。
     gift/ad行は常に`heat:0, tier:null`（ギフト増分は`.delta`バッジで既出、レーンで二重に光らせない）。
   - `createSupporterFeed().fill(next, epoch)`: 第2引数`epoch`を追加。同じepochなら`chips`だけ
     差し替えて`cursor`を維持。epochが変われば「熱い順（降順）→`HOT_REPEAT_MAX=3`回ずつ複製→
     冷たい人」の順に並べ替えて`cursor=0`にリセット。
   - **契約**: heatが全て0（旧来どおりheat未指定 or 全員0）なら、並び順は`fill`前の`chips`配列の
     順番と完全一致する（退化確認）。

3. **`src/extension/live-ranking-entry.js`に配線**（DESIGN §C-3）:
   - import: `tierForCommentDelta`を`liveMotion.js`から、`formatCountDelta`を`liveGiftPulse.js`から追加。
   - トップレベル: `const commentPulse = createGiftPulseRegistry(tierForCommentDelta);`
   - `render()`内: `commentPulse.begin()`（他のbegin()と同じ並び）。
     カードごとに`const cp = l.comment?.partial ? null : commentPulse.pulseFor(l.liveId, commentRows(l), data.capturedAt);`
     （★地雷2: partial収集の揺れを防ぐガード、DESIGN §G-2）。
     `supporterFeeds.feedFor(l.liveId).fill(supporterChipsFromLive(l, cp), toEpochMs(data.capturedAt));`
     （`toEpochMs`は`timeAuthority.js`からimport済みか確認、無ければ追加import）。
     `renderCommentCol(l, cp)`に変更。
     `commentPulse.end()`（他のend()と同じ並び）。
   - `renderCommentCol(l, pulse = null)`にシグネチャ変更、211行を
     `renderRows(commentRows(l), l.liveId, 'comment', pulse)`に変更。
   - `renderRows`内、154行の`formatPtDelta`呼び出しを`kind`で分岐:
     `kind === 'comment' ? formatCountDelta(rp.delta) : formatPtDelta(rp.delta)`。
   - `spawnDot`（695行付近）: `chip.heat > 0`なら`d.classList.add('is-hot', \`tier-${chip.tier}\`)`、
     `<span class="pulse-dot-delta">+${chip.heat}</span>`を追加、`d.title`に`+${chip.heat}`を追記。

4. **CSS追加**（DESIGN §C-4、`tsuioku-no-kirameki/live/index.html`の`<style>`へ）。
   **★地雷4に注意**: 既存`.pulse-dot`の`animation: nl-pulse-flow`が`transform: translateX`を
   使っているため、`scale`を単純併記すると上書きされる。`--dot-scale`CSS変数を使い、
   `nl-pulse-flow`のtoを`translateX(calc(-100vw - 160px)) scale(var(--dot-scale, 1))`に変更した上で、
   `.pulse-dot.is-hot.tier-*`が`--dot-scale`を設定する形にする。MVPでは`tier-medium/large/mega`の
   scale分けは省略し、`.is-hot`の枠線・box-shadowだけでもよい（DESIGN §Eの「見た目の凝りは後回し」）。

5. **ブラウザ実機確認**（Claude-in-Chrome MCP、`live-preview-mock`サーバ流用可。
   `commentCount`が時間で増加するモックが必要、前回セッションのscratchpad
   `live-preview-mock-server.mjs`の`buildPayload()`パターンを参考に）:
   - 手動更新を2回行い実測2点を作った後、コメント件数が増えた人のチップが強調表示されることを確認。
   - 同じcapturedAtでの再描画（連打）で、熱いチップの並び順が変わらないことを確認。
   - `commentRows`が空/初回（`prev`が無い）の配信では、従来どおりの巡回（熱いチップ無し）であることを確認。

## 機械的な完了判定

- [ ] `npx vitest run src/lib/liveMotion.test.js` — 既存15件+新規契約が全てpass
- [ ] `npx vitest run src/lib/liveGiftPulse.test.js` — 既存テストが`tierFor`引数追加後も無改変で通る
- [ ] `npm run test:cc` — 全体回帰、無破壊
- [ ] `npm run impact-check` — `liveGiftPulse.js`変更の波及先確認
- [ ] `npm run build` — esbuildが正常再生成
- [ ] `npm run tree-map`（`git add -A`の**後**）→ `FEATURES`辞書の「/live/ コメント速度演出・応援者
      チップ」エントリに今回の拡張（熱いチップ）を追記してから再生成
- [ ] `npm run feature-map`
- [ ] `npm run site-health`
- [ ] `npm run verify:cc` — 緑
- [ ] version bump 3点セット（summary例:「脈拍レーン: いま話している人を強調」35字以内）
- [ ] Claude-in-Chromeでの実機確認（上記5番）のログ取得
- [ ] `improvementHistory.js`にバンドルサイズ増分のnoteを追記（既存パターン踏襲、前回セッション参照）
- [ ] commit → push → PR作成 → CI緑を確認

## 地雷（DESIGN §Gの再掲・実装時に必ず踏むポイント）

最重要の3つだけここに再掲（全8件はDESIGN §G参照）:
1. **同じcapturedAtの再描画で熱いチップの並びが先頭に戻る** → `fill(next, epoch)`のepochガードを
   必ず入れる。epoch比較を忘れると「更新ボタン連打で毎回同じ人が先頭に固定される」という
   誤った見た目になる（テスト契約(b)で機械的に固定してから実装する）。
2. **`comment.partial: true`の収集では増分を信じない** → `l.comment?.partial`をチェックして
   `cp`をnullに落とす。これを忘れると、部分集計→全件集計の切り替わりタイミングで
   「誰も書いていないのに大量増分」という嘘の熱いチップが出る。
3. **CSS transformの競合** → `--dot-scale`変数を必ず経由する。`scale()`を`.pulse-dot`に直接
   併記すると、既存のflowアニメーションのtransformで上書きされ、拡大表示が反映されない
   （実機で必ず目視確認すること）。

## 転記元の実在パス一覧（司令塔が実在確認済み・2026-09-30）

- `src/extension/live-ranking-entry.js:137`(`renderRows`関数、`pulse`引数あり)・`:203`(`renderCommentCol`、
  `pulse`引数なし=今回追加)・`:211`(`renderRows`呼び出し、`pulse`無し=今回追加)・`:259-327`(`render`関数)・
  `:281-284,321-324`(各begin/end)・`:695`付近(`spawnDot`)
- `src/lib/liveGiftPulse.js:66`(`createGiftPulseRegistry`)・`:45`(`diffGiftRows`)・`:103`(`formatPtDelta`、
  `+${n}pt`固定)・実在確認済み: `src/lib/liveGiftPulse.test.js`
- `src/lib/liveMotion.js`(v0.1.1553時点、`supporterChipsFromLive`・`createSupporterFeed`が実装済み)

## 検証で不確実だった点（未確認のまま・実装時に踏まえる）

- DESIGN §C-3が挙げた「`formatCountDelta`をliveGiftPulse.jsに足すか、renderRowsに単位を渡すか」は
  司令塔が「liveGiftPulse.jsに`formatCountDelta`を追加する」方針で確定させた（上記ステップ1参照。
  単位をrenderRows内でkind分岐する方が、呼び出し側の変更を`renderCommentCol`の1箇所に閉じられるため）。

## 次のアクション

このハンドオフを読んだ実装担当（次チャット、またはCodex/cursor-agent等の外部CLI）が、上記
「着手手順」の1から順に進める。設計そのものへの疑問はDESIGN文書のA〜Gに立ち返って確認し、
このハンドオフを再解釈しない。**特に「本文を出したくなる」誘惑が実装中に湧いたら、DESIGN §0の
2問テストとFの捨てた案に必ず立ち返ること**（この機能はcouncil-fable会議で明確に却下された案の
代替として設計されたものである）。
