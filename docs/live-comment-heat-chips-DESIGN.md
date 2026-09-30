# 設計書: /live/ 脈拍レーン「誰が・どれだけ今しゃべっているか」で中身を伝える（本文非表示）

> 設計=Fable(claude-fable-5-1) / 素材集め・裏取り=司令塔 / 2026-09-30
> council-fable手順2の産物。手順1(会議)の結論を前提に、Fableが安全な代替演出を設計した。

## 背景・経緯

ユーザーから「脈拍レーンに流れる点を、どんなコメント・ギフト・広告か中身が見える演出にしたい」
「コメント本文そのものを表示したい」との要望が出た。司令塔がcouncil-fableで法的リスクを検討した結果、
以下の会議結論に至った。

### 会議の結論（5体中5体一致・統合役も同判定・却下ゼロ）

**「脈拍レーンのような全訪問者への自動・継続的なコメント本文配信は、著作権法上の公衆送信権
（著作権法23条、送信の一時性・不保存は阻却事由にならない）およびニコニコ生放送利用規約
（第三者へのコメント再配信禁止）のリスクを実質的に解消できない。実装すべきではない。**

既存「ホバーで直近発言」（個別リクエスト・1人分限定・閲覧者の能動的操作が起点）と、
「脈拍レーン」（自動・全員向け）の法的性質の違いも整理された:

| 観点 | ホバー機能（既存） | 脈拍レーン本文表示（却下対象） |
|---|---|---|
| 送信の契機 | 閲覧者の能動的操作（ホバー）に応じた個別リクエスト | 操作不要・自動開始・継続 |
| 送信対象 | 1人の閲覧者に1人分の直近発言のみ | 全閲覧者に全応援者の発言を連続配信 |
| 法的性質 | 「検索・閲覧補助」に近い、リスク相対的に低い（ただしゼロではない） | 「自動公衆送信」（放送に近い性質） |

却下された論点（蒸し返さない）:
- 「コメントは短文だから著作物性が無い」→却下。短文でも思想・感情の表現があれば著作物になりうる。
- 「文字数制限・遅延・スニペット化で合法化できる」→却下。ニコニコ規約は再配信全般を禁止しており、
  文字数や遅延による例外規定は存在しない。

この結論を前提に、Fableへ「本文を一切表示しない」制約の中で「コメントの中身が伝わっている感じ」
「配信の熱量・空気感」を演出する代替案の設計を依頼した。

---

## 0. 線引き（本文非表示の判定基準・Fableが設計）

「本文を一切表示しない」を曖昧にしないため、候補となる演出はすべて次の**2問テスト**で判定する。

| 問い | 内容 |
|---|---|
| **Q1 入力** | その計算は**コメント本文を入力に取るか**（件数・時刻・投稿者ID・種別だけで算出できるなら No） |
| **Q2 出力** | 表示から**本文の語句が1語でも復元・推定できるか**（人が見て「あの人は○○と書いたな」と分かるなら Yes） |

- **Q1=No かつ Q2=No → 安全**（件数・速度・増分・投稿者・種別・人数・時刻・比率）。今回のMVPはここだけで作る。
- **Q1=Yes かつ Q2=No → 灰色・今回はやらない**（感情分析ラベル・「盛り上がり度」の本文由来スコア）。
  法的には二次的加工だが、当サイトが「本文を保存・表示しない」と公表している以上、収集側で本文を読む
  処理を新設すること自体が公表方針との齟齬になる（AGENTS §3.3）。感情ラベルは外れると嘘の診断になる（§12.7）。
- **Q2=Yes → 却下**。キーワード抽出（原文の一部切り出し=部分的再配信）、「よくあるフレーズ」の
  事前登録パターン再生（実際には書いていない可能性がある=嘘の表示。二重に不可）。

**追加ルール**: 表示するのは「数値」「人（既に公開順位表に載っている名前・サムネ・種別）」「装飾（大きさ・
色・光）」に限る。文字列を新たに生成して流さない（数値の書式 `+12` は本文由来ではないので可）。

## A. 理想の体験フロー

1. 訪問者が /live/ を開く。配信カードの脈拍レーンに、今までどおり応援者チップが速度どおりに流れている
   （v0.1.1553 の挙動は不変）。
2. 収集が届く（5〜13分間隔）。直近の実測2点の間に実際にコメントを増やした人だけが、レーンで
   「**熱いチップ**」として流れる: ひと回り大きく、オレンジの輪が強く、右肩に `+12`（この間隔で
   増えた件数）。「1人で12件も」「いま3人で回している」が、本文なしで一目で伝わる。
