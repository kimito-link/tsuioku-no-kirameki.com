/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】拡張の各文書が「自分がメインスレッドをどれだけ使ったか」を数える台帳と、
 *                     Service Worker が文書の報告を束ねる関数と、状態速報の文言
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし(書き込みは ext-census-sw.js)
 * 【正本宣言】文書別の忙しさの集計と犯人判定の文言はこのファイルのみ
 *
 * extDocBusyCensus.js — 拡張プロセスの忙しさを「文書ごと」に名指しする。
 *
 * ■ なぜ要るか(2026-10-08 実機・設計 docs/handoff/ext-process-busy-census-DESIGN.md)
 *   拡張の全ページ(popup・サイドパネルの iframe・status・会場・コメビュ…)は 1 つのレンダラープロセス=
 *   1 本のメインスレッドを共有する。実機で CPU131%・最大2秒停止・popup 真っ黒・status 重いが出たが、
 *   既存の計器は ★「(拡張の外)」としか言えず ★速報の処理時間は【最後に書いた popup 1本の値(後勝ち)】だった。
 *
 * ■ 測り方(実測で確かめた性質を使う)
 *   - longtask(PerformanceObserver)は【実行した当人の文書にだけ】届く(別文書の重い処理は届かない)。
 *     ＝ 自分の longtask 合計が大きい文書=犯人 / 自分の遅れ(ハートビートのずれ)だけ大きい文書=被害者。
 *   - ラベルで囲む方式(markBlockerSection)と違い、囲み忘れ・非同期の続き(await 再開)も含めて機械的に測れる。
 *   - 50ms 未満の細かい処理は longtask に出ない → 「自分の長い処理が小さいのに遅れは大きい」は断言を止める。
 *
 * @module extDocBusyCensus
 */

import { normalizeStorageKeyForCensus } from './storageRefreshTriggerKey.js';

/** 1文書の要約(JSON)の上限バイト。診断で storage を太らせない。 */
export const EXT_CENSUS_REPORT_MAX_BYTES = 400;
/** 無音がこれを超えた文書は台帳から落とす[ms]。 */
export const EXT_CENSUS_STALE_MS = 180_000;
/** 台帳に載せる文書の最大数(書き込みサイズの上限=約4KB)。 */
export const EXT_CENSUS_MAX_DOCS = 10;
/** 起動回数を数える窓[ms]。 */
export const EXT_CENSUS_BOOT_WINDOW_MS = 600_000;
/** onChanged の1回ぶんのバイトを測る間隔(族ごと)[ms]。毎イベント stringify すると計器が負荷になる。 */
export const EXT_CENSUS_BYTES_SAMPLE_MS = 30_000;
/** 犯人候補とする「長い処理が稼働に占める割合」[%]。 */
export const EXT_CENSUS_CULPRIT_PCT = 10;
/** 起動直後はこの秒数より前は犯人判定に使わない(起動コストを犯人にしない)。 */
export const EXT_CENSUS_BOOT_SETTLE_SEC = 30;
/** 要約に載せる onChanged の族の上限。 */
const OC_TOP = 3;
/** 台帳に保持する onChanged の族の上限(メモリ)。 */
const OC_MAX_FAMILIES = 24;

/** @param {unknown} v @returns {number|null} */
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 文書の種類。popup は起動モード(URL クエリ)で分ける(同時に複数種類が居る)。
 * @param {string} pathname
 * @param {string} search
 * @returns {string}
 */
export function detectExtSurface(pathname, search) {
  const file = String(pathname || '').split('/').pop() || '';
  const base = file.replace(/\.html?$/i, '');
  if (base === 'popup') {
    const q = new URLSearchParams(String(search || ''));
    if (q.get('dock') === 'sidepanel') return 'popup-sidepanel';
    if (q.get('dock') === 'status') return 'popup-status';
    if (q.get('toolbar') === '1') return 'popup-toolbar';
    if (q.get('inline') === '1') return 'popup-watch';
    return 'popup-tab';
  }
  return base || 'unknown';
}

/**
 * @typedef {object} DocCensus
 * @property {string} i instanceId(起動ごとの乱数。後勝ちで潰さないための識別)
 * @property {string} s surface(文書の種類)
 * @property {number} b 起動時刻[ms]
 * @property {{ n: number, ms: number, max: number }} lt 自分が実行した長い処理(longtask)
 * @property {{ n: number, ms: number, max: number }} lo 同じタブの【他の文書】(親/子 iframe)が実行した長い処理。自分の lt に混ぜない
 * @property {{ ms: number, max: number, n: number }} lg 自分が受けた遅れ(ハートビートのずれ・可視中のみ)
 * @property {Record<string, { n: number, lastBytes: number, at: number }>} oc onChanged の族別
 * @property {{ used: number, limit: number }|null} hp ヒープ(最大)
 */

