/**
 * イベント💎「いまの順位・pt・次の順位まで」ボードの表示モデル（純関数・2026-11-21 Phase 2）。
 *
 * ■ ユーザーが一番ほしいもの（りんく「ユーザーが一番もとめるものを」）
 *   見ている配信者（と、ほかの参加者）が「いま何pt・何位・次の順位まであと何pt」かを先頭に出す。
 *
 * ■ 正直なラベル（実測 2026-11-21 06:55〜07:31 JST に基づく）
 *   - audition capi の total_score はリアルタイムに動く。ただし公式に別の「イベントランキング」表
 *     （1日1回）があるイベント（紅白歌枠合戦など）では、capi の値は【年間（合算）】。
 *     → separateEventRanking=true のときだけ「年間（リアルタイム）」と書く。分からないときは
 *       「公式ランキングのスコア（リアルタイム）」と書き、イベントptとは書かない。
 *   - イベントptは公式表（各組25位まで・1日1回）にしか出ない。表に載ったことがある人だけ
 *     「推定」を出す（根拠つき）。載っていない人は「公式更新以降 +X」だけを出す（合計は出さない）。
 *   - 推定を公式とは書かない。最終取得時刻を必ず出す。
 *
 * 副作用なし・DOM 非依存。
 */

/**
 * @typedef {{ id: string, name: string, rank: number, score: number, thumbnailUrl?: string }} BoardRow
 * @typedef {{
 *   ok?: boolean,
 *   separateEventRanking?: boolean,
 *   lastSnapAt?: number,
 *   official?: { note: string, cutoffAt: number, rows: Array<{rank:number,id:string,name:string,score:number}> } | null,
 *   anchor?: { cutoffAt: number, snapAt: number, scores: Record<string, number> } | null,
 *   baselines?: Record<string, number>
 * }} ServerAnnotation
 */

const ID_RE = /^[1-9]\d{0,17}$/;

/** @param {unknown} v */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/**
 * ms → JST「HH:MM」。
 * @param {number} ms
 */
