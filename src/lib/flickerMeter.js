/**
 * 【層】L0 判定層(純粋関数・DOM/chrome.* には触れない。変化の記録は呼び出し側が渡す)
 * 【この箱に入るもの】画面のどの場所が「ちらついて」いるかを数える台帳と、状態速報の1行
 * 【この箱に入らないもの】MutationObserver・storage への書き込み(flickerMeterBoot.js)・描画
 * 【書けるstorageキー】なし
 * 【正本宣言】ちらつきの数え方と文言はこのファイルのみ
 *
 * flickerMeter.js — v0.1.1686「ちらつき計」
 *
 * ■ なぜ要るか(2026-10-19 ユーザー「ちらつきが別の場所なら…裏どりして確認できる計器をいれてほしい」)
 *   「ここがちらちらしてます」と言われても、スクリーンショットが無いと場所が分からない。推測で直す前に、
 *   実機の画面が【どの場所を・何回・どう書き換えているか】を数えて状態速報に出す。
 *
 * ■ 「ちらつき」の定義(数える物)
 *   - 往復(flipflop): 同じ要素の同じ属性/文字が A→B→A と【短時間で行って戻る】=見ていて明滅する動き。いちばん強い証拠。
 *   - 同値の書き直し(same): 値が変わらないのに属性を書いた(画像なら再読み込みを起こしうる)。
 *   - 変更(attr/text): 実際に値が変わった回数。
 *   - 作り直し(add/rem): 子の要素を足した/消した数(タイルの総入れ替えなど)。
 *   場所(領域)の名前は、近い祖先の id か nl- で始まる class(例: #liveStatComments / .nl-story-growth-icon)。
 *
 * ■ 守ること
 *   - 台帳は軽く: 領域は最大 MAX_REGIONS、要素ごとの履歴は WeakMap。数えるだけで DOM は触らない。
 *   - 事実の数値だけを出す。「これが原因」とは断定しない。
 * @module flickerMeter
 */

export const FLICKER_METER_STORAGE_KEY = 'nls_flicker_meter_sidepanel_v1';
/** A→B→A を「往復」とみなす時間幅[ms]。 */
export const FLICKER_FLIP_WINDOW_MS = 3000;
/** 台帳に載せる領域の最大数(超えたら新しい領域は『その他』にまとめる)。 */
export const FLICKER_MAX_REGIONS = 400;
/** 「開いた直後」として凍結する窓[ms]。 */
export const FLICKER_OPEN_WINDOW_MS = 15000;

/**
 * @typedef {{ mut: number, same: number, flips: number, add: number, rem: number, text: number, src: number, cls: number, style: number }} RegionStat
 * @typedef {{ kind: 'attr'|'text'|'childList', region: string, el?: object, name?: string, oldValue?: string|null, newValue?: string|null, added?: number, removed?: number }} FlickerEvent
 */

/** @returns {RegionStat} */
const emptyStat = () => ({ mut: 0, same: 0, flips: 0, add: 0, rem: 0, text: 0, src: 0, cls: 0, style: 0 });

/**
 * @param {{ now?: () => number }} [deps]
 */