/**
 * @param {{ surface: string, nowMs: number, instanceId: string }} opts
 * @returns {DocCensus}
 */
export function createDocCensus(opts) {
  return {
    i: String(opts.instanceId || ''),
    s: String(opts.surface || 'unknown'),
    b: num(opts.nowMs) ?? 0,
    lt: { n: 0, ms: 0, max: 0 },
    lo: { n: 0, ms: 0, max: 0 },
    lg: { ms: 0, max: 0, n: 0 },
    oc: Object.create(null),
    hp: null
  };
}

/**
 * 長い処理(longtask)を足す。
 *   ★同じタブの文書(親と子 iframe)は同じ longtask を全員が受け取る(実測 2026-10-08)。実行元は
 *   containerType で分かる: top 文書は window=自分 / iframe=子が実行。iframe 文書は iframe=自分か兄弟 / window=親が実行。
 *   自分でないほうは other=true で別枠(lo)に積み、自分の lt(犯人判定)に混ぜない。
 * @param {DocCensus} c
 * @param {unknown} durMs
 * @param {boolean} [other] 同じタブの他の文書が実行したもの
 */
export function noteLongTask(c, durMs, other = false) {
  const d = num(durMs);
  if (d === null || d < 0) return;
  const slot = other ? c.lo : c.lt;
  slot.n += 1;
  slot.ms += d;
  if (d > slot.max) slot.max = d;
}

/**
 * 自分が受けた遅れ(ハートビートのずれ)を足す。呼ぶ側は【可視中のみ】呼ぶこと
 * (裏タブのタイマー間引きは忙しさではない)。
 * @param {DocCensus} c
 * @param {unknown} lagMs
 */
export function noteLag(c, lagMs) {
  const d = num(lagMs);
  if (d === null || d <= 0) return;
  c.lg.n += 1;
  c.lg.ms += d;
  if (d > c.lg.max) c.lg.max = d;
}

/**
 * storage.onChanged を1キーぶん数える。バイトは族ごとに BYTES_SAMPLE_MS に1回だけ測る。
 * @param {DocCensus} c
 * @param {string} key
 * @param {{ nowMs: number, bytesOf?: () => number|null }} opts
 */
export function noteOnChanged(c, key, opts) {
  const fam = normalizeStorageKeyForCensus(key);
  if (!fam) return;
  let slot = c.oc[fam];
  if (!slot) {
    if (Object.keys(c.oc).length >= OC_MAX_FAMILIES) return;
    slot = c.oc[fam] = { n: 0, lastBytes: 0, at: -Infinity };
  }
  slot.n += 1;
  const now = num(opts.nowMs) ?? 0;
  if (typeof opts.bytesOf === 'function' && now - slot.at >= EXT_CENSUS_BYTES_SAMPLE_MS) {
    slot.at = now;
    try {
      const b = num(opts.bytesOf());
      if (b !== null && b >= 0) slot.lastBytes = b;
    } catch {
      /* 計器の失敗で本処理を壊さない */
    }
  }
}

/**
 * ヒープ(最大値を保持)。拡張プロセス全体の値(同じプロセスの文書は同じ数字になる)。
 * @param {DocCensus} c
 * @param {unknown} usedBytes
 * @param {unknown} limitBytes
 */
export function noteHeap(c, usedBytes, limitBytes) {
  const u = num(usedBytes);
  const l = num(limitBytes);
  if (u === null || l === null || l <= 0) return;
  if (!c.hp || u > c.hp.used) c.hp = { used: u, limit: l };
}

/**
 * @typedef {object} DocReport
 * @property {string} i
 * @property {string} s
 * @property {number} a 稼働秒
 * @property {[number, number, number]} lt [回数, 合計ms, 最大ms]
 * @property {[number, number, number]} [lo] 同じタブの他の文書が実行した長い処理 [回数, 合計ms, 最大ms]
 * @property {[number, number, number]} lg [合計ms, 最大ms, 回数]
 * @property {Array<[string, number, number]>} oc 上位3族 [族, 回数, 推定KB]
 * @property {[number, number]|null} hp [使用MB, 上限MB]
 */

