# /live/ に「誰がギフトを上げたか」を目立たせる設計(council-fable手順2・2回目の産物)

> 設計=Fable(claude-fable-5-1) / 素材集め=無料会議2回(5体×2) / 裏取り=司令塔(Sonnet 5) / 2026-09-27
>
> council-fableワークフロー3段構えの手順2の成果物(2回目)。1回目の成果物は
> [`live-comment-motion-DESIGN.md`](live-comment-motion-DESIGN.md)(コメント合計件数の脈拍演出)。
> こちらは「誰が」「何を」を目立たせる別の設計で、両者は互いに依存しない(同時実装はしない。
> §G-17参照)。

## 背景・経緯

1. 1回目のFable設計はコメント合計件数の脈拍演出を作り、「個人単位の秒刻み演出は一切
   しない」(D-3②)と定めた。
2. ユーザーから「誰がどんなギフトを上げたかみたいな表示とかコメントの流れとか出したい」
   という追加要望があり、司令塔が難色を示しかけたところ、ユーザーから決定的な指摘:
   「オープンソースインテリジェンスで普通に放送みてたらわかるものですよ」。
3. これはこのプロジェクトの一貫した既存方針(AGENTS.md §3.5)と整合する指摘:
   > 「ニコ生上で公開されている応援情報(コメント/ギフト)は OSINT として堂々と載せる。
   >   応援者は主役(隠す対象ではない・表彰として扱う)。」
4. 司令塔はさらに、拡張の「アイコン列」(りんく/こん太/たぬ姉の3レーン振り分け)という
   既存の完成度の高い表示ロジックをスクリーンショットで確認したが、ユーザーから
   「結局これを使うと動きが遅かったりうまくいってなかった」という実体験の指摘があった。
   MEMORY裏取りの結果、これは拡張本体でもv1037〜v1042の6版がかりで根治した「ちらつき」
   バグの歴史だったと確定(`story-userlane-churn-filllanetier-v1039.md`)。
5. 2回目の会議(5体)を実施し、「サーバー中継(X)」「訪問者本人が直接見る(Y)」「既存
   表示の演出強化(Z)」の3パターンを区別してFableに裁定を依頼した。

## 確定した制約(1回目から継続・変更しない)

- サーバー側でNDGRを「常駐」させることはしない(BAN回避・Vercel実行時間の制約)。
- 新しいインフラ(Cloudflare Workers等)は原則導入しない。
- ニコニコへの問い合わせ頻度は過度に増やさない。
- 既存の60秒自動更新・10分ごとのコメント集計cronは維持する。
- 拡張の「アイコン列」表示ロジックはそのまま`/live/`へ移植しない(6版がかりのちらつき
  教訓を、より条件の悪い環境で再現するリスクが高いため)。

## A. 理想の体験フロー

訪問者が`/live/`を開くと、いつもの配信カードが並ぶ。60秒ごとの再取得で誰かのギフト
ポイントが増えていたら、その配信の「🎁 ギフトで支えた人」の行に**「+1,200pt」の差分
バッジ**が付き、行がうっすら橙に染まる。増え方が大きいほど色が濃く(500pt以上)、
5,000pt以上なら赤みがかる。バッジは**次の新しい取得が届くまで消えない**(既存の
0.9秒で消える光り方では見逃していた)。次の取得で増分が無ければ静かに消える。誰が
上げたかは名前・サムネ・IDのセットで堂々と出る(AGENTS §3.5)。「どんなギフトか
(品名)」は今の取得データに無いので**出さない**(嘘の品名を作らない・将来はkoken
`/histories`で足せる。D-4参照)。コメント列は従来どおり静的、脈拍レーン(1回目の設計)
は合計件数だけを動かす。たぬ姉の吹き出しに「+○ptはニコ生公開の順位表を前回と引き算
しただけ。新しく何かを取りに行ってはいないわ」と1文。

## B. 統合アーキ(Zの実装・既存ファイルとの配線)

```
/api/live-ranking (既存・変更なし。giftは koken ranking?rank=10 の rankers そのまま・api/live-ranking.js:274-305)
   └ 60秒ごと load() (live-ranking-entry.js:339) → render(data) (:254)
        ├ tracker.begin() (:275)  ← 既存(行が増えたか・900ms光る)
        ├ giftPulse.begin()                                          ★新規(隣に1行)
        ├ カードごと: rows = supporterRows(l) (:277)
        │    gp = giftPulse.pulseFor(l.liveId, rows.gift, data.capturedAt)   ★新規
        │    renderGiftPulseStrip(gp)   ← .stats 閉じ(:292)の直後にリボン   ★新規
        │    renderRows(rows.gift, l.liveId, 'gift', gp)  ← 第4引数を足す(:295)  ★変更
        │    ギフト列 h3 の .sum に「+N」(:295)                                 ★変更
        ├ tracker.end() (:300) / giftPulse.end()                     ★新規(隣に1行)
        └ bindImgFallback(elList) (:301) ← リボン内の <img class="ava"> も既存セレクタ(:163)で拾われる
```

| # | コンポーネント | ファイル | 役割 |
|---|---|---|---|
| 1 | **`liveGiftPulse.js`(純ロジック・新規)** | `src/lib/liveGiftPulse.js` + `.test.js` | 配信ごとに「前回の実測(gift rows)」を持ち、新しい`capturedAt`が来たときだけ行ごとの正の差分・帯(tier)・最大の1人・合計・実測間隔を返す。DOMを触らない。 |
| 2 | **配線(既存ファイルへ追記・約35行)** | `src/extension/live-ranking-entry.js` | `renderRows`に第4引数`pulse`、`renderGiftPulseStrip`1関数、`render()`にbegin/pulseFor/end。 |
| 3 | **見た目(既存`<style>`へ追記・約20行)** | `tsuioku-no-kirameki/live/index.html` | `.delta` / `li.is-gifted.tier-*` / `.sum-delta` / `.gift-pulse` / reduced-motion。 |
| 4 | **開示文(1文ずつ)** | `live/index.html`たぬ姉の吹き出し(:375)・`.note`(:392) | 「前回取得との引き算」であることを書く。`privacy.html`は**変更不要**(取得する情報・保存・頻度が1つも変わらない。§14-1 :723の「ポイント数・順位」の範囲内)。 |

**新しいAPI・ライブラリ・インフラ・エンドポイントは0本。サーバー(`api/`・`scripts/`)は
1行も触らない。ニコ生への問い合わせは1本も増えない。**