3. 熱い人は増分に比例して**繰り返し**流れる（最大3回）。冷えている人（増分なし）はその後ろで
   従来どおり順番に流れる。＝レーンの前半は「いまの会話の主役」、後半は「この配信の常連」という
   時間構造になる。
4. 同じ収集が再描画された（スロットル応答・inFlight）ときは巡回位置を戻さない（同じ人が何度も
   先頭に戻って点滅しない）。
5. `prefers-reduced-motion` ではレーン自体が非表示（既存）なので、同じ `+N` を「コメントで応援した人」
   欄の行にも添える（ギフト欄の `.delta` と同じ意匠。動きが無くても情報は届く）。
6. ホバーの直近発言（既存・能動操作）は一切変えない。熱いチップにホバーしても本文は出ない
   （チップの title は `💬 名前 +12` まで）。

体験の芯: 「何を言ったか」の代わりに「誰が・どれだけ・いま」を密度高く見せる。コメント欄を眺めている
ときに人が実際に感じ取る「空気」の大半はこの3点で、本文はその確認に使われているに過ぎない、という賭け。

## B. 統合アーキ（コンポーネント4個・配線）

```
api/live-ranking.js(変更なし)  ──JSON──▶  live-ranking-entry.js render()
                                             │  commentRows(l)           ← liveRankingView.js(変更なし)
                                             ▼
   [1] commentPulse = createGiftPulseRegistry(tierForCommentDelta)     ← liveGiftPulse.js(引数1つ追加)
        pulseFor(liveId, commentRows(l), data.capturedAt) → PulseResult{ byKey: uid→{delta,tier} }
                                             │
                                             ▼
   [2] supporterChipsFromLive(l, heat)  →  SupporterChip{…, heat, tier}   ← liveMotion.js
   [3] createSupporterFeed().fill(chips, epoch) 熱い順の巡回キュー          ← liveMotion.js
                                             │  motionFrame() が pulseIntervalMs(rate) ごとに next()
                                             ▼
   [4] spawnDot(lane, chip)  → .pulse-dot.is-hot.tier-*  + <span class="pulse-dot-delta">+12</span>
        renderCommentCol()   → 行にも同じ +N(reduced-motion 用のパリティ)
```

- 新規データ取得ゼロ・サーバ変更ゼロ。材料は既に届いている `comment.rankers[].count` と
  `capturedAt` だけ。
- [1] は `createGiftPulseRegistry` の再利用（新しい差分器を書かない）。差分の性質はギフトと同じ
  「実測2点の正の増分・減少は信じない・15分超は出さない・同 capturedAt は前回結果」。
- [3] は既存 `createSupporterFeed` の拡張。集計値には一切影響しない演出専用キューという契約は維持。

## C. 具体機構

### C-1 `src/lib/liveGiftPulse.js` — tier 関数を差し替え可能に（既存呼び出しは無変更）
```js
export function createGiftPulseRegistry(tierFor = tierForGiftDeltaPoints) { … diffGiftRows(cur.points, rows, span, tierFor) … }
export function diffGiftRows(prevPoints, rows, spanMs, tierFor = tierForGiftDeltaPoints) { … tierFor(d) … }
```
`pulseRowKey` は `uid` が truthy なら追跡する。コメント行の匿名 uid は `a:…` で同一番組内では
一定なので、コメントでは匿名も追跡してよい。docstringの「数値 uid だけ」は「ギフト/広告では匿名行の
uid が空なので結果的に数値だけ」と読み替えて追記する。

### C-2 `src/lib/liveMotion.js` — コメント増分の段階と、熱いチップ
```js
/** コメント増分(件)の段階。ギフトの pt 段階とは別物(1件と1ptは重みが違う)。 */
export function tierForCommentDelta(d) { return d >= 10 ? 'mega' : d >= 5 ? 'large' : d >= 2 ? 'medium' : 'small'; }
/** 熱い人がキューに並ぶ最大回数(1人が独占しない天井)。 */
export const HOT_REPEAT_MAX = 3;

/** @typedef {{ key, kind, name, avatar, url, heat: number, tier: string|null }} SupporterChip */
export function supporterChipsFromLive(live, heat = null /* PulseResult|null */) {
  // comment 行: const rp = heat && heat.byKey.get(pulseRowKey(r));  heat: rp ? rp.delta : 0, tier: rp ? rp.tier : null
  // gift/ad 行: heat 0(ギフト増分は既に .delta バッジで表現済み。レーンでは二重に光らせない)
}
```
`createSupporterFeed`:
```js
fill(next, epoch) {
  if (epoch === lastEpoch) { chips = next; return; }   // 同じ収集の再描画: 巡回位置を維持(A-4)
  lastEpoch = epoch;
  const hot  = next.filter(c => c.heat > 0).sort((a,b) => b.heat - a.heat);
  const cold = next.filter(c => !(c.heat > 0));
  const q = [];
  for (const c of hot) for (let i = 0; i < Math.min(c.heat, HOT_REPEAT_MAX); i += 1) q.push(c);
  chips = q.concat(cold); cursor = 0;
}
```
- `epoch` は `toEpochMs(data.capturedAt)`。増分が空（初回・15分超・partial）のときは hot が空になり、
  従来と完全に同じ巡回に退化する（fail-soft）。