/**
 * 1文書の要約(JSON ≤ EXT_CENSUS_REPORT_MAX_BYTES)。
 * @param {DocCensus} c
 * @param {number} nowMs
 * @returns {DocReport}
 */
export function summarizeDocCensus(c, nowMs) {
  const oc = Object.entries(c.oc)
    .map(([fam, s]) => /** @type {[string, number, number]} */ ([fam, s.n, Math.round((s.n * s.lastBytes) / 1024)]))
    .sort((x, y) => y[2] - x[2] || y[1] - x[1])
    .slice(0, OC_TOP);
  return {
    i: c.i,
    s: c.s,
    a: Math.max(0, Math.round(((num(nowMs) ?? 0) - c.b) / 1000)),
    lt: [c.lt.n, Math.round(c.lt.ms), Math.round(c.lt.max)],
    lo: [c.lo.n, Math.round(c.lo.ms), Math.round(c.lo.max)],
    lg: [Math.round(c.lg.ms), Math.round(c.lg.max), c.lg.n],
    oc,
    hp: c.hp ? [Math.round(c.hp.used / 1048576), Math.round(c.hp.limit / 1048576)] : null
  };
}

/**
 * @typedef {DocReport & { seenAt: number, firstSeenAt: number }} CensusDoc
 * @typedef {{ at: number, docs: CensusDoc[], bl: Record<string, number[]> }} CensusRecord
 */

/**
 * 台帳の1文書として使える形か(壊れた台帳で例外を出さず、壊れた文書だけ捨てて自己修復するため)。
 * @param {unknown} d
 * @returns {d is CensusDoc}
 */
function isCensusDoc(d) {
  if (!d || typeof d !== 'object') return false;
  const x = /** @type {Record<string, unknown>} */ (d);
  const triple = (/** @type {unknown} */ v) => Array.isArray(v) && v.length >= 3 && v.every((n) => typeof n === 'number');
  return (
    typeof x.i === 'string' && !!x.i && typeof x.s === 'string' &&
    typeof x.a === 'number' && typeof x.seenAt === 'number' && typeof x.firstSeenAt === 'number' &&
    triple(x.lt) && triple(x.lg) && Array.isArray(x.oc)
  );
}

/**
 * SW が storage の台帳に1文書の報告を足す(純関数・読んで足して書く側が使う)。
 *   ・同じ instanceId は置き換え / 別 instanceId は並べる(★後勝ちで潰さない)
 *   ・EXT_CENSUS_STALE_MS 無音の文書は落とす / 上限 EXT_CENSUS_MAX_DOCS 件
 *   ・新しい instanceId を見るたびに面ごとの起動回数(bl)へ時刻を積む(10分窓)
 *   ・壊れた報告は無視して既存の台帳をそのまま返す
 * @param {CensusRecord|null|undefined} prev
 * @param {unknown} report
 * @param {number} nowMs
 * @returns {CensusRecord}
 */
export function mergeCensusReport(prev, report, nowMs) {
  const base = prev && typeof prev === 'object' && Array.isArray(prev.docs)
    ? { at: prev.at, docs: prev.docs.filter(isCensusDoc), bl: prev.bl && typeof prev.bl === 'object' ? prev.bl : {} }
    : { at: 0, docs: [], bl: {} };
  const r = /** @type {Partial<DocReport>|null} */ (report && typeof report === 'object' ? report : null);
  if (!r || typeof r.i !== 'string' || !r.i || typeof r.s !== 'string') return /** @type {CensusRecord} */ (base);

  const old = base.docs.find((d) => d.i === r.i);
  const bl = /** @type {Record<string, number[]>} */ ({});
  for (const [k, v] of Object.entries(base.bl || {})) {
    const kept = (Array.isArray(v) ? v : []).filter((t) => typeof t === 'number' && nowMs - t <= EXT_CENSUS_BOOT_WINDOW_MS);
    if (kept.length) bl[k] = kept;
  }
  if (!old) bl[r.s] = [...(bl[r.s] || []), nowMs];

  const doc = /** @type {CensusDoc} */ ({
    ...(/** @type {DocReport} */ (r)),
    seenAt: nowMs,
    firstSeenAt: old ? old.firstSeenAt : nowMs
  });
  const docs = base.docs
    .filter((d) => d.i !== r.i && nowMs - d.seenAt <= EXT_CENSUS_STALE_MS)
    .concat(doc)
    .sort((x, y) => y.seenAt - x.seenAt)
    .slice(0, EXT_CENSUS_MAX_DOCS);
  return { at: nowMs, docs, bl };
}