**既存部品との関係(混ぜない・司令塔が実在確認済みの行番号)**
- `createRowChangeTracker`(`liveRankingView.js:403-431`)は「行が増えたか」を**クラス名
  だけ**で返し(`is-bumped`/`is-new`)、キーは**名前**(`rowKey` :439-441。匿名でIDが
  欠けるため)。差分の**数値**は返さない。今回は数値と帯が要るので**別モジュール・
  別キー(uid)**。trackerは改修しない(`liveRankingView.js`を触らない=`impact-check`の
  波及ゼロ)。
- 帯(tier)のしきい値は**`giftDeltaFallback.js:31-35`の`GIFT_DELTA_TIER_THRESHOLDS`と
  `tierForGiftDeltaPoints`(:69-75)を import**する(small 1〜49 / medium 50〜499 /
  large 500〜4,999 / mega 5,000〜。司令塔が実在確認済み)。拡張の演出・効果音と同じ
  序列(MEMORY「演出の派手さは価値の序列を守る」)。新しいしきい値を発明しない。
- 時点の解釈は`timeAuthority.js`の`toEpochMs`(`liveRankingView.js:28-30`の祖父条項)。
- 1回目の設計(`liveMotion.js`)の`createMotionRegistry`と**流儀を揃える**
  (begin/trackFor/end・同じ`capturedAt`の再送は捨てる)が、別モジュール。片方だけ
  入れても動く(相互依存なし)。

## C. 具体機構

### C-1. `src/lib/liveGiftPulse.js`(純ロジック)

```js
import { toEpochMs } from './timeAuthority.js';
import { tierForGiftDeltaPoints } from './giftDeltaFallback.js';

/** この間隔を超えた2実測は差分を出さない(15分。1回目設計の RATE_MAX_GAP_MS と同じ根拠=cron遅延中央値12分を包む)。 */
export const PULSE_MAX_GAP_MS = 15 * 60_000;

/** @typedef {import('./liveRankingView.js').SupporterRow} SupporterRow */
/** @typedef {{ delta: number, tier: 'small'|'medium'|'large'|'mega' }} RowPulse */
/**
 * @typedef {{ byKey: Map<string, RowPulse>, sum: number, spanMs: number,
 *   top: { row: SupporterRow, delta: number }|null, tier: RowPulse['tier']|null }} PulseResult
 */

/** @type {PulseResult} 何も無い(初回・再送・古すぎ・増分なし)。 */
export const EMPTY_PULSE = Object.freeze({ byKey: new Map(), sum: 0, spanMs: 0, top: null, tier: null });

/**
 * 行の同一性キー。★数値 uid がある行だけ追跡する。
 *   koken の匿名行は supporterId を欠き名前が "名無し"(kokenContributionRankingApi.js:29,181)で
 *   複数人が同名になる → 名前でつなぐと別人の差分を1人に載せる。匿名は差分を出さない(嘘より無言)。
 * @param {SupporterRow|null|undefined} row @returns {string} '' なら追跡しない
 */
export function pulseRowKey(row) {
  const uid = String((row && row.uid) || '').trim();
  return uid ? `u:${uid}` : '';
}

/** @param {SupporterRow[]} rows @returns {Map<string, number>} key → point */
function pointsByKey(rows) {
  const m = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const k = pulseRowKey(r);
    if (k) m.set(k, Math.max(0, Number(r.point) || 0));
  }
  return m;
}

/**
 * 前回の点 → 今回の行 の正の差分だけ。減少(仕様変更・欠測)と前回いなかった人は載せない
 * (top10 に入ってきた人の「全額」を1分の増分と偽らない)。
 * @param {Map<string, number>} prevPoints @param {SupporterRow[]} rows @param {number} spanMs
 * @returns {PulseResult}
 */
export function diffGiftRows(prevPoints, rows, spanMs) {
  const byKey = new Map();
  let sum = 0;
  /** @type {{ row: SupporterRow, delta: number }|null} */
  let top = null;
  for (const r of Array.isArray(rows) ? rows : []) {
    const k = pulseRowKey(r);
    if (!k || !prevPoints.has(k)) continue;
    const d = (Number(r.point) || 0) - /** @type {number} */ (prevPoints.get(k));
    if (!(d > 0)) continue;                                   // ★減った=信じない(AGENTS §3.6)
    byKey.set(k, { delta: d, tier: tierForGiftDeltaPoints(d) });
    sum += d;
    if (!top || d > top.delta) top = { row: r, delta: d };
  }
  if (!top) return EMPTY_PULSE;
  // ★カード全体の帯は「最大の1件」で決める(合計で決めると小口の積み上げが大口の色を借りる=序列が壊れる)
  return { byKey, sum, spanMs, top, tier: tierForGiftDeltaPoints(top.delta) };
}

/**
 * 配信ごとの器。tracker(createRowChangeTracker)と同じ begin/end の流儀で、今回出なかった配信を捨てる。
 * ★同じ capturedAt の再送(throttled/inFlight・api/live-ranking.js:656-663)では前回の結果を【そのまま】返す
 *   =バッジは次の新しい実測まで画面に残り、巻き戻らない。
 */
export function createGiftPulseRegistry() {
  /** @type {Map<string, { at: number, points: Map<string, number>, result: PulseResult }>} */
  let lives = new Map();
  /** @type {Set<string>|null} */ let touched = null;
  return {
    begin() { touched = new Set(); },
    /**
     * @param {unknown} liveId @param {SupporterRow[]} rows 今回の gift 行(supporterRows(l).gift)
     * @param {unknown} capturedAt data.capturedAt(サーバの収集時刻・toEpochMs で解釈)
     * @returns {PulseResult}
     */
    pulseFor(liveId, rows, capturedAt) {
      const id = String(liveId || '');
      if (touched) touched.add(id);
      const at = toEpochMs(capturedAt);
      const cur = lives.get(id);
      if (!at) return cur ? cur.result : EMPTY_PULSE;         // 時点が読めない=何も言わない
      if (cur && at <= cur.at) return cur.result;             // ★再送・逆行は前回の結果を維持
      const points = pointsByKey(rows);
      let result = EMPTY_PULSE;
      if (cur) {
        const span = at - cur.at;
        result = span <= PULSE_MAX_GAP_MS ? diffGiftRows(cur.points, rows, span) : EMPTY_PULSE;
      }
      lives.set(id, { at, points, result });                  // ★古すぎても標本は更新する(次の差分の起点)
      return result;
    },
    end() {
      if (touched) for (const k of Array.from(lives.keys())) if (!touched.has(k)) lives.delete(k);
      touched = null;
    },
    size() { return lives.size; }
  };
}

/** 「+1,200pt」。0 以下は ''(嘘の +0 を書かない)。 */
export function formatPtDelta(d) {
  const n = Math.floor(Number(d) || 0);
  return n > 0 ? `+${n.toLocaleString('ja-JP')}pt` : '';
}

/** 実測間隔の文言。「この1分」と決め打ちしない(裏タブ復帰・cron遅延で 3 分のこともある)。 */
export function spanText(spanMs) {
  const s = Math.round((Number(spanMs) || 0) / 1000);
  if (s <= 0) return '';
  return s < 120 ? `直近 ${s} 秒` : `直近 ${Math.round(s / 60)} 分`;
}
```