- 熱い人を並べ替えるだけで、`ratePerMin`・`pulseIntervalMs`・件数表示には一切触れない（§12.8を汚さない）。

### C-3 `src/extension/live-ranking-entry.js`
- 宣言（44行付近）: `const commentPulse = createGiftPulseRegistry(tierForCommentDelta);`
- render 内（285-331）: `commentPulse.begin()` / 各配信で
  `const cp = commentPulse.pulseFor(l.liveId, commentRows(l), data.capturedAt);` →
  `supporterFeeds.feedFor(l.liveId).fill(supporterChipsFromLive(l, cp), toEpochMs(data.capturedAt));` →
  `renderCommentCol(l, cp)` → `commentPulse.end()`。begin/end は render の対として各1回。
- `spawnDot`（695-720）:
  ```js
  if (chip.heat > 0) {
    d.classList.add('is-hot', `tier-${chip.tier}`);
    const b = document.createElement('span'); b.className='pulse-dot-delta'; b.textContent = `+${chip.heat}`;
    d.appendChild(b); d.title += ` +${chip.heat}`;
  }
  ```
- `renderCommentCol`: `renderRows(rows, liveId, 'comment', cp)` が既に `pulse` 引数で `.delta` を
  描ける構造（137-154行）ならそのまま渡すだけ。`formatPtDelta` は `pt` 固定なので、コメント用に
  `formatCountDelta(d)`→`+12件` を liveGiftPulse.js に1関数足すか、`renderRows` に単位を渡す
  （実装時にどちらが最小差分か確認）。

### C-4 `tsuioku-no-kirameki/live/index.html`（CSS・333-346行の直後）
```css
.pulse-dot.is-hot { border-color: var(--orange); box-shadow: 0 0 0 2px rgba(200,114,28,.18), 0 1px 3px rgba(0,0,0,.1); transform-origin: right center; }
.pulse-dot.is-hot.tier-medium { transform: scale(1.06); }   /* ★height を変えず scale で(レーン30pxを崩さない) */
.pulse-dot.is-hot.tier-large  { transform: scale(1.12); }
.pulse-dot.is-hot.tier-mega   { transform: scale(1.18); animation-duration: 7s; } /* 目玉は少しゆっくり */
.pulse-dot-delta { font-weight: 800; color: var(--orange); font-variant-numeric: tabular-nums; margin-left: 2px; }
```
★注意: `.pulse-dot` は `animation: nl-pulse-flow` で `transform: translateX` を使っている（342行）。
`scale` を別に掛けると keyframe の transform に上書きされる。**`scale` は内側の子（avatar+name を
包む span）に掛けるか、`nl-pulse-flow` の `to` を `translateX(...) scale(var(--dot-scale,1))` に
変えて `--dot-scale` を tier で設定する**。後者が最小差分。

### C-5 テスト
- `src/lib/liveMotion.test.js`（既存）に追加: (a) heat 付きチップは増分降順で先頭・`HOT_REPEAT_MAX`
  回で天井 (b) 同 epoch の `fill` は cursor を維持 (c) heat が全て 0 なら従来の巡回と同一列
  (d) `tierForCommentDelta` 境界値。
- `src/lib/liveGiftPulse.test.js`（存在確認要）: `tierFor` 差し替えで tier が変わる・既定引数で
  従来結果が不変。
- 配線テスト（`liveLaneBuckets.wiring.test.js` と同型で新規 `liveCommentPulse.wiring.test.js`）:
  `commentPulse.begin()/end()` が各1回・`pulseFor` の戻り値が `supporterChipsFromLive(` と
  `renderCommentCol(` の引数に渡っていることまで正規表現で固定（配線テストは結果が使われているかまで）。
- bump 3点セット（manifest/package/changelog、summary 35字以内。例「脈拍レーン: いま話している人を強調」）。

## E. MVP（1つだけ作るなら）

**C-1〜C-3 の「熱いチップ」だけ**（CSS は `.is-hot` の輪＋ `+N` バッジのみ、scale/tier 分けは後段）。

- 作業量: lib 2ファイルの小変更 + entry 10行 + CSS 3行 + テスト。サーバ・収集・インフラ・
  問い合わせ頻度: すべて変更ゼロ。