export function createFlickerMeter(deps = {}) {
  const now = deps.now || (() => Date.now());
  const startedAt = now();
  /** @type {Map<string, RegionStat>} */
  let regions = new Map();
  /** @type {Map<string, RegionStat> | null} 開いて OPEN_WINDOW_MS の時点で凍結した写し */
  let openFrozen = null;
  /** @type {WeakMap<object, Record<string, { vals: string[], at: number[] }>>} */
  const history = new WeakMap();
  let dirty = false;
  let selfMs = 0;
  let events = 0;

  /** @param {string} key */
  const stat = (key) => {
    let s = regions.get(key);
    if (s) return s;
    if (regions.size >= FLICKER_MAX_REGIONS) key = '(その他)';
    s = regions.get(key);
    if (!s) {
      s = emptyStat();
      regions.set(key, s);
    }
    return s;
  };

  /** 同じ要素・同じ名前の値の履歴に今回の値を足し、A→B→A(往復)かを返す。 */
  const noteValue = (/** @type {object} */ el, /** @type {string} */ name, /** @type {string} */ v, /** @type {number} */ t) => {
    let h = history.get(el);
    if (!h) {
      h = {};
      history.set(el, h);
    }
    const e = h[name] || (h[name] = { vals: [], at: [] });
    const n = e.vals.length;
    const flip = n >= 2 && e.vals[n - 1] !== v && e.vals[n - 2] === v && t - e.at[n - 2] <= FLICKER_FLIP_WINDOW_MS;
    if (n === 0 || e.vals[n - 1] !== v) {
      e.vals.push(v);
      e.at.push(t);
      if (e.vals.length > 3) {
        e.vals.shift();
        e.at.shift();
      }
    }
    return flip;
  };

  return {
    /** @param {FlickerEvent} ev @param {number} [cost] この記録に自分が使った時間[ms] */
    record(ev, cost = 0) {
      const t = now();
      if (!openFrozen && t - startedAt >= FLICKER_OPEN_WINDOW_MS) openFrozen = cloneRegions(regions);
      const s = stat(ev.region || '(不明)');
      dirty = true;
      events += 1;
      selfMs += cost;
      if (ev.kind === 'childList') {
        s.add += ev.added || 0;
        s.rem += ev.removed || 0;
        s.mut += (ev.added || 0) + (ev.removed || 0);
        return;
      }
      const name = ev.kind === 'text' ? '#text' : String(ev.name || '');
      const prev = ev.oldValue == null ? '' : String(ev.oldValue);
      const cur = ev.newValue == null ? '' : String(ev.newValue);
      s.mut += 1;
      if (ev.kind === 'text') s.text += 1;
      else if (name === 'src' || name === 'srcset') s.src += 1;
      else if (name === 'class') s.cls += 1;
      else if (name === 'style') s.style += 1;
      if (prev === cur) {
        s.same += 1;
        return;
      }
      if (ev.el && noteValue(ev.el, name, cur, t)) s.flips += 1;
      else if (ev.el) {
        // 最初の値(oldValue)も履歴に入れておく: A→B の B を記録した時点で A が履歴に無いと、次の A への戻りを往復と数えられない
        const h = history.get(ev.el)?.[name];
        if (h && h.vals.length === 1 && prev) {
          h.vals.unshift(prev);
          h.at.unshift(t);
        }
      }
    },
    /** 状態が変わったか(書き込みの要否)。読むと false に戻る。 */
    takeDirty() {
      const d = dirty;
      dirty = false;
      return d;
    },
    /** 計器自身が使った時間[ms]を足す(MutationObserver のコールバック全体の時間を呼び手が渡す)。 */
    addSelfMs(/** @type {number} */ ms) {
      selfMs += ms;
    },
    snapshot() {
      const t = now();
      return {
        at: t,
        sinceMs: t - startedAt,
        events,
        selfMs: Math.round(selfMs),
        regions: toPlain(regions),
        open: openFrozen ? toPlain(openFrozen) : null
      };
    },
    reset() {
      regions = new Map();
      openFrozen = null;
      dirty = false;
      selfMs = 0;
      events = 0;
    }
  };
}

/** @param {Map<string, RegionStat>} m */
function cloneRegions(m) {
  /** @type {Map<string, RegionStat>} */
  const out = new Map();
  for (const [k, v] of m) out.set(k, { ...v });
  return out;
}

/** @param {Map<string, RegionStat>} m */
function toPlain(m) {
  /** @type {Record<string, RegionStat>} */
  const o = {};
  for (const [k, v] of m) o[k] = { ...v };
  return o;
}

/** 並べ替えの点数: 往復を最重視(明滅の直接の証拠)・次に同値の書き直し・変更・作り直し。 */
const score = (/** @type {RegionStat} */ s) => s.flips * 20 + s.same * 3 + s.mut + (s.add + s.rem) * 0.2;

/**
 * 状態速報の1行。記録が無ければ ''。数字だけを出し、原因は断定しない。
 * @param {{ at?: number, sinceMs?: number, events?: number, selfMs?: number, regions?: Record<string, any>, open?: Record<string, any>|null } | null | undefined} snap
 * @param {number} nowMs
 * @param {{ top?: number }} [opts]
 * @returns {string}
 */
export function formatFlickerLine(snap, nowMs, opts = {}) {
  if (!snap || typeof snap !== 'object' || !snap.regions || typeof snap.regions !== 'object') return '';
  const top = opts.top ?? 5;
  /** @param {Record<string, any>} regions */
  const rank = (regions) =>
    Object.entries(regions)
      .map(([k, v]) => /** @type {[string, RegionStat]} */ ([k, { ...emptyStat(), ...v }]))
      .filter(([, v]) => v.mut > 0)
      .sort((a, b) => score(b[1]) - score(a[1]))
      .slice(0, top);
  /** @param {[string, RegionStat][]} rows */
  const fmt = (rows) =>
    rows.length
      ? rows
          .map(([k, v]) => `${k} 往復${v.flips}・同値書き直し${v.same}・変更${v.mut - v.same}(src${v.src}/class${v.cls}/style${v.style}/文字${v.text})${v.add + v.rem > 0 ? `・作り直し${v.add}+${v.rem}` : ''}`)
          .join(' ｜ ')
      : 'なし';
  const sec = Math.max(0, Math.round((Number(snap.sinceMs) || 0) / 1000));
  const age = typeof snap.at === 'number' ? `${Math.max(0, Math.round((nowMs - snap.at) / 1000))}秒前の記録` : '時刻不明';
  const totalFlips = Object.values(snap.regions).reduce((n, v) => n + (Number(v && v.flips) || 0), 0);
  const parts = [`ちらつき計(開いて${sec}秒・${age}・往復の合計${totalFlips}・計器自身${Number(snap.selfMs) || 0}ms)`];
  if (snap.open) parts.push(`開いた直後15秒の上位: ${fmt(rank(snap.open))}`);
  parts.push(`全体の上位: ${fmt(rank(snap.regions))}`);
  return parts.join(' / ');
}