**テスト(`liveGiftPulse.test.js`・vitest)で固定する契約**
1. 初回`pulseFor`は`EMPTY_PULSE`(前回が無いのに差分を出さない)。
2. 同じ`capturedAt`で再度呼ぶと**同一のresultオブジェクト**が返る(throttled/inFlightで
   バッジが消えない・巻き戻らない)。
3. 2回目で`point`が増えた行だけ`byKey`に載り、`tier`は`tierForGiftDeltaPoints(delta)`と
   一致。減った行・同じ行は載らない。
4. `uid`の無い行(匿名「名無し」)は増えても載らない。`sum`/`top`にも含まれない。
5. 前回いなかったuidは載らない(top10入りの全額を増分にしない)。
6. `top`は単一最大差分、`result.tier`は`top.delta`の帯(合計ではない)。
7. `span > 15分`は`EMPTY_PULSE`を返すが標本は更新され、その次の差分は新標本を起点にする。
8. `end()`はtouchされなかった配信を捨てる。`formatPtDelta(0)===''`、
   `spanText(62_000)==='直近 62 秒'`、`spanText(180_000)==='直近 3 分'`。

### C-2. `live-ranking-entry.js` の配線(追記箇所を名指し)

```js
// import(19行付近)
import { createGiftPulseRegistry, pulseRowKey, formatPtDelta, spanText } from '../lib/liveGiftPulse.js';
const giftPulse = createGiftPulseRegistry();   // ★tracker(36行)とは別物。名前も別。

// renderRows(131行) — 第4引数 pulse を足す(gift 以外は null のまま=挙動不変)
function renderRows(rows, liveId, kind, pulse = null) {
  ...
  const html = rows.map((r) => {
    const n = Number(r.rank) || 0;
    const rp = pulse ? pulse.byKey.get(pulseRowKey(r)) : undefined;
    const cls = [tracker.classFor(rowKey(liveId, kind, r), Number(r.point) || 0), rp ? `is-gifted tier-${rp.tier}` : '']
      .filter(Boolean).join(' ');
    ...
    const inner = `<span class="no${n > 0 && n <= 3 ? ' top' : ''}">${n || '-'}</span>`
      + `${ava}<span class="nm">${esc(r.name)}</span>`
      + `<span class="pt">${num(r.point)}${kind === 'comment' ? '件' : 'pt'}</span>`
      + (rp ? `<span class="delta" title="前回の取得（${esc(spanText(pulse.spanMs))}）からの増分">${esc(formatPtDelta(rp.delta))}</span>` : '');
    ...

// リボン(新規関数・renderCommentCol の隣)
/** @param {import('../lib/liveGiftPulse.js').PulseResult} gp */
function renderGiftPulseStrip(gp) {
  if (!gp || !(gp.sum > 0) || !gp.top) return '';
  const r = gp.top.row;
  // ★<img class="ava"> にしておくと bindImgFallback(163行 'img.ava')が読み込み失敗を素の丸へ落とす
  const ava = (r.avatar && !isBlankIcon(r.avatar))
    ? `<img class="ava" src="${esc(r.avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : '<span class="ava"></span>';
  const who = r.url
    ? `<a class="gp-who" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${ava}<b>${esc(r.name)}</b></a>`
    : `<span class="gp-who">${ava}<b>${esc(r.name)}</b></span>`;
  const others = gp.sum > gp.top.delta ? `・上位10人で ${esc(formatPtDelta(gp.sum))}` : '';
  return `<div class="gift-pulse tier-${esc(gp.tier)}" title="ニコ生が公開しているギフト順位表の、前回取得との差です（当サイトが新しく取得した情報ではありません）">`
    + `🎁 ${who} さんが <b class="gp-pt">${esc(formatPtDelta(gp.top.delta))}</b>${others}`
    + `<span class="gp-span">（${esc(spanText(gp.spanMs))}）</span></div>`;
}