export function formatJstHm(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms + 9 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * ms → JST「M/D H:MM」。
 * @param {number} ms
 */
export function formatJstMdHm(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * サーバの注記（拡張が読む形）を検疫する。形が違えば null。
 * @param {unknown} raw
 * @returns {ServerAnnotation|null}
 */
export function sanitizeServerAnnotation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = /** @type {Record<string, any>} */ (raw);
  if (r.ok !== true) return null;
  /** @type {ServerAnnotation} */
  const out = { ok: true, separateEventRanking: r.separateEventRanking === true, lastSnapAt: num(r.lastSnapAt) || 0 };
  if (r.official && typeof r.official === 'object' && Array.isArray(r.official.rows)) {
    const rows = [];
    for (const x of r.official.rows.slice(0, 60)) {
      if (!x || typeof x !== 'object') continue;
      const id = String(x.id ?? '');
      const score = num(x.score);
      const rank = num(x.rank);
      if (!ID_RE.test(id) || score == null || !rank) continue;
      rows.push({ rank, id, name: String(x.name ?? '').slice(0, 80), score });
    }
    out.official = { note: String(r.official.note || '').slice(0, 60), cutoffAt: num(r.official.cutoffAt) || 0, rows };
  } else out.official = null;
  if (r.anchor && typeof r.anchor === 'object' && r.anchor.scores && typeof r.anchor.scores === 'object') {
    /** @type {Record<string, number>} */
    const scores = {};
    for (const [id, v] of Object.entries(r.anchor.scores)) {
      const n = num(v);
      if (ID_RE.test(id) && n != null) scores[id] = n;
    }
    out.anchor = { cutoffAt: num(r.anchor.cutoffAt) || 0, snapAt: num(r.anchor.snapAt) || 0, scores };
  } else out.anchor = null;
  /** @type {Record<string, number>} */
  const b = {};
  if (r.baselines && typeof r.baselines === 'object') {
    for (const [id, v] of Object.entries(r.baselines)) {
      const n = num(v);
      if (ID_RE.test(id) && n != null) b[id] = n;
    }
  }
  out.baselines = b;
  return out;
}

/**
 * 1人ぶんの「推定イベントpt」と「公式更新以降 +X」。
 * @param {string} id
 * @param {number} score いまの capi スコア
 * @param {ServerAnnotation|null} ann
 */
export function deriveEventNumbers(id, score, ann) {
  /** @type {{ value: number, basis: string } | null} */
  let estimated = null;
  /** @type {{ delta: number, sinceAt: number } | null} */
  let sinceUpdate = null;
  /** @type {{ rank: number, score: number } | null} */
  let official = null;
  if (!ann || !ann.separateEventRanking) return { estimated, sinceUpdate, official };
  const note = ann.official?.note || '';
  const or = ann.official?.rows?.find((r) => r.id === id);
  if (or) official = { rank: or.rank, score: or.score };
  const b = ann.baselines ? ann.baselines[id] : undefined;
  if (typeof b === 'number' && score >= b) {
    estimated = { value: score - b, basis: `公式表（${note || '1日1回の更新分'}）＋その後の年間の増加から推定` };
  }
  const a = ann.anchor?.scores?.[id];
  if (typeof a === 'number' && score >= a) {
    sinceUpdate = { delta: score - a, sinceAt: ann.anchor?.cutoffAt || ann.anchor?.snapAt || 0 };
  }
  return { estimated, sinceUpdate, official };
}

/**
 * ボード1イベントぶんのモデル。
 * @param {{
 *   key: string, title: string,
 *   self: { id?: string, name?: string, rank: number|null, score: number|null, scoreToNext?: number|null } | null,
 *   rows: BoardRow[],
 *   totalCount?: number,
 *   gotAt: number,
 *   localFirstSeen?: { at: number, score: number } | null
 * }} ev
 * @param {ServerAnnotation|null} ann
 */
export function buildEventLiveBoardModel(ev, ann) {
  const separate = !!(ann && ann.separateEventRanking);
  const scoreLabel = separate ? '年間（リアルタイム）' : '公式ランキングのスコア（リアルタイム）';
  const self = ev.self && typeof ev.self === 'object' ? ev.self : null;
  const rows = Array.isArray(ev.rows) ? ev.rows : [];
  let selfModel = null;
  if (self && typeof self.rank === 'number' && self.rank > 0 && typeof self.score === 'number') {
    const id = String(self.id || '');
    let toNext = typeof self.scoreToNext === 'number' && self.scoreToNext >= 0 ? self.scoreToNext : null;
    if (toNext == null && self.rank > 1) {
      const above = rows.find((r) => r.rank === self.rank - 1);
      if (above && above.score >= self.score) toNext = above.score - self.score;
    }
    const nums = ID_RE.test(id) ? deriveEventNumbers(id, self.score, ann) : { estimated: null, sinceUpdate: null, official: null };
    /** @type {{ delta: number, sinceAt: number, kind: 'server'|'local' } | null} */
    let since = nums.sinceUpdate ? { ...nums.sinceUpdate, kind: 'server' } : null;
    if (!since && ev.localFirstSeen && typeof ev.localFirstSeen.score === 'number' && self.score >= ev.localFirstSeen.score) {
      since = { delta: self.score - ev.localFirstSeen.score, sinceAt: ev.localFirstSeen.at, kind: 'local' };
    }
    // 推定イベント順位（公式表に載ったことがある人の中で）。1つ上の人まであと何pt。
    let estRank = null;
    let estToNext = null;
    if (nums.estimated) {
      const pool = [];
      for (const r of rows) {
        const d = deriveEventNumbers(r.id, r.score, ann);
        if (d.estimated && r.id !== id) pool.push(d.estimated.value);
      }
      for (const [oid, ob] of Object.entries(ann?.baselines || {})) {
        if (oid === id || rows.some((r) => r.id === oid)) continue;
        const a = ann?.anchor?.scores?.[oid];
        if (typeof a === 'number' && a >= ob) pool.push(a - ob); // 一覧外の人は起点時点の値（下限）
      }
      const higher = pool.filter((v) => v > nums.estimated.value).sort((x, y) => x - y);
      estRank = higher.length + 1;
      estToNext = higher.length > 0 ? higher[0] - nums.estimated.value : null;
    }
    selfModel = {
      id,
      name: String(self.name || ''),
      rank: self.rank,
      score: self.score,
      toNext,
      nextRank: self.rank > 1 ? self.rank - 1 : null,
      estimated: nums.estimated,
      estRank,
      estToNext,
      official: nums.official,
      since
    };
  }
  return {
    key: ev.key,
    title: String(ev.title || ''),
    separate,
    scoreLabel,
    gotAt: num(ev.gotAt) || 0,
    totalCount: num(ev.totalCount) || rows.length,
    officialNote: separate ? ann?.official?.note || '' : '',
    officialCutoffAt: separate ? ann?.official?.cutoffAt || 0 : 0,
    self: selfModel
  };
}

/**
 * 一覧（全員）の行モデル。自分の行に印。
 * @param {BoardRow[]} rows
 * @param {string} selfId
 * @param {ServerAnnotation|null} ann
 */
export function buildEventFullListRows(rows, selfId, ann) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !ID_RE.test(String(r.id)) || typeof r.score !== 'number') continue;
    const d = deriveEventNumbers(String(r.id), r.score, ann);
    out.push({
      id: String(r.id),
      name: String(r.name || ''),
      rank: r.rank,
      score: r.score,
      isSelf: !!selfId && String(r.id) === String(selfId),
      estimated: d.estimated ? d.estimated.value : null,
      sinceDelta: d.sinceUpdate ? d.sinceUpdate.delta : null
    });
  }
  return out;
}