- 成功の見え方（reality-checkerへの確認項目）: 収集が2回届いた後、レーンの先頭に流れるチップが
  「コメント欄で count が増えた人」と一致し、`+N` が `count(今回) − count(前回)` と一致する。
  同じ capturedAt の再描画で先頭に戻らない。増分が無い配信は v0.1.1553 と同じ巡回。
- 撤回: `supporterChipsFromLive(l)`（第2引数なし）に戻すだけで旧挙動（heat が全て 0 → cold のみの巡回）。

## F. 捨てた案と理由

| 案 | 判定 | 理由 |
|---|---|---|
| キーワード抽出・頻出語クラウド | **却下（Q2=Yes）** | 原文の一部切り出し＝部分的再配信。会議の却下論点そのもの |
| 「www」「888」等の定型フレーズを事前登録して再生 | **却下（Q2=Yes・嘘）** | 本文に見える文字列を当サイトが生成して流す＝擬似再配信。しかも実際に書かれたかは不明（嘘の表示） |
| 感情分析ラベル（😂/😢/🔥） | **灰色・見送り（Q1=Yes）** | 収集側で本文を読む処理の新設が「本文を保存・表示しない」公表と齟齬。外れたら嘘の診断。再開は文言改訂＋再審後 |
| 文字数分布ヒートマップ | 見送り（安全だが新規データ） | 1コメントごとの文字数を収集側に足す必要がある（新フィールド＝収集・API・サニタイズの3点変更）。Q1=Yes/Q2=No寄り |
| 投稿頻度の線グラフ | 見送り（重複） | 速度 `+N/分` と脈拍レーンの点間隔が既に同じ情報を担っている。3つ目の表現は冗長 |
| 「新しく N 人が話し始めた」チップ（`commenters` の増分） | 見送り（Phase 2 候補） | 材料は既にある（`comment.commenters`）が、MVP を1つに絞る |
| 効果音 | 却下 | 拡張未インストールの一般訪問者向けページで自動音声は摩擦 |
| ギフト行もレーンで光らせる | 却下 | `.delta` バッジと `is-gifted tier-*` で既に表現済み。二重演出は価値の序列を崩す |

## G. 地雷と回避策

1. **同 capturedAt の再描画で先頭に戻る** → `fill(next, epoch)` の epoch ガード（C-2）。
2. **`comment.partial: true` の揺れ** — partial→full の収集間で見かけの大増分が出る。回避:
   entry 側で `l.comment.partial ? null : cp` と落とすのが最小。増分が信じられないときは光らせない。
3. **`COMMENT_RANKERS_MAX` の足切り** — 前回の順位表に居なかった人は増分が出ない（既存の規則）。
   初登場の人は次の収集から光る。仕様として受け入れ、docstringに明記。
4. **CSS transform の上書き**（C-4注意）— keyframeの`translateX`と`scale`が競合。`--dot-scale`
   変数で1つのtransformに統合する。
5. **`PULSE_DOTS_MAX_PER_LANE=12` と大きいチップ** — scaleで幅が増えるので重なりやすい。
   `max-width:160px`内でscale≤1.18に留め、重なる場合は名前の`max-width`をtierで詰める。
6. **配線が結果を捨てる** — `pulseFor`を呼んで戻り値を使わない事故。配線テストで引数への到達を固定。
7. **速度`+N/分`と`+N`バッジの混同** — 前者は分速、後者は収集間隔の増分。バッジのtitleに
   `spanText(cp.spanMs)`（「直近12分」）を必ず添える（ギフト`.delta`と同じ文言）。
8. **本文非表示の再逸脱** — 将来「熱い人の直近発言をチップに出そう」となりやすい。
   `supporterChipsFromLive`のdocstringに0節の2問テストを転記し、`SupporterChip`型に文字列
   フィールドを`name`以外増やさないことを`liveMotion.test.js`で型キー固定する。

---
関連ファイル（絶対パス・司令塔が実在確認済み）:
- `src/lib/liveMotion.js`（v0.1.1553時点、supporterChipsFromLive/createSupporterFeed等が実装済み）
- `src/lib/liveGiftPulse.js`（createGiftPulseRegistry/diffGiftRows/tierForGiftDeltaPoints）
- `src/lib/liveRankingView.js`（commentRows・変更なし）
- `src/extension/live-ranking-entry.js`（render・spawnDot・motionFrame）
- `tsuioku-no-kirameki/live/index.html`（脈拍レーンCSS）
- `src/lib/liveMotion.test.js`

未確認（実装時に確認）: `src/lib/liveGiftPulse.test.js` の存在、`renderCommentCol` が
`renderRows` を経由しているか（C-3の最小差分判断に必要）。