// render()(254行〜)
tracker.begin();
giftPulse.begin();                                                        // ★275行の隣
elList.innerHTML = ordered.map((l, i) => {
  const rows = supporterRows(l);
  const gp = giftPulse.pulseFor(l.liveId, rows.gift, data.capturedAt);   // ★277行の隣
  ...
    + '</div>'                                                            // .stats 閉じ(292行)
    + renderGiftPulseStrip(gp)                                            // ★リボンは .stats と「サムネ付き」枠の間
    + renderKnown(...)
    + '<div class="cols">'
    + `<div class="col"><h3><img ...>ギフトで支えた人 <span class="sum">${num(l.giftTotal)}pt`
    + (gp.sum > 0 ? ` <span class="sum-delta">${esc(formatPtDelta(gp.sum))}</span>` : '')
    + `</span></h3>${renderRows(rows.gift, l.liveId, 'gift', gp)}</div>`  // ★295行
  ...
tracker.end();
giftPulse.end();                                                          // ★300行の隣
bindImgFallback(elList);
```

広告列(`:296`)は`renderRows(rows.ad, l.liveId, 'ad')`のまま(第4引数なし=不変)。同じ
機構で広告も出せるがMVPではやらない(E参照)。

### C-3. CSS(`live/index.html` の `<style>`・`ol.rank li.is-bumped`(300行)ブロックの近くに追記)

```css
/* ── ギフトの増分(前回取得との差)。帯の色は拡張の演出と同じ序列: 〜499 橙淡 / 500〜 橙濃 / 5000〜 赤 ── */
.delta { flex: 0 0 auto; margin-left: 4px; font-size: .74rem; font-weight: 800; color: var(--orange); font-variant-numeric: tabular-nums; white-space: nowrap; }
ol.rank li.is-gifted { background: linear-gradient(90deg, rgba(200,114,28,.10), transparent 70%); border-radius: 8px; }
ol.rank li.is-gifted.tier-large { background: linear-gradient(90deg, rgba(200,114,28,.22), transparent 70%); }
ol.rank li.is-gifted.tier-mega { background: linear-gradient(90deg, rgba(192,42,42,.22), transparent 70%); }
ol.rank li.is-gifted.tier-mega .delta { color: #c02a2a; font-size: .84rem; }
.col h3 .sum-delta { font-size: .78rem; font-weight: 800; margin-left: 4px; }
.gift-pulse { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 14px; font-size: .84rem; color: var(--ink); background: #fff7ec; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; animation: nl-gift-glow 2.4s ease-out; }
.gift-pulse .gp-who { display: inline-flex; align-items: center; gap: 6px; color: inherit; text-decoration: none; min-width: 0; }
.gift-pulse .gp-who b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 14em; }
.gift-pulse .gp-who:hover b { text-decoration: underline; }
.gift-pulse .gp-pt { color: var(--orange); }
.gift-pulse .gp-span { color: var(--ink-sub); font-size: .74rem; }
.gift-pulse.tier-large { background: #ffefd6; }
.gift-pulse.tier-mega { background: #ffe3e3; }
.gift-pulse.tier-mega .gp-pt { color: #c02a2a; font-size: .95rem; }
@keyframes nl-gift-glow { 0% { box-shadow: inset 0 0 0 0 rgba(200,114,28,0); } 30% { box-shadow: inset 0 0 0 2px rgba(200,114,28,.45); } 100% { box-shadow: none; } }
@media (prefers-reduced-motion: reduce) { .gift-pulse { animation: none; } }
```

既存の`@media (prefers-reduced-motion: reduce)`(306-308行)に`.gift-pulse`を足しても
よい(どちらか1箇所)。**バッジと色はreduced-motionでも残す**(情報であって動きでは
ない)。`contain`は使わない(MEMORY・可変高さ)。

### C-4. 開示文

- たぬ姉の吹き出し(`live/index.html:375`)末尾に1文: 「**「+○pt」**はニコ生が公開している
  ギフト順位表を**前回の取得と引き算しただけ**よ。新しく何かを取りに行ってはいないわ。」
- `.note`(`:392`の段落)末尾に1文: 「「+○pt」の表示は、この公開ポイントの前回取得
  （60秒ごと）との差です。」
- `privacy.html`: **変更なし**(取得する情報の種類・取得元・頻度・保存が1つも変わらない。
  §14-1 :723「表示名・アイコン画像・ポイント数・順位」に含まれる)。3点同期
  (AGENTS §10)は「文言を変えたら」の規律なので、今回は発動しない。

### C-5. データフロー(文で)

1. `load()`が60秒ごとに`/api/live-ranking(?refresh=1)`(既存・頻度不変)。
2. `render()`で配信ごとに`giftPulse.pulseFor(liveId, rows.gift, capturedAt)`。**新しい
   `capturedAt`のときだけ**前回標本と引き算し、結果を保存。同じ`capturedAt`
   (throttled/inFlight)は前回の結果をそのまま返す。
3. 行の`is-gifted tier-*`と`.delta`、ギフト列見出しの`.sum-delta`、`.stats`直下の
   リボンは、その結果から**毎回のinnerHTML全置換で描き直す**(状態はregistryに、DOMに
   持たない)。
4. 次の新しい実測で増分が無ければ`EMPTY_PULSE`→バッジ・リボンが消える。
5. `end()`で消えた配信の器を捨てる。

## D. パターンX/Y/Zの区別と裁定(★最重要)

### D-1. 3パターンの技術的な正体(誰が取る・誰が見る・何を)

| | 取る主体 | 見る主体 | 見せるもの | 今日との差 |
|---|---|---|---|---|
| **Z(見せ方の強化)** | 当サイトのサーバー(60秒・既存) | 不特定多数 | 既に画面にある名前・サムネ・pt(koken公開順位表)の**2回の実測の差** | 取得・頻度・対象データ**0変更**。表示の計算だけ |
| **Y(訪問者本人のブラウザが直接見る)** | 訪問者のブラウザ | 訪問者本人だけ | ニコ生公式のコメント・ギフト通知 | 当サイトは**何も配信しない**(純Y)。ただし「`/live/`の中に埋め込む」形は後述のとおり技術的に閉じている |
| **X(サーバー中継)** | 当サイトのサーバー | 不特定多数 | コメント本文・ギフト通知の個別イベント | 程度の問題。**X0(有界・オンデマンド)は既に稼働中**、X1(短時間ストリーム)・X2(常駐)は未実装 |

### D-2. Yの裁定: 「理屈は正しいが、成立する形は外部タブへの誘導だけ」

**技術(2026-09-27にFableが補助として実測・lv351173877)**
- `https://live.nicovideo.jp/ranking`と`/watch/<lv>`はともに**`X-Frame-Options:
  SAMEORIGIN`**→`/live/`へのiframe埋め込みは**不可**(ブラウザが描画を拒否する。回避
  手段は無い・回避を試みるのは規約面でも悪手)。
- `api.koken.nicovideo.jp` / `api.nicoad.nicovideo.jp`に`Origin:
  https://tsuioku-no-kirameki.com`を付けてGET→**403・`Vary: Origin`・
  `Access-Control-Allow-Origin`無し**(実測1回)。訪問者のブラウザから当サイトorigin
  で直叩きしても本文は読めない(`api/live-ranking.js:16`の記述と一致。★403がOrigin
  起因かUA起因かは未確認だが、どちらでもブラウザ直読みは今日成立しない)。
- NDGRに到達するにはwatch HTML→視聴WS握手(`audience_token`入りURL)→`viewUri`の3段が
  要る(`api/live-recent-comments.js:6-7`・`nicoliveGuest.js:50-61`)。**第1段のwatch
  HTMLがブラウザからCORSで読めない**(`council/hover-latency-question.txt:45`に
  「実証済み」)。NDGR区画自体のCORSがweb originに開いているかは**未確認**(拡張文脈
  での「CORS *」記述のみ)だが、第1段で閉じているので結論は変わらない。
- ⟹ **「`/live/`のUI内で訪問者のブラウザが直接コメントを見る」形は、当サイトのサーバー
  が何も手伝わない限り成立しない。** 手伝う(=サーバーが取った`wsUrl`/`viewUri`を訪問者
  へ渡す)と、それは**訪問者に視聴セッションの接続情報を配る=中継の一形態(X)**になり、
  `nicoliveGuest.js:9-14`の「viewUriは外へ出さない」制約にも反する。**「Yだから1回目の
  制約の対象外」という理屈は、純Y(当サイトが何も表示しない)にだけ成立し、サーバー
  補助付きのYには成立しない。**

**成立するY=外部タブへの誘導。** これは既に3箇所ある(`.shot`・`h2 a`・`.url`、いずれも
`watchUrlOf`へ`target="_blank"`)。ニコ生公式の視聴ページを本人が開く行為そのもので、
当サイトの表示・保存・中継は一切発生せず、法的にも規約的にも論点が無い。追加で作るもの
があるとすれば「コメントとギフトはニコ生で流れています→見てくる」の**文言**だけ
(コードは要らない)。

**法的整理**: 純Yは「リンクを貼る」以上のことをしていない。D-3②の禁止対象(当サイトが
個人単位の秒刻みを**表示**すること)には当たらない=対象外という理屈は**正しい**。ただし
空虚(表示しないから対象外)であり、「Yで秒単位体験を`/live/`内に実現する」道は無い。

### D-3. Zの裁定: 「1回目の設計の禁止対象ではなく、AGENTS §3.5が推奨する領域。両者は矛盾しない」

1回目のD-3②を正確に読む: 「個人単位の**秒刻み演出**は一切しない: 動かすのは
`commentCount`(番組合計)だけ。…脈の点は無名で…」。禁止しているのは**実測点の間を
個人単位で補間・脈打たせる・時刻を発明する**こと(=10分ごとのtallyしか無いのに秒刻みの
根拠を捏造する)。Zは**実測点でだけ**変わる(60秒ごとの2実測の差を、次の実測まで静止
表示)。補間ゼロ・発明ゼロ。しかも同じことを既存の`is-bumped`(`liveRankingView.js:419`・
行ごとに「増えた」を光らせる)が既にやっており、Zはその**数値化と持続化**に過ぎない。

AGENTS §3.5は「ニコ生上で公開されている応援情報(コメント/ギフト)はOSINTとして堂々と
載せる。応援者は主役。境界線は非公開情報・追跡的プロファイリングのみ」。Zが出すのは
kokenが無認証で公開している順位表の値とその差(公開情報)、対象は既に画面に出ている
10人、追跡的プロファイリング(番組をまたいだ蓄積・時系列の保存)は無い(標本は前回1点
のみ・メモリのみ・タブを閉じれば消える)。

**統一原則(両文書を1文で束ねる)**:
> 個人単位の値は、**実測点でだけ**変える(順位・pt・差分・新規入り)。**実測点の間を
> 個人単位で補間・脈打たせる・時刻を発明することはしない。** 合計値(番組件数)だけは
> 実測に挟まれた補間が許される。

前半が§3.5の領域(Zが居る)、後半がD-3②の領域。**適用対象が違うだけで矛盾していない**、
というブリーフの整理は**正しい**。

★[`live-comment-motion-DESIGN.md`](live-comment-motion-DESIGN.md)のD-3②へ、以下の
適用範囲注記を追記すること(文言修正のみ・設計判断は変えない):
> 「★対象は補間・演出で発明する時刻。実測差分の表示(giftの+pt等)や既存のオンデマンド
> 本文表示(ホバー)は本条の対象外。」

**Zの残存リスク**: 今日の`/live/`と**同一の地平**(取得・保存・頻度が不変)。増えるもの
は無い。

### D-4. Xの裁定: 「程度で分ける。X0は既に稼働中、X1はインフラで閉じる、X2は確定制約」

会議の「危険」判定はX2(サーバー常駐・不特定多数へ本文を再配信)への判定であり、そこは
正しい。しかしXは二値ではない。

| 等級 | 形 | 状態 | 裁定 |
|---|---|---|---|
| **X0** | 訪問者の**能動操作(ホバー)の瞬間だけ**、その配信に1回握手→NDGRを≤4秒だけ浅く遡り→対象≤10人×≤5件×80字→メモリ60秒→破棄。Redis/ディスク保存なし(`api/live-recent-comments.js:6-9,36,44`) | **稼働中・privacy §14-1(:725)で開示済み** | **維持**。「訪問者がクリックした瞬間だけ短時間繋いで即切断」の仮説は、コメントについては**既にこの形で実装・受容済み**。会議の前提(常駐)とは別物で、結論は変わる=「有界のオンデマンド中継は可」 |
| **X1** | クリック後N秒間「コメントの流れ」を秒単位でその配信から中継 | 未実装 | **今回は不採用**。理由は法より先に**インフラ**: Vercel Serverlessは接続を保持できない(既定10秒・SSE不可)ため、実装は「数秒ごとの再ポーリング」になり、1ポーリング=1握手=**来場者+1が訪問者数×回数で積み上がる**(「常駐」を訪問者へ分散しただけ)。確定制約(Vercel・新インフラ禁止・問い合わせ頻度)に正面から当たる。法的にも本文=表現(著作権軸)を**量として**再表示する方向で、X0の「5件・80字・オンデマンド」よりX2に近づく。「流れている感」は1回目の設計(合計件数の脈拍)で出す |
| **X2** | サーバー常駐でNDGRを張り本文を配信 | 未実装 | **不採用(確定制約・蒸し返さない)** |
| **Xg(ギフト特化)** | 「誰が**どんな**ギフトを」=品名`itemName`はkoken**`/histories`**(無認証・公開・`kokenGiftHistoryApi.js:15,20-24`・`{supporterId, supporterName, itemName, point, publishedAt}`)にある。NDGRではなく**通常のHTTP JSON**で、サーバーの60秒収集に1 fetch/配信を足すだけで取れる | 未実装 | **次段の第一候補(Z')**。ギフト通知は「事実(誰が・何を・いくら)」で表現ではない→著作権軸に乗らない。取得は常駐でなく60秒収集の一部(最大+20 fetch/60秒)。ただし(a)問い合わせがkokenに対し**2倍**になる、(b)privacy §14-1に「品名」を足す3点同期が要る、(c)`collectOne`と保存形が変わる=`api/`を触る。**MVP(Z)で「+ptの見せ方」の効果を確かめてから**(1回目の失敗「大きく見せただけ」の再発防止=まず既存データで価値が出るか) |

**D-3②の維持/緩和の結論**: **文面は維持、適用範囲を明示して狭める**(D-3の注記)。
緩和ではなく「もともと合計値の補間にしか掛かっていなかった」ことの明文化。X0は本条の外で
既に受容済み、X1/X2は本条ではなく確定制約で閉じている。

本設計書は法的助言ではない。上の整理は「表現/事実」「合計/個人別」「実測/発明」
「常駐/オンデマンド」「サーバー配信/本人閲覧」の5軸で残存リスクを既存実装と同じ地平に
留めるための判断であり、確実性を主張しない。ニコニコ利用規約の一次確認は1回目設計と
同じく未了(既存`/live/`全体に共通する論点として扱う)。

### D-5. 拡張「アイコン列」(3レーン振り分け・匿名識別)を`/live/`へそのまま移植することは**推奨しない**

> 司令塔からの追加制約(拡張の応援レーン=アイコン列`nl-story-userlane`がv0.1.1037〜1042の
> 6版がかりで根治したちらつきの歴史を持つ・ユーザー証言「動きが遅かったりうまくいって
> なかった」)を受けての追加裁定。MEMORY `story-userlane-churn-filllanetier-v1039.md` /
> `rank-lane-freshness-churn-v1038.md`を再読して裏取り済み。

**裁定: 推奨しない。理由は取得元の規約ではなく、性能・実装リスク。**

- 拡張側の真因は3つ(MEMORY v1039/v1041で実コード確定): (1) 3秒pollのたびに
  `giftThrowerPicks`/`adThrowerPicks`を無条件`Object.freeze([])`へリセット→**空描画→
  充填描画の2段paint**が毎poll往復、(2) `fillLaneTier`が無条件`innerHTML=''`→全タイル
  再生成で**diff-skip無し**、(3) `paintStoryUserLaneDomEmptyGuides`/
  `resetStoryUserLaneDom`という**「消す側」に計器が無く**、描く側(`laneRepaintCounts`)が
  「repaint≈0」を示しても出入りが止まらなかった(v1040→v1041)。北極星ランキング列は
  別系統でv1038(diff-skipキーにfreshness時刻が混入→毎paint再描画)。**これらは
  「ユーザー本人のブラウザ・ログイン済み・視聴WSを張りっぱなし・3秒でローカルstorage
  を読むだけ」という最良条件でも起きた。**
- `/live/`はその全部で条件が悪い: 不特定多数・無認証・データはサーバー経由60秒・
  訪問者ごとに状態はゼロから・コメント側の材料(NDGR)は都度握手
  (`api/live-recent-comments.js`は1配信60秒に1回へ絞っている)。しかも3レーン振り分け
  (りんく=配信者視点/こん太=ファン視点/たぬ姉=匿名)は**コメント単位の発言者情報と
  プロファイル段階(profileTier)**を前提にしており、`/live/`の手元には無い(top10の
  順位表と10分ごとの件数だけ)。材料が無いものを移植すると「空→充填」のflipを
  **構造的に再発明**する(拡張の真因(1)と同じ形)。
- **重要な事実: `/live/`には既に「段階的な信頼度で分ける」構造の移植が済んでいる**。
  `renderKnown`(`live-ranking-entry.js:83-115`。司令塔が実在確認済み)=「サムネ付き
  (数値ID+個人サムネ)」→「ハンドルネームのみ(identicon・点線枠)」の2段
  (`identifiedSupporters`/`identifiedSupportersByName`、`liveRankingView.js:300-393`)。
  これがアイコン列の**考え方**の`/live/`版で、AGENTS §3.5の「サムネ・ID・名前・リンクの
  セット」も満たしている。**移植すべき「構造」は既に移植済みで、残っているのは実装
  (3秒poll・2段paint・fillLaneTier)だけ。その実装こそ持ち込んではいけない部分。**

**判定**: 今回のMVP(ギフト演出強化)からは**完全に切り離し、当面触らない**。将来やるなら
「構造だけ参考(段階的信頼度)・実装は`/live/`用に一から」だが、そもそも`renderKnown`が
構造の移植体なので、将来課題は「新規移植」ではなく**`renderKnown`の安定性を観測すること**
(D-5b)に置き換わる。

### D-5b. `/live/`に既にある「消す側」の無計器経路(★未確認・観測課題として記録。MVPでは触らない)

拡張の教訓「消す側に計器かdiff-skip」を`/live/`の現行コードに当てると、**60秒周期の
出入り**を起こし得る経路が2つ見える。どちらも今回の変更対象外(「ついで修正」禁止・
AGENTS §12.2)だが、**実機で観測する候補**として明記する:

1. **`bindImgFallback`の`.tava`分岐(`live-ranking-entry.js:168-171`。司令塔が実在
   確認済み)**: サムネ付き枠の画像が404→その`<li>`を**DOMから削除**する。60秒後の
   `render()`は同じ人を再描画→画像を再要求→再404なら再削除。ブラウザが404を短時間
   キャッシュしない限り、**その人のタイルが60秒ごとに出て消える**(拡張v1041と同型の
   「消す側」)。直し方の候補は「一度404したuidをページ内の負キャッシュに入れ、次回
   描画で最初から第2段(ハンドルネーム)へ倒す」(負キャッシュの思想)。**別バンプ・
   観測してから。**
2. **kokenが`200 + rankers:[]`(`kokenContributionRankingApi.js:30`。司令塔が実在確認
   済み)を返した収集**: `collectOne`は`gift:null` or 空→その60秒だけギフト列が
   「まだいません」に畳まれ、次の収集で戻る。データの真の空か上流の一過性かを区別
   できないのは上流仕様で、`/live/`は**保存済み全体を空で上書きしない**掟
   (`api/live-ranking.js:673-691`)は持つが**1配信の列単位**では持たない。拡張v1041の
   「一度実データを描いたら一瞬の空では畳まない(同一配信・実タイルがあるときだけ)」
   ルールの`/live/`版が候補。**別バンプ・観測してから。**

### D-5c. 教訓を今回のMVP(Z)にどう適用するか

**`createRowChangeTracker`(`liveRankingView.js:403-431`)は健全な設計であることを
確認した。壊さない。**
- `begin()`で`touched`を新設、`classFor()`は`prev/touched/seen`を更新して**クラス名
  だけ**返す、`end()`で`prev = touched`(今回出なかったキーを捨てる)+`seen`を作り直す+
  `firstPaint=false`。**初回描画は全行''を返す**(全行「新規」で光らせない=嘘の演出を
  出さない)。`end()`でのみ状態を確定するので、途中で例外が出ても次の`begin()`が
  `touched`を作り直す=汚染が残らない。
- trackerは**DOMを消さない**。`/live/`の「消す側」は`render()`の`elList.innerHTML =
  ordered.map(...)`(`:276`)の**1回の同期代入**であり、**完全なデータが揃ってから1回
  だけ**描く(拡張の真因(1)「空→充填の2段paint」が構造的に無い)。`showState`
  (`:305-310`)は失敗時に**`elList.children.length`が0のときだけ**「読み込み中」を
  描き、一覧を空で潰さない。=v1041の「一瞬の空で畳まない」を、ページ全体の粒度では
  既に守っている。
- ∴ **trackerと`render()`の1回描き構造は拡張の6版の教訓を先取りした形になっている。
  今回の変更はこの形を1ミリも変えない。**

**MVPが守る規律(コードとテストで固定する・「文書に書いても84版積まれた」)**
1. **`giftPulse`はmodule scopeで1回だけ生成し、`load()`開始・失敗・
   `visibilitychange`のどこでもリセットしない**(拡張の真因(1)の再発防止)。状態が
   変わるのは`pulseFor()`内で`capturedAt`が前進したときだけ。同じ`capturedAt`
   (throttled/inFlight)では**同一のresultオブジェクト**を返す(契約2)=データ層の
   diff-skip。DOMは60秒ごとに作り直されるがHTMLがbyte同一なので視覚は静止する
   (今日の`/live/`と同じ地平・新しいchurn周波数を足さない)。
2. **描画を2段にしない**: 「先にrender→後からpulseを取って書き足す」形を禁止。
   `pulseFor`は`renderRows`の**前**に同期で呼び、その結果で1回描く(C-2のとおり)。
3. **`begin()`/`end()`はtrackerと対で1回ずつ、`render()`の同じ位置に置く**(`:275`と
   `:300`の隣)。`end()`のpruneが`begin()`無しで走ると全配信を捨てる=次回の差分が
   全部消える。
4. **「消す側」の計器はテストの形で置く**(ランタイム計器を足しても直らない・MEMORY
   「計器を足して満足し直さない」): `src/lib/liveGiftPulse.wiring.test.js`(既存の
   配線テストと同じ流儀=ソース文字列を読む)で固定する契約 — (a)
   `live-ranking-entry.js`に`createGiftPulseRegistry()`の呼び出しが**ちょうど1回**
   あり、それが関数の外(トップレベル)にある、(b) `giftPulse.begin()`と
   `giftPulse.end()`が**それぞれ1回**、(c) `giftPulse =`の再代入が**0回**、(d)
   `renderRows(rows.gift`の呼び出しに第4引数が渡っている。これで「誰かがload開始時に
   リセットを足す」「begin/endの片方だけ消す」を機械が止める。
5. **diff-skipキーに時刻を入れない**(v1022/v1038の地雷): `spanText`の文字列は表示に
   だけ使い、**resultの同一性判定やDOMの比較キーには使わない**。`pulseFor`の再送判定は
   `capturedAt`の大小だけ(`Date.now()`を使わない)。
6. **`.delta`/`.gift-pulse`をJSで後から書き換えない**(1回目設計のrAFループの対象外)。
   動くものはギフト側に1つも無い=静止表示。

**まとめ**: 拡張のアイコン列は「表示ロジックの完成度」と「実装の安定性」が別物で、
後者に6版かかった。`/live/`は前者の構造(段階的信頼度)を`renderKnown`として既に持ち、
後者の欠陥(毎pollリセット・2段paint・無条件全消し)を持たない1回描き構造になっている。
**今回のZはこの1回描き構造の中に「registryの結果から1回で描く」を足すだけ**で、tracker
も`render()`の骨格も触らない。アイコン列の実装移植は不採用、既存`renderKnown`の観測
(D-5b)を将来課題として残す。

## E. MVP(Zのみ・その中でも最小の一歩)

**第1歩(このバンプで作る)**: `liveGiftPulse.js` + ギフト列の行バッジ`+N pt` + 帯色 +
見出し`.sum`の`+N` + たぬ姉/noteの1文。**リボン(`renderGiftPulseStrip`)は含めない。**

理由: (1) 「誰がギフトを上げたか」は行バッジで既に答えが出る(名前・サムネ・ID・
リンクは行に揃っている)。(2) 純ロジック1ファイル+配線約20行+CSS8行で`api/`無変更。
(3) 行の変更は`renderRows`の第4引数だけで、広告・コメント列は`null`で**挙動不変**
(回帰面が最小)。

**第2歩(効果を見てから・別バンプ)**: リボン(C-2の`renderGiftPulseStrip`・+15行+
CSS12行)。**第3歩**: 広告列にも同じregistryを使う(`pulseFor(l.liveId, rows.ad, …)`を
別registryで。1行)。**第4歩**: D-4のZ'(koken `/histories`で品名)。

## F. 捨てた案と理由

| 案 | 却下理由 |
|---|---|
| `giftTotal`の前後差をカードの増分にする | `giftTotal`は**top10の合計**(`api/live-ranking.js:285`)なので、11位→10位の入れ替わりで人が増えなくても合計が動く(churn)。行ごとの正の差分の合計(`sum`)の方が「誰が」と一致する。文言も「上位10人で+N」と正直に |
| top10に新しく入った人に「+全額」 | 前回11位以下だった可能性が高く、1分の増分ではない。trackerの`is-new`(420ms入場アニメ)が既に「新顔」を示しているので重ねない |
| 匿名「名無し」行の差分 | koken匿名行はuidを欠き複数人が同名→名前で結ぶと別人の差分を1人に載せる。出さない(嘘より無言) |
| 個人ptを60秒の間で補間して増やして見せる | D-3②そのもの(個人単位の発明)。統一原則の後半に反する |
| `createRowChangeTracker`にdeltaを足す | キーが**名前**(匿名対策)でuidと混ざる。`liveRankingView.js`を触ると`impact-check`の波及。別モジュールが安い |
| 品名(itemName)を今回出す | 現在の取得データに無い(koken rankingは`contribution`のみ)。無いものを出さない。Z'(D-4)へ |
| 効果音・花火・紙吹雪 | 公開ページに自動再生音は出さない(autoplay制約・訪問者は配信を別窓で聴いている)。花火は拡張の会場モードの語彙で、60秒遅れの静止データに付けると「いま起きた」の嘘になる。色の濃さ(帯)までに留める |
| 0.9秒で消える既存アニメを強める | 見逃す問題は「短い」ことが原因。派手にしても解決しない。**次の実測まで静止表示**が解 |
| iframe埋め込み(Y) | `X-Frame-Options: SAMEORIGIN`実測(D-2)。不可 |
| サーバーが`wsUrl`/`viewUri`を訪問者へ渡してブラウザ直結 | 中継(X)に化ける+`nicoliveGuest.js`の秘密規律違反 |
| クリック後N秒のコメントストリーム(X1) | Vercelは接続を保持できず、実装が「握手つき再ポーリング」になる=来場者+1の量産(D-4) |
| SSE/WebSocket中継・Cloudflare Workers | 確定制約 |
| 再送(throttled/inFlight)を新標本として扱う | 差分が0になりバッジが60秒おきに点滅する。契約2で固定 |

## G. 地雷と回避策

1. **throttled/inFlight応答は同じ`capturedAt`**(`api/live-ranking.js:656-663`)。
   `pulseFor`で`at <= cur.at`は前回結果を返す(契約2)。忘れると初回GET→直後の
   refresh:1(`load().finally(() => load({refresh:true}))` :409)の2連で標本が2点入り、
   バッジが出たり消えたりする。
2. **`render()`はinnerHTML全置換。** バッジはDOMに状態を持たず、毎回registryの結果から
   描く(C-5)。リボン内`<img>`は毎回作り直されるので`bindImgFallback`が毎回張り直す
   (既存の流儀のまま)。
3. **trackerのキー(名前)とpulseのキー(uid)を混ぜない。** 2つの器は別。`rowKey`を
   pulseに流用しない。
4. **匿名行の`uid`は''**(`supporterRows` :195 `uidFromUserPageUrl(url)`)。
   `pulseRowKey`が''を返し追跡外(契約4)。
5. **kokenは失敗時も`200 + rankers:[]`**(`kokenContributionRankingApi.js:30`)で
   「データ無し」と区別できない。`collectOne`はその場合`gift:null` or 空→
   `rows.gift=[]`→標本が空になる。次に人が戻ると「前回いなかった」扱いで差分なし
   (契約5)=誤った+全額は出ない。1収集ぶん静かになるだけ。
6. **`giftTotal`はtop10合計**(:285)。文言は「上位10人で+N」。「この配信のギフトが
   +N」と書かない。
7. **裏タブ→復帰・cron遅延で実測間隔が60秒でない**ことがある。「この1分」と書かず
   `spanText`で実測間隔を書く。15分超は差分を出さない(契約7)。
8. **`#list`は`aria-live="polite"`。** バッジはrenderごとの静的テキスト(毎秒書き換え
   ではない)なので洪水にならない。**`.delta`をJSで毎秒更新しない**(1回目設計のG-1と
   同じ落とし穴を掘らない)。
9. **`prefers-reduced-motion`**: `.gift-pulse`のglowのみ止める。バッジ・帯色は残す
   (情報)。
10. **`.stats`/`.col h3 .sum`には`tabular-nums`がある**(:217,251)。`.delta`/
    `.gift-pulse`にも付ける(桁変化で隣が動かない)。
11. **リボンの位置は`.stats`と「サムネ付きで応援した人」の間。** `.known`の背景
    (:221グラデ)と色が近いので、`.gift-pulse`は`border-bottom`で区切る。モバイル幅
    (≤640px)で名前が長いと折り返す→`.gp-who b`に`max-width:14em; ellipsis`。
12. **`live-ranking-entry.js`は550行・max-linesラチェット無し**(eslint.config.jsに
    `live-ranking`の項は無い。`src/extension/popup/**` 2000等は別)。ただしロジックは
    全部`liveGiftPulse.js`に置き、entryへの追記は約20行(第1歩)〜35行(第2歩)に抑える。
13. **`live/index.html`はページ内JS禁止**(eslint.config.js:539-546・冒頭コメント)。
    CSSだけ足す。
14. **verify:ccの4つの罠**: 新ファイル`src/lib/liveGiftPulse.js`・`.test.js`は
    **`git add`を明示列挙**(`??`取りこぼし事故)。`scripts/repo-tree-map.mjs`の
    `FEATURES`に1行(feature「ランキング(/live/)ギフト増分バッジ」・paths:
    `src/lib/liveGiftPulse.js`, `src/extension/live-ranking-entry.js`,
    `tsuioku-no-kirameki/live/index.html`)→`npm run tree-map`(**`git add`の後**)→
    `npm run feature-map`。bump3点セット(summary35字以内、例「/live/ ギフト増分を
    +ptで表示」)。`npm run impact-check`は`liveRankingView.js`無変更なので波及なし。
    `npm run site-health`は文言追加のみで影響なし。
15. **`giftDeltaFallback.js`をimportする副作用**: 同ファイルは純関数のみ(fetch/DOM
    なし)で`src/lib`規律に合う。`check-tracked-imports`の対象(追跡済みなので問題
    なし)。`timeAuthorityRegistry.test.js`は`src/lib`を文字列走査するため、新ファイル
    のコメントに`capturedAt|persistedAt|measuredAt`を**独自の時点フィールド名として
    書かない**(引数名`capturedAt`は`toEpochMs`経由で解釈しているが、祖父条項の検査が
    赤くなるなら引数名を`capturedAtRaw`へ)。★実装時に`npm run verify:cc`で確認。
16. **「リアルタイム」と書かない。** バッジのtitle・noteは「前回取得との差」。既存
    バッジ「⚡リアルタイム取得」(:341)は取得の話で残す。シェア文(`liveShareText`)は
    数値を入れない方針のまま(触らない)。
17. **1回目の設計(脈拍レーン)と同時に実装しない。** 同じ`render()`と`.stats`近傍を
    触るため版混在の元(AGENTS §12.5)。どちらかを先に着地させ、後の方が行番号を
    再確認する。両者は互いにimportしない設計にしてある。
18. **D-3の注記編集は司令塔専用**(MEMORY/reference更新は他ツールに渡さない)。実装
    担当に`live-comment-motion-DESIGN.md`を触らせない。