/** @param {number} sec */
function fmtAge(sec) {
  if (sec >= 3600) return `${Math.round(sec / 360) / 10}時間`;
  if (sec >= 60) return `${Math.round(sec / 60)}分`;
  return `${sec}秒`;
}

/**
 * 状態速報の文言。
 * ★誤診させない: 稼働30秒未満は犯人にしない / 自分の長い処理が小さいのに遅れだけ大きい文書しか無いときは断言を止める /
 *   台帳が空なら「未受信」(0件の緑にしない)。
 * @param {CensusRecord|null|undefined} rec
 * @param {number} nowMs
 * @returns {string[]}
 */
export function formatExtProcessCensusLines(rec, nowMs) {
  const docs = rec && Array.isArray(rec.docs)
    ? rec.docs.filter((d) => isCensusDoc(d) && nowMs - d.seenAt <= EXT_CENSUS_STALE_MS * 2)
    : [];
  if (!docs.length) {
    return ['拡張プロセスの忙しさ: ⏳未受信(拡張を更新した直後などは、60秒ほど待って再読込すると各文書の報告が入ります)'];
  }
  /** @param {CensusDoc} d */
  const pct = (d) => (d.a > 0 ? Math.round(((d.lt[1] / 1000) / d.a) * 1000) / 10 : 0);
  const rows = docs.slice().sort((x, y) => y.lt[1] - x.lt[1] || y.lg[0] - x.lg[0]);
  /** @type {string[]} */
  const lines = [
    '拡張プロセスの忙しさ(文書別・拡張の全ページは1本のメインスレッドを共有): 犯人=自分が実行した長い処理(50ms超)/ 被害=自分が受けた遅れ'
  ];
  for (const d of rows.slice(0, 5)) {
    const oc = d.oc.length ? ` / onChanged ${d.oc.map((x) => `${x[0]}×${x[1]}(${x[2]}KB)`).join(' ')}` : '';
    const other = d.lo && d.lo[0] > 0 ? ` / 同じタブの他の文書が実行 ${d.lo[0]}回/計${d.lo[1]}ms(最大${d.lo[2]}ms)` : '';
    lines.push(
      `  ・${d.s}#${d.i.slice(-4)} 稼働${fmtAge(d.a)}: 長い処理${d.lt[0]}回/計${d.lt[1]}ms(最大${d.lt[2]}ms)=稼働の${pct(d)}%${other} / 受けた遅れ計${d.lg[0]}ms(最大${d.lg[1]}ms)${oc}`
    );
  }
  const culprits = rows.filter((d) => d.a >= EXT_CENSUS_BOOT_SETTLE_SEC && pct(d) >= EXT_CENSUS_CULPRIT_PCT);
  if (culprits.length) {
    lines.push(
      `  → 🔴犯人候補: ${culprits.slice(0, 3).map((d) => `${d.s}#${d.i.slice(-4)}(長い処理が稼働の${pct(d)}%)`).join(' / ')}`
    );
  } else if (rows.some((d) => d.lg[0] >= 2000)) {
    lines.push(
      '  → 🟡遅れを受けている文書はあるが、自分の長い処理が稼働の10%を超える文書は無い=犯人は断言できません(50ms未満の細かい処理の積み上げ・GC・Service Worker・content script のいずれか)'
    );
  } else {
    lines.push('  → 🟢長い処理で稼働の10%を超える文書は無く、大きな遅れも出ていません');
  }
  const heap = docs.map((d) => d.hp).filter((h) => Array.isArray(h));
  if (heap.length) {
    const top = heap.reduce((a, b) => (b[0] > a[0] ? b : a));
    lines.push(`  ヒープ: 最大 ${top[0]}MB / 上限 ${top[1]}MB(${Math.round((top[0] / top[1]) * 100)}%・拡張プロセス全体の値)`);
  }
  const bl = rec && rec.bl ? Object.entries(rec.bl).filter(([, v]) => Array.isArray(v) && v.length) : [];
  if (bl.length) {
    lines.push(
      `  起動回数(10分): ${bl.map(([k, v]) => `${k}×${v.length}`).join(' ')}${bl.some(([, v]) => v.length >= 3) ? ' ⚠3回以上=文書の作り直しを繰り返している疑い' : ''}`
    );
  }
  return lines;
}
