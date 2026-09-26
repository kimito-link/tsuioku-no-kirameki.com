# /live/ に「コメントが動いている感じ」を実現する設計(council-fable手順2の産物)

> 設計=Fable(claude-fable-5-1) / 素材集め=無料会議5体 / 裏取り=司令塔(Sonnet 5) / 2026-09-26
>
> council-fableワークフロー3段構えの手順2の成果物。手順1(会議)の結果は
> `council-answers2.json`(スクラッチパッド、揮発)。この文書が正本。

## 背景・経緯

1. 当初「Chrome拡張の会場モードのような画面を`/live/`からも」という要望に対し、既存データ
   (gift/ad/comment上位10件)をモーダルで大きく表示する実装をした([PR #262](https://github.com/kimito-link/tsuioku-no-kirameki.com/pull/262))が
   「絵っとこれ普通にアップになっただけ 何の意味もない」「拡張とぜんぜんちがう」とユーザーに
   却下され、[PR #263](https://github.com/kimito-link/tsuioku-no-kirameki.com/pull/263)でrevert済み。
2. 真の要望を聞き直した結果:「会場モードだけじゃなくて、コメント数などのコメントとか動いてる感が
   ほしかった」「本当に秒単位でコメントが流れる(拡張と同等)」。
3. 技術調査の結果、サーバー側でNDGRを張り続けて本文を中継配信するのはVercel Serverless
   Functionのインフラ制約・規約/著作権リスクの両面で困難と判明。「違反しない形でうまくやる形が
   あるはず」というユーザー指示のもと、council-fableで設計した。

## 確定した制約(変更しない)

- コメント本文は一切表示・保存しない(現行方針を継続)。
- サーバー収集頻度は変更しない: クライアント自動更新60秒間隔(`AUTO_REFRESH_MS`)のまま。
  新規インフラ(Cloudflare Workers等)・新規APIエンドポイントは追加しない。
- ニコニコへの問い合わせ頻度は増やさない(既存の60秒スロットルのまま)。

---

## A. 理想の体験フロー

訪問者が `/live/` を開くと、いつもの配信カードが並ぶ。ただし各カードの `.stats` 行のすぐ下に、
細い「脈拍レーン」が1本あり、そこに小さな点が右から左へ流れている。点の間隔は配信ごとに違う——
賑わっている配信は点が密で、静かな配信はぽつぽつ。💬 の数字は1秒ごとに1〜数ずつ増え、隣に
「+42/分」と書いてある。60秒経つと実測値が届き、数字がそこへ静かに着地し、次の60秒をまた
滑らかに進む。訪問者は「この配信、いま盛り上がってる」を数字を読まずに点の密度で感じ、カードを
見比べて配信を選べる。個々の発言は一切出ない(本文も、誰が、も)。マウスを名前に乗せたときの
直近発言カード(既存のホバー機能)は従来どおり。ページ下のたぬ姉の吹き出しに「数字が動いて
見えるのは60秒ごとの実測値のあいだを表示上つないでいるから。細かい時刻のデータは取っていない」
と一言ある。動いているのは「実測した速度で刻む脈」であって、発明した値ではない。

## B. 統合アーキ(4コンポーネント・既存ファイルとの配線)

```
/api/live-ranking (既存・変更なし)
   └ 60秒ごと fetch(既存 load() @ live-ranking-entry.js:339)
        └ render(data) (既存 @ :254)
             ├ [1] motion.trackFor(liveId).push(sampleFromLive(l, data.capturedAt), 受信時刻)  ← 新規呼び出し
             ├ innerHTML 組み立て(既存)。💬 の <b> に data-motion="comment"、
             │   <span class="rate" data-rate="comment">、<div class="pulse-lane"> を足す
             └ motion.end() で今回いなかった配信の track を捨てる(tracker.end() と同じ流儀)
   [2] requestAnimationFrame ループ(新規・1本だけ)
        └ 各 [data-motion] の textContent = num(track.valueAt('comment', now))
        └ 各 .pulse-lane に track.ratePerMin('comment') に応じた間隔で .pulse-dot を生む
```

| # | コンポーネント | ファイル | 役割 |
|---|---|---|---|
| 1 | **`liveMotion.js`(純ロジック・新規)** | `src/lib/liveMotion.js` + `src/lib/liveMotion.test.js` | 標本(サンプル)の保持、2点間の線形補間、速度(件/分)、脈の間隔。DOMを触らない。 |
| 2 | **描画の配線(既存ファイルへ追記)** | `src/extension/live-ranking-entry.js` | `render()`で標本をpush、DOMにdata属性を付ける、rAFループ1本。 |
| 3 | **見た目(既存`<style>`へ追記)** | `tsuioku-no-kirameki/live/index.html`の`<style>` | `.pulse-lane` / `.pulse-dot` / `.rate` / reduced-motion。 |
| 4 | **開示文(既存文言へ1文ずつ)** | `tsuioku-no-kirameki/live/index.html`(たぬ姉の吹き出し)・`privacy.html` §14-2 | 「補間である」ことを正直に書く。 |

**新しいAPI・新しいライブラリ・新しいインフラ・新しいエンドポイントは0本。** サーバー側
(`api/live-ranking.js`・`scripts/live-comment-tally.mjs`)は1行も触らない。ビルドは既存の
`scripts/build.mjs`(entryPointsに`live-ranking-entry.js`)がそのまま束ねる。

**既存部品との関係(混ぜない・司令塔の実在確認済み)**
- `createRowChangeTracker`(`liveRankingView.js:403`、`live-ranking-entry.js:36`で`tracker`という
  変数名で使用中)は「順位表の行が増えたか」を見て1回光らせる器。今回の`motion`は「配信の合計値が
  秒単位でどう見えるか」の器。**役割が違うので別モジュール・別変数名**。`rowKey`(`liveRankingView.js:439`)
  も流用しない(キーは`liveId`だけ)。
- `commentCount`は**ニコ生watchページの埋め込みJSONが公開している番組合計**
  (`api/live-ranking.js`の`COMMENT_COUNT_RE`)。当サイトが数えた`comment.comments`
  (`renderCommentCol`が使う、約10分ごとのtally、`live-ranking-entry.js:194-203`)とは別物で、
  今回動かすのは前者(`l.commentCount`、`render()`内`live-ranking-entry.js:283`)だけ。
  tally側(個人別rankers、`commentRows`)は一切触らない(D参照)。
- 時点の解釈は`timeAuthority.js`の`toEpochMs`を通す(`liveRankingView.js:28-30`の祖父条項=
  「時点フィールドを独自にNumber()するファイルを増やさない」)。

## C. 具体機構

### C-1. `src/lib/liveMotion.js`(純ロジック)

```js
import { toEpochMs } from './timeAuthority.js';

/** 補間する系列。MVP は 'comment' だけ使う(他は型として用意・後段で有効化)。 */
export const MOTION_KINDS = /** @type {const} */ (['comment', 'watch', 'gift', 'ad']);
/** この間隔を超えた 2 標本は「補間しない」(古すぎる。速度の材料にはまだ使う)。 */
export const LERP_MAX_GAP_MS = 180_000;
/** この間隔を超えた 2 標本は速度の材料にもしない(15 分。cron 遅延の実測中央値 12 分を包む)。 */
export const RATE_MAX_GAP_MS = 15 * 60_000;
/** 補間の最短所要(標本が異常に近接して届いたときに一瞬で飛ばないように)。 */
export const LERP_MIN_DURATION_MS = 5_000;
/** 脈(点)の間隔の下限・上限。下限を割る速度は「帯」表示に切り替える(点を増やさない)。 */
export const PULSE_MIN_INTERVAL_MS = 250;
export const PULSE_MAX_INTERVAL_MS = 20_000;

/** @typedef {{ at: number, comment: number, watch: number, gift: number, ad: number }} MotionSample */

/**
 * 収集ペイロードの 1 配信 → 標本。at は data.capturedAt(サーバの収集時刻)。
 * ★数字が 0 は「0 件」と「取れなかった(api の numAt は欠測を 0 で返す)」を区別できない。
 *   ここでは値をそのまま持ち、表示側が「latest.comment===0 なら速度を出さない」で扱う。
 * @returns {MotionSample|null} capturedAt が読めなければ null(push しない)
 */
export function sampleFromLive(live, capturedAt) {
  const at = toEpochMs(capturedAt);
  if (!at) return null;
  return {
    at,
    comment: Number(live && live.commentCount) || 0,
    watch: Number(live && live.watchCount) || 0,
    gift: Number(live && live.giftTotal) || 0,
    ad: Number(live && live.adTotal) || 0
  };
}

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

/**
 * 1 配信ぶんの器。「from → to」モデル:
 *   - prev / latest … 実測の標本 2 点(速度の材料)。
 *   - from          … 表示アニメの起点 = 新標本が届いた瞬間に【画面に出ていた値】と受信時刻(受信側の時計)。
 *   - durationMs    … from→latest に掛ける時間 = 実測 2 点の間隔(clamp)。
 *   ★アニメの位相は受信側の時計(receivedAtMs)で測る。capturedAt(サーバ時計)で測ると
 *     時計ずれ・スロットル応答の遅れで最初から t=1 になり、動かない/飛ぶ。
 */
export function createMotionTrack() {
  /** @type {MotionSample|null} */ let prev = null;
  /** @type {MotionSample|null} */ let latest = null;
  /** @type {Record<string, number>} */ let fromValue = {};
  let fromAtMs = 0;
  let durationMs = 0;

  function valueAt(kind, nowMs) {
    if (!latest) return 0;
    const to = latest[kind];
    if (!prev || durationMs <= 0) return to;
    const t = clamp01((nowMs - fromAtMs) / durationMs);
    return Math.round(lerp(fromValue[kind], to, t));
  }

  return {
    /**
     * @param {MotionSample|null} s
     * @param {number} receivedAtMs 受信側の Date.now()
     * @returns {boolean} 新しい標本として採用したか(同じ capturedAt の再送=throttled/inFlight は false)
     */
    push(s, receivedAtMs) {
      if (!s) return false;
      if (latest && s.at <= latest.at) return false;           // ★重複・逆行は捨てる
      const snapshot = {};
      for (const k of MOTION_KINDS) snapshot[k] = valueAt(k, receivedAtMs); // いま画面に出ている値から始める(後ろへ飛ばない)
      prev = latest;
      latest = s;
      const gap = prev ? s.at - prev.at : 0;
      // ★補間は「実測 2 点に挟まれた値」だけ。間隔が長すぎる(古い)ときは補間せず着地(snap)。
      durationMs = prev && gap <= LERP_MAX_GAP_MS ? Math.max(LERP_MIN_DURATION_MS, gap) : 0;
      fromValue = snapshot;
      fromAtMs = receivedAtMs;
      return true;
    },
    valueAt,
    /** 実測 2 点から速度(件/分)。材料が無い/古い/減っている(仕様変更・欠測)なら null。 */
    ratePerMin(kind) {
      if (!prev || !latest) return null;
      const gap = latest.at - prev.at;
      if (gap <= 0 || gap > RATE_MAX_GAP_MS) return null;
      const d = latest[kind] - prev[kind];
      if (d < 0) return null;                                    // ★減った=信じない(AGENTS §3.6)
      return (d / gap) * 60_000;
    },
    latest() { return latest; },
    isSettled(nowMs) { return !prev || durationMs <= 0 || nowMs - fromAtMs >= durationMs; }
  };
}

/**
 * 初回描画用の速度=配信開始からの平均(件/分)。実測 2 点が揃うまでの 60 秒を無音にしないための材料。
 * ★これも実データ(commentCount ÷ 経過分)。beginTime 無し・経過 1 分未満・件数 0 は null。
 */
export function lifetimeCommentRatePerMin(live, nowMs) {
  const begin = Number(live && live.beginTime) || 0;
  const count = Number(live && live.commentCount) || 0;
  if (!begin || count <= 0) return null;
  const min = (nowMs / 1000 - begin) / 60;
  return min >= 1 ? count / min : null;
}

/** 速度 → 点の間隔(ms)。rate<=0/null は null(点を出さない)。 */
export function pulseIntervalMs(ratePerMin) {
  if (ratePerMin == null || !(ratePerMin > 0)) return null;
  const ms = 60_000 / ratePerMin;
  return Math.min(PULSE_MAX_INTERVAL_MS, Math.max(PULSE_MIN_INTERVAL_MS, ms));
}

/** 下限を割る速度(=240 件/分超)は点を増やさず「帯」の濃さで表す。 */
export function pulseIsBand(ratePerMin) {
  return ratePerMin != null && 60_000 / ratePerMin < PULSE_MIN_INTERVAL_MS;
}

/** 「+42/分」。null は「計測中」(嘘の 0 を書かない)。1 未満は小数 1 桁。 */
export function formatRatePerMin(rate) {
  if (rate == null) return '計測中';
  if (rate < 1) return `+${(Math.round(rate * 10) / 10).toFixed(1)}/分`;
  return `+${Math.round(rate).toLocaleString('ja-JP')}/分`;
}

/** 配信ごとの track を持つ台帳。tracker(createRowChangeTracker)と同じ begin/end の流儀で、今回出なかった配信を捨てる。 */
export function createMotionRegistry() {
  /** @type {Map<string, ReturnType<typeof createMotionTrack>>} */ let tracks = new Map();
  /** @type {Set<string>|null} */ let touched = null;
  return {
    begin() { touched = new Set(); },
    trackFor(liveId) {
      const id = String(liveId || '');
      if (touched) touched.add(id);
      let t = tracks.get(id);
      if (!t) { t = createMotionTrack(); tracks.set(id, t); }
      return t;
    },
    end() {
      if (touched) for (const k of Array.from(tracks.keys())) if (!touched.has(k)) tracks.delete(k);
      touched = null;
    },
    size() { return tracks.size; }
  };
}
```

**テスト(`liveMotion.test.js`・vitest)で固定する契約**
1. `push` は同じ `at` の再送を false で捨てる(throttled/inFlight の応答で補間が巻き戻らない)。
2. 2 点目到着直後の `valueAt` は「直前に画面に出ていた値」(後ろへ飛ばない)。`durationMs` 経過後は `latest` にぴたり着地。
3. 補間中の値は常に `min(from,to) ≤ v ≤ max(from,to)`(実測に挟まれた値しか出ない=外挿ゼロ)。
4. gap > 180 秒は `durationMs=0` で即着地、gap ≤ 15 分なら `ratePerMin` は返る、15 分超は null。
5. 減少(`d<0`)は `ratePerMin` null。`lifetimeCommentRatePerMin` は beginTime 無し・1 分未満・0 件で null。
6. `pulseIntervalMs` は 250〜20,000 に clamp。`pulseIsBand` は 240/分超で true。
7. `createMotionRegistry.end()` は今回 touch されなかった配信を捨てる。

### C-2. `live-ranking-entry.js` の配線(追記箇所を名指し)

```js
// import(19 行付近)
import { createMotionRegistry, sampleFromLive, lifetimeCommentRatePerMin, pulseIntervalMs, pulseIsBand, formatRatePerMin } from '../lib/liveMotion.js';
const motion = createMotionRegistry();   // ★tracker(36 行)とは別物。名前も別。

// render() 冒頭(275 行 tracker.begin() の隣)
motion.begin();
const receivedAt = Date.now();

// カード組み立て(map の中・276 行〜): 標本を push してから HTML を作る
const track = motion.trackFor(l.liveId);
track.push(sampleFromLive(l, data.capturedAt), receivedAt);
const shownComment = track.valueAt('comment', receivedAt);   // ★innerHTML 全置換で数字が後ろへ飛ばないよう「いま見えている値」で描く
const rate0 = track.ratePerMin('comment') ?? lifetimeCommentRatePerMin(l, receivedAt);

// .stats の 💬(283 行)を差し替え
+ `<span>💬 コメント <b data-motion="comment" aria-hidden="true">${num(shownComment)}</b>`
+ `<span class="visually-hidden">${num(l.commentCount)}</span>`          // ★AT には実測値だけ読ませる(G-1)
+ `<span class="rate" data-rate="comment" title="直近の実測 2 回の差から求めた速度">${esc(formatRatePerMin(rate0))}</span></span>`

// .stats 閉じタグの直後(292 行)に脈拍レーン
+ (l.commentCount > 0
    ? `<div class="pulse-lane${pulseIsBand(rate0) ? ' is-band' : ''}" data-lane="${esc(l.liveId)}" aria-hidden="true"></div>`
    : '')

// render() 末尾(300 行 tracker.end() の隣)
motion.end();
_motionEls = collectMotionEls();   // 描画のたびに参照を取り直す(innerHTML 全置換で古い参照は死ぬ)
```

**rAF ループ(ファイル末尾に 1 本だけ追加)**

```js
/** @type {{ counters: {el:HTMLElement, id:string}[], rates: {el:HTMLElement, id:string}[], lanes: Map<string,{el:HTMLElement, nextAt:number}> }} */
let _motionEls = { counters: [], rates: [], lanes: new Map() };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const PULSE_JITTER = 0.3;          // 間隔の ±30%(メトロノームに見せない。平均は実測どおり)
const PULSE_DOTS_MAX_PER_LANE = 12;

function collectMotionEls() {
  const counters = []; const rates = []; const lanes = new Map();
  for (const sec of elList.querySelectorAll('section.live')) {
    const lane = sec.querySelector('.pulse-lane');
    const id = lane ? lane.getAttribute('data-lane') : (sec.querySelector('[data-motion]') && ''); // id は lane から
    const b = sec.querySelector('[data-motion="comment"]');
    const r = sec.querySelector('[data-rate="comment"]');
    if (lane) lanes.set(lane.getAttribute('data-lane'), { el: lane, nextAt: performance.now() + 300 });
    if (b && lane) counters.push({ el: b, id: lane.getAttribute('data-lane') });
    if (r && lane) rates.push({ el: r, id: lane.getAttribute('data-lane') });
  }
  return { counters, rates, lanes };
}

function spawnDot(lane) {
  if (lane.childElementCount >= PULSE_DOTS_MAX_PER_LANE) return;
  const d = document.createElement('i');
  d.className = 'pulse-dot';
  d.addEventListener('animationend', () => d.remove(), { once: true });
  lane.appendChild(d);
}

let _lastCounterTick = 0;
function motionFrame(tMs) {
  const now = Date.now();
  // 数字は 1 秒に 1 回だけ書く(毎フレーム書かない・整数が変わらないなら触らない)。
  if (tMs - _lastCounterTick >= 1000) {
    _lastCounterTick = tMs;
    for (const { el, id } of _motionEls.counters) {
      const tr = motion.trackFor(id);
      const v = num(REDUCED.matches ? (tr.latest()?.comment ?? 0) : tr.valueAt('comment', now));
      if (el.textContent !== v) el.textContent = v;
    }
  }
  if (!REDUCED.matches && !document.hidden) {
    for (const [id, lane] of _motionEls.lanes) {
      const tr = motion.trackFor(id);
      const rate = tr.ratePerMin('comment');
      const iv = pulseIntervalMs(rate);
      if (iv == null || pulseIsBand(rate)) continue;                       // 帯は CSS だけで表す
      if (tMs >= lane.nextAt) {
        spawnDot(lane.el);
        lane.nextAt = tMs + iv * (1 + (Math.random() * 2 - 1) * PULSE_JITTER);
      }
    }
  }
  requestAnimationFrame(motionFrame);
}
requestAnimationFrame(motionFrame);
// ★裏タブから戻った直後に溜まった脈を一斉に吐かない(nextAt を今へ寄せる)。
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const t = performance.now();
  for (const lane of _motionEls.lanes.values()) lane.nextAt = Math.max(lane.nextAt, t + 200);
});
```

注: `motion.trackFor(id)` を rAF 内で呼ぶと `touched` が null のとき(render 外)は Set に足さないので
安全(`begin()` 後だけ記録する実装にしてある)。初回描画(標本1点)では `ratePerMin` が null なので、
`rates` の初期文言は `lifetimeCommentRatePerMin` で描いた「+N/分」のまま残り、脈は出ない。**初回から
脈も出したい場合**は `iv == null` のとき `pulseIntervalMs(lifetimeCommentRatePerMin(liveFor(id), now))`
へ倒す(ペイロードの`l`を`motion`台帳に添えて持つ1行を足す)。MVPでは「初回60秒は数字と速度だけ・
2点目から脈」で十分(実測の速度が出るまで無理に動かさない)。

### C-3. CSS(`live/index.html` の `<style>` 内・「動いている感じ」ブロックの近くに追記)

```css
/* ── 脈拍レーン(コメントの実測速度で点が流れる。本文・人物は出さない) ── */
.stats .rate { font-size: .74rem; color: var(--orange); font-weight: 700; margin-left: 4px; font-variant-numeric: tabular-nums; }
.pulse-lane { position: relative; height: 10px; overflow: hidden; background: linear-gradient(90deg, transparent, #fff7ec 20%, #fff7ec 80%, transparent); border-bottom: 1px solid var(--line); }
.pulse-dot { position: absolute; top: 3px; right: -6px; width: 5px; height: 5px; border-radius: 50%; background: var(--orange); opacity: .85;
  animation: nl-pulse-flow 4s linear forwards; will-change: transform; }
@keyframes nl-pulse-flow { to { transform: translateX(calc(-100vw - 12px)); opacity: .15; } }
/* 240 件/分超: 点を増やさず帯の濃さで(点の数=負荷を天井で止める) */
.pulse-lane.is-band { background: repeating-linear-gradient(90deg, rgba(200,114,28,.35) 0 6px, transparent 6px 14px); background-size: 200% 100%; animation: nl-band 1.2s linear infinite; }
@keyframes nl-band { to { background-position: -28px 0; } }
@media (prefers-reduced-motion: reduce) { .pulse-lane { display: none; } }
```

`.pulse-lane { contain: layout paint; }` は可(高さ固定10pxのため)。**`contain: size` と
`content-visibility` は使わない**(MEMORY: 可変サイズで崩れた実績2回)。

### C-4. データフロー(文で)

1. `load()` が `/api/live-ranking(?refresh=1)` を 60 秒ごとに取る(既存・頻度不変)。
2. `render(data)` が配信ごとに `sampleFromLive(l, data.capturedAt)` を `push`。**同じ capturedAt の再送
   (throttled/inFlight)は捨てる**ので、実際に新しい収集が来たときだけ補間が始まる。
3. 補間は「新標本が届いた瞬間に画面に出ていた値」から「新標本の実測値」へ、**実測2点の間隔と同じ
   時間**を掛けて進む。次の標本が来る頃に前の標本へちょうど着地する=表示は常に「1収集ぶん遅れ・
   実測に挟まれた値」。
4. 速度(件/分)は実測2点の差÷間隔。脈の間隔はその逆数(±30%揺らし)。速度が出る前(初回)は
   配信開始からの平均を使う。
5. `motion.end()` で消えた配信の器を捨てる(開きっぱなしのタブで台帳が青天井に増えない)。

## D. 最重要の未決着論点への裁定

**裁定: (b)。会議の保守的結論(件数もリアルタイム表示しない)は採用しない。番組合計のコメント
件数を60秒間隔の実測値の間で補間して見せることは可。ただし下の3条件を機械と文言で守る。**

### D-1. 3つの観点を分けて整理する

| 観点 | 対象になり得るもの | 番組合計の件数(今回動かすもの) | 判定 |
|---|---|---|---|
| **著作権** | 創作的「表現」(著作権法2条1項1号)。コメント本文はこれに当たり得る | 件数は表現ではなく事実の計数。個々の投稿の複製・翻案を含まない。データベースの著作物(12条の2)も「体系的構成の創作性」が要件で、単一の合計値は該当しない | **リスクは本文と同列にならない**。「件数=UGCの二次利用」は表現と事実を混同している |
| **プライバシー/個人情報** | 特定個人の行動が推知できる表示 | 番組合計は誰が投稿したかを含まない。**個人別の件数(tallyのrankers)**は「何時何分に投稿した」を推知させる粒度になり得る | **合計は問題なし。個人別を秒刻みで動かすことは禁止**(D-3②) |
| **利用規約/負荷** | 自動取得の頻度・再配布 | 取得頻度は60秒のまま(不変)。表示の見せ方を変えるだけで、ニコ生への問い合わせは1本も増えない | **今回の変更で新たに増えるリスクはゼロ**。既存の`/live/`と同じ地平 |

批判役の懸念のうち**正しい部分**は「投稿者の行動と直接結びつく」=個人単位の時刻推知。これは
合計値には当たらず、個人別値にだけ当たる。統合役はこの区別をせずに合計値まで巻き込んだ。

### D-2. 現行実装との整合(「そもそも今の実装」への話か)

会議の指摘を額面どおり採用すると、**今回の演出より先に既存機能が引っかかる**:
- `live-ranking-entry.js:283`は既に`l.commentCount`(ニコ生公開の番組合計)を60秒間隔で表示している。
- 同`:415-550`のホバーカードは**本文そのもの**(最大5件・80字)を取得・表示している
  (`privacy.html` §14で開示済み)。
- ギフトpt・広告pt・来場者数も同じ60秒間隔で表示している。

つまり会議の結論は「本文を出すホバーは残し、本文を出さない合計件数の補間だけ止める」という
**内部矛盾**になる。件数を止める根拠が成り立つなら`/live/`自体の見直しが必要になり、成り立たないなら
演出も止める理由がない。司令塔の裏取りどおり「合計件数の計数に著作物性がある」一次情報は確認
できていない(★ニコニコ利用規約に「件数の再表示」を明示的に許諾/禁止する条項があるかは**未確認**。
ただしそれは今回の演出に固有の論点ではなく既存の数字表示全体に共通する)。よって**演出を新たに
派手にすることへの追加リスクは無い**と判定する。

### D-3. 守る3条件(設計へ機械的に落とす)

1. **補間・外挿の別を守る**: 表示する数は必ず実測2点に挟まれた値(`liveMotion.test.js`の契約3が
   固定)。外挿(次の値の予測)・スプリングの行き過ぎは禁止(F参照)。
2. **個人単位の秒刻み演出は一切しない**: 動かすのは`commentCount`(番組合計)だけ。tallyの
   `rankers[].count`・`commenters`・匿名ラベルは10分ごとの静的表示のまま(既存どおり)。脈の点は
   無名で、誰の投稿かを示す属性(uid/名前/ラベル)を持たない。
   ★対象は補間・演出で発明する時刻。実測差分の表示(giftの+pt等、
   [`live-gift-pulse-DESIGN.md`](live-gift-pulse-DESIGN.md)参照)や既存のオンデマンド
   本文表示(ホバー)は本条の対象外(2026-09-27・council-fable2回目のFable裁定D-3で追記)。
3. **補間であることを開示する**: `live/index.html`たぬ姉の吹き出しに「数字が秒単位で動いて
   見えるのは、60秒ごとの実測値のあいだを表示上なめらかにつないでいるから。細かい時刻のデータは
   取得も保存もしていないわ」を1文追加。`privacy.html` §14-2に同趣旨を1文追加。`.rate`の`title`に
   「直近の実測2回の差から求めた速度」。掲載停止窓口は既存の§14-4がそのまま効く。

本設計書は法的助言ではない。上の整理は「表現/事実」「合計/個人別」「頻度不変」の3軸で残存
リスクを既存実装と同じ地平に留めるための判断であり、確実性を主張しない。

## E. MVP(1つだけ作るなら)

**カードごとの「💬脈拍レーン+補間カウンタ+速度(+N/分)」。系列はコメント1本だけ。**

理由: (1) ユーザーの言葉が「コメントが動いてる感」で、来場者・ギフトではない。(2) 速度と脈は
**カードの比較**に効く(賑わい順の並びに「なぜこの順か」の手触りが付く)——前回の失敗「大きく
見せただけ」と違い、60秒ごとの静止画では得られない情報(速度)が新たに画面に乗る。(3) 純ロジック
1ファイル+配線約60行+CSS15行で収まり、`api/`は無変更。来場者・ギフト・広告の補間は
`MOTION_KINDS`に型だけ置いて第2段へ(ギフト/広告は60秒で0変化がほとんどで、補間しても
動かない=作っても効かない)。

## F. 捨てた案と理由

| 案 | 却下理由 |
|---|---|
| **秒単位の物理スプリング補間**(減衰振動で数字を追従) | 行き過ぎ(overshoot)で実測に無い値を一瞬でも表示する=外挿と同じ嘘。カウンタは単調増加なので振動そのものが不自然。線形で十分。 |
| **外挿(dead reckoning)**: 最新実測から速度で先へ進める | 表示中の値が次の実測を超え得る→到着時に**数字が減る**。減らないよう速度を85%に丸めるのは「値の発明」。実測に挟まれた補間(1収集ぶん遅れ)を採る。 |
| **派手なパーティクル/紙吹雪** | MEMORY「演出の派手さは価値の序列を守る」——花火に相当する派手さはギフト(金額)のもの。コメントに付けると序列が壊れる。点1個・4秒・compositorだけのtransformに留める。 |
| **ページ上部固定の「バイタルサインバー」**(会議のMVP候補) | 20配信の合計は訪問者にとって抽象で、配信を選ぶ行動に繋がらない。前回の却下理由「既存データを大きく見せただけ」と同型。単位は配信カード。 |
| **匿名NNNラベルが流れる演出**(会議の収束案の一部) | 個人単位の投稿タイミングを**でっち上げる**=批判役の正当な懸念そのもの(D-3②)。しかも10分ごとのtallyしか無いので秒刻みの根拠が無い。 |
| **伏せ字の吹き出し(■■■■)を流す** | 「検閲された本文」に見える=実在の発言を隠しているという誤解を招く。本文が無いなら本文の形をしたものを出さない。 |
| **ポーリングを15〜30秒へ短縮** | 確定制約(BAN回避・60秒不変)。演出で頻度の不足を補うのが本設計の目的。 |
| **SSE/WebSocketの中継・Cloudflare Workers** | 確定制約(新インフラ禁止・Vercel実行時間)。 |
| **Web Workerで補間計算** | 20配信の線形補間は1秒1回で足りる。分離のコストの方が高い。 |
| **tallyの個人別件数(10分)を補間して動かす** | 10分間隔は補間に長すぎる(`LERP_MAX_GAP_MS`を超える)うえ、D-3②に反する。 |
| **来場者・ギフト・広告も初回から補間** | ギフト/広告は60秒で変化しないことが多く動かない。来場者は`.now`(推定同時視聴)の式と二重に「推定」が重なる。第2段で来場者だけ検討。 |

## G. 地雷と回避策

1. **`main#list`は`aria-live="polite"`。カウンタを毎秒書き換えると読み上げが洪水になる。**
   動く`<b data-motion>`と`.pulse-lane`に`aria-hidden="true"`、隣に`.visually-hidden`で実測値だけを
   置く(C-2のとおり)。これを忘れるとa11y事故。
2. **throttled/inFlight応答は同じ`capturedAt`を返す**(`api/live-ranking.js`)。`push`で
   `s.at <= latest.at`を捨てないと60秒ごとに補間が巻き戻り「数字が止まる/飛ぶ」。契約1で固定。
3. **アニメの位相をサーバー時計(capturedAt)で測らない。** クライアントは収集から最大60秒遅れて
   標本を受け取る(タイマーの位相ずれ)。`receivedAtMs`で測る。`capturedAt`の解釈自体は
   `toEpochMs`(timeAuthority)経由——`npm run verify:cc`のtimeAuthority系ゲートが新ファイルの
   独自`Number(capturedAt)`を赤くする可能性があるため、必ずimportする。
4. **`render()`はinnerHTML全置換(60秒ごと)。** 古い要素参照・進行中の点は消える。`_motionEls`を
   `render()`末尾で取り直す。点が消えるのは4秒の一過性なので許容。数字は`valueAt(receivedAt)`で
   描き直すので後ろへ飛ばない。
5. **初回訪問の2標本は間隔が長いことがある**(保存済みGET→直後のrefresh:1で新収集。保存済みが
   8分前ならgap=8分)。`LERP_MAX_GAP_MS`(3分)超は補間せず着地、`RATE_MAX_GAP_MS`(15分)以内なら
   速度の材料にはする。この2段しきい値を1本にしない。
6. **`commentCount`の0は「0件」と「欠測(numAtが0を返す)」を区別できない**
   (`api/live-ranking.js`)。`l.commentCount > 0`のときだけレーンを描き、速度はnull→「計測中」。
   「+0/分 静か」と断定しない(AGENTS §3.6「無い」と「0」を混同しない)。
7. **裏タブ→復帰で脈が一斉噴出する。** rAFは裏で止まり`nextAt`が過去になる。`visibilitychange`で
   `nextAt`を今へ寄せる(C-2)。補間は時間基準なので復帰時に正しい位置へsnapするだけ(問題なし)。
   MEMORY「裏タブのsetTimeoutは1/分にクランプ」の系——脈の時計はsetTimeoutではなくrAFの`tMs`を使う。
8. **高速度で点が増殖する。** 240件/分超は`is-band`(CSSだけ)へ切り替え、レーンあたり12個の天井。
   20配信×12=240要素が上限。`animationend`で確実にremove(`{ once: true }`)。
9. **`prefers-reduced-motion`**: レーン非表示・補間せず実測値を即表示・速度テキストは残す(情報は
   削らない)。既存の同ページのreduced-motionブロックと並べて書く。
10. **`contain: size` / `content-visibility: auto`を使わない**(MEMORY: 可変サイズで2回撤去)。
    `.pulse-lane`は高さ固定10pxなので`contain: layout paint`までなら可。
11. **`.stats`には既に`font-variant-numeric: tabular-nums`がある**ので桁変化で幅が揺れない。
    `.rate`にも同じ指定を付ける(付け忘れると「+9/分→+10/分」で隣が動く)。
12. **verify:ccの4つの罠**: 新ファイル`src/lib/liveMotion.js`は`git add`を明示列挙(`??`取りこぼし
    事故)。`scripts/repo-tree-map.mjs`の`FEATURES`に1行(担当: `src/lib/liveMotion.js`,
    `src/extension/live-ranking-entry.js`, `tsuioku-no-kirameki/live/index.html`)→
    `npm run tree-map`(`git add`の**後**)。`npm run feature-map`再生成。bump3点セット
    (manifest/package/changelog・summary35字以内、例「/live/ コメント速度の脈拍レーン」)。
    `npm run impact-check`は`liveRankingView.js`を触らないので波及なし。
13. **`live-ranking-entry.js`がmax-linesラチェットに近いかを先に測る**(popup-entry.jsは張り付いて
    いる実績)。ロジックは全部`liveMotion.js`側に置き、entryへの追記を約60行に抑える設計にしてある。
    超えるならホバーカード部を`liveRecentHover.js`へ切り出す方を先にやる(ついで修正はしない・
    別バンプ)。
14. **SEO**: 初期HTMLは静的のまま、動くのはJSのtextContentとCSS transformのみ。
    `meta description`/`og:*`/`canonical`は触らない。`npm run site-health`は文言追加だけなので
    影響なし。Googlebotは JS実行後のDOMを見るが、数字の1〜数件の差は評価に関係しない。開示文を
    足す`privacy.html`は`site-health:check`の対象なのでリンクを壊さない。
15. **「動いて見える」を「リアルタイム」と書かない。** 既存バッジ「⚡ リアルタイム取得」は取得の話で
    残してよいが、レーンの説明・OG・シェア文に「秒単位」「リアルタイム表示」の語を**足さない**
    (`liveShareText`は数値を入れない方針で既に一致)。開示はD-3③の文言どおり「実測値のあいだを
    表示上つないでいる」。
