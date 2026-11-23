// @ts-nocheck
/**
 * イベント💎ランキングの「サーバ側スナップショット」純関数群（2026-11-21 Phase 2）。
 *
 * ■ 何のためか（実測に基づく・推測ではない）
 *   ニコニコ audition capi の rankings（無認証）はリアルタイムに動く。ただし「紅白歌枠合戦2026」の
 *   ように「年間ランキング（イベントpt + 2026年の全ギフト合計）」と「イベントランキング（イベント期間の
 *   ptだけ・公式ブログに1日1回・各組25位まで）」が分かれるイベントでは、capi の total_score は
 *   【年間】の値で、イベントptそのものはどこにも出ない（2026-11-21 06:55〜07:31 JST に実測）。
 *   年間に足された「2026年のギフト合計」は以後動かない定数なので、
 *     ・公式表に載った人: イベントpt(推定) = 年間(いま) − (年間(公式の締め時刻) − 公式表の値)
 *     ・載っていない人:   公式更新以降 +X = 年間(いま) − 年間(公式の締め時刻)
 *   が計算できる。そのために「公式の締め時刻ごろの年間スコア」を全員ぶん持っておく必要があり、
 *   拡張は配信を開いている間しか動かないので、サーバが5分おきに控えておく。
 *
 * ■ 置き場所の小ささ（全員の (id, score) だけ・差分で持つ）
 *   1時間ごとに「その時間の最初の全員ぶん」+「以後5分ごとに動いた人だけ」を1キーに入れる。
 *   紅白の実測では5分で動くのは数人〜20人。1時間ぶん ≒ 6KB + 数百B。TTL 50時間で自然に消える。
 *
 * 副作用なし（fetch も Redis も触らない）。api/event-ranking.js が使う。
 */

/** audition key（イベント slug）の厳格パターン（拡張側 AUDITION_KEY_RE と同じ）。 */
export const EVENT_KEY_RE = /^[a-z0-9][a-z0-9_-]{1,80}$/i;
/** 数値 id（ユーザー id）。 */
const ID_RE = /^[1-9]\d{0,17}$/;

/** 1イベントで読む rankings のページ上限（100人/ページ）。紅白は2ページ、鍋奉行祭は5ページ。 */
export const MAX_RANKING_PAGES = 10;
/** 公式の締め時刻と、手元のスナップショットの時刻の差がこれより大きければ「起点なし」とする。 */
export const ANCHOR_MAX_GAP_MS = 15 * 60 * 1000;

/**
 * rankings 応答（生 JSON）から {id: score} と名前・順位を取り出す。壊れた行だけ捨てる。
 * @param {unknown} json
 * @returns {{ rows: Array<{id:string,score:number,rank:number,name:string}>, totalCount: number }|null}
 */
export function pickRankingRows(json) {
  if (!json || typeof json !== 'object') return null;
  if (json.meta && json.meta.status != null && Number(json.meta.status) !== 200) return null;
  const list = json.data && Array.isArray(json.data.entry_items) ? json.data.entry_items : null;
  if (!list) return null;
  const rows = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const id = String(r.item_id == null ? '' : r.item_id).trim();
    const score = Number(r.total_score);
    const rank = Number(r.rank);
    if (!ID_RE.test(id) || !Number.isFinite(score) || score < 0) continue;
    rows.push({
      id,
      score: Math.trunc(score),
      rank: Number.isFinite(rank) && rank > 0 ? Math.trunc(rank) : 0,
      name: String(r.name == null ? '' : r.name).trim().slice(0, 80)
    });
  }
  const tc = Number(json.data.total_count);
  return { rows, totalCount: Number.isFinite(tc) && tc >= 0 ? Math.trunc(tc) : rows.length };
}

/**
 * JST の「YYYYMMDDHH」（1時間バケットのキー）。
 * @param {number} ms
 */
export function jstHourBucket(ms) {
  const d = new Date(ms + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}`;
}

/**
 * 1時間バケットへスナップショットを1つ足す（差分で持つ）。
 * bucket 形: { base: { t, s:{id:score} }, d: [ { t, c:{id:score} } ] }
 * @param {object|null} bucket 既存（無ければ null）
 * @param {number} t 取得時刻 ms
 * @param {Record<string, number>} scores 全員ぶん
 * @returns {object} 新しい bucket
 */
export function appendSnapshotToBucket(bucket, t, scores) {
  if (!bucket || !bucket.base || typeof bucket.base.s !== 'object') {
    return { base: { t, s: { ...scores } }, d: [] };
  }
  const cur = reconstructBucketAt(bucket, Number.MAX_SAFE_INTEGER);
  /** @type {Record<string, number>} */
  const c = {};
  for (const [id, v] of Object.entries(scores)) {
    if (cur.s[id] !== v) c[id] = v;
  }
  const d = Array.isArray(bucket.d) ? bucket.d.slice() : [];
  d.push({ t, c });
  return { base: bucket.base, d };
}

/**
 * バケットから「時刻 t 以前で最後のスナップショット」を組み立てる。
 * @param {object} bucket
 * @param {number} t
 * @returns {{ t: number, s: Record<string, number> }}
 */
export function reconstructBucketAt(bucket, t) {
  const s = { ...(bucket.base?.s || {}) };
  let at = Number(bucket.base?.t) || 0;
  for (const step of Array.isArray(bucket.d) ? bucket.d : []) {
    if (!step || Number(step.t) > t) break;
    Object.assign(s, step.c || {});
    at = Number(step.t);
  }
  return { t: at, s };
}

/**
 * バケットに入っている全スナップショット時刻。
 * @param {object} bucket
 * @returns {number[]}
 */
export function bucketSnapshotTimes(bucket) {
  if (!bucket || !bucket.base) return [];
  const out = [Number(bucket.base.t) || 0];
  for (const step of Array.isArray(bucket.d) ? bucket.d : []) out.push(Number(step?.t) || 0);
  return out.filter((x) => x > 0);
}

/**
 * 時刻 target に一番近いスナップショットを、複数バケットから選んで組み立てる。
 * @param {object[]} buckets
 * @param {number} target
 * @param {number} [maxGapMs]
 * @returns {{ t: number, s: Record<string, number> }|null}
 */
export function nearestSnapshot(buckets, target, maxGapMs = ANCHOR_MAX_GAP_MS) {
  let best = null;
  for (const b of buckets) {
    if (!b) continue;
    for (const t of bucketSnapshotTimes(b)) {
      const gap = Math.abs(t - target);
      if (gap > maxGapMs) continue;
      if (!best || gap < best.gap) best = { gap, b, t };
    }
  }
  if (!best) return null;
  return reconstructBucketAt(best.b, best.t);
}

/**
 * 公式ブログの「※11月21日（土）6時30分頃更新分」を JST の ms にする。
 * 年は now（JST）から決める。now より 2日以上未来になったら前年とみなす（年またぎ）。
 * @param {string} note
 * @param {number} nowMs
 * @returns {number|null}
 */
export function parseOfficialCutoff(note, nowMs) {
  const m = /(\d{1,2})月(\d{1,2})日[（(][^）)]*[）)]\s*(\d{1,2})時(?:(\d{1,2})分)?頃?更新分/.exec(String(note || ''));
  if (!m) return null;
  const mon = Number(m[1]);
  const day = Number(m[2]);
  const hh = Number(m[3]);
  const mi = m[4] ? Number(m[4]) : 0;
  if (mon < 1 || mon > 12 || day < 1 || day > 31 || hh > 23 || mi > 59) return null;
  const nowJst = new Date(nowMs + 9 * 3600 * 1000);
  let year = nowJst.getUTCFullYear();
  let ms = Date.UTC(year, mon - 1, day, hh, mi) - 9 * 3600 * 1000;
  if (ms - nowMs > 2 * 86400 * 1000) {
    year -= 1;
    ms = Date.UTC(year, mon - 1, day, hh, mi) - 9 * 3600 * 1000;
  }
  return ms;
}

/**
 * 公式ブログの「イベントランキング」ページ HTML から、更新分の注記と表の行を取り出す。
 * 表が2つ（紅組・白組）あっても全部まとめて返す（どのイベントの人かは id で振り分ける）。
 * @param {string} html
 * @returns {{ note: string, rows: Array<{rank:number,id:string,name:string,score:number}> }|null}
 */
export function parseOfficialEventRankingHtml(html) {
  const src = String(html || '');
  if (!src) return null;
  const nm = /※?\s*(\d{1,2}月\d{1,2}日[（(][^）)]*[）)]\s*\d{1,2}時(?:\d{1,2}分)?頃?更新分)/.exec(src);
  const note = nm ? nm[1] : '';
  const rows = [];
  const re =
    /<tr>\s*<td>\s*(\d{1,4})\s*<\/td>[\s\S]*?<a href="https:\/\/www\.nicovideo\.jp\/user\/(\d{1,18})">([^<]{1,200})<\/a>\s*<\/td>\s*<td>\s*([\d,]{1,15})\s*<\/td>\s*<\/tr>/g;
  let m;
  while ((m = re.exec(src)) && rows.length < 400) {
    const score = Number(m[4].replace(/,/g, ''));
    if (!ID_RE.test(m[2]) || !Number.isFinite(score)) continue;
    rows.push({ rank: Number(m[1]), id: m[2], name: decodeEntities(m[3]).trim().slice(0, 80), score });
  }
  if (!note || rows.length === 0) return null;
  return { note, rows };
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d{1,6});/g, (_, n) => {
      const c = Number(n);
      return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : '';
    });
}

/**
 * 公式表の行（両組まとめ）から、このイベントの参加者だけを抜き出して順位を振り直さない（公式の順位のまま）。
 * @param {Array<{rank:number,id:string,name:string,score:number}>} officialRows
 * @param {Record<string, number>} participantScores このイベントの全員 {id:score}
 */
export function filterOfficialRowsForEvent(officialRows, participantScores) {
  return (officialRows || []).filter((r) => r && Object.prototype.hasOwnProperty.call(participantScores, r.id));
}

/**
 * 起点（公式の締め時刻ごろの年間スコア）と公式表から「足された定数」を計算し、前回までの値に重ねる。
 * 定数がマイナスになるのは起点の時刻ずれ（締め時刻とスナップショットの間のギフト）で、
 * 大きくずれた時は採用しない（誤値ゼロ優先）。
 * @param {Record<string, {b:number, at:number}>|null} prev
 * @param {{ t:number, s:Record<string,number> }} anchor
 * @param {Array<{id:string,score:number}>} officialRows このイベントの公式行
 * @param {number} cutoffAt
 */
export function mergeBaselines(prev, anchor, officialRows, cutoffAt) {
  const out = { ...(prev || {}) };
  for (const r of officialRows || []) {
    const a = anchor?.s?.[r.id];
    if (typeof a !== 'number') continue;
    let b = a - r.score;
    if (b < 0) {
      if (b < -5000) continue; // 締め時刻とのずれでは説明できない＝採用しない
      b = 0;
    }
    out[r.id] = { b, at: cutoffAt };
  }
  return out;
}

/**
 * 拡張へ返す形に整える（小さく・必要なものだけ）。
 * @param {object} p
 */
export function buildPublicPayload(p) {
  const { key, lastSnapAt, official, anchor, baselines } = p;
  const hasOfficial = !!(official && Array.isArray(official.rows) && official.rows.length > 0);
  /** @type {Record<string, number>} */
  const b = {};
  for (const [id, v] of Object.entries(baselines || {})) {
    if (v && typeof v.b === 'number') b[id] = v.b;
  }
  return {
    ok: true,
    key,
    // separateEventRanking=true: 公式に別の「イベントランキング」表がある＝capi は年間（合算）の値。
    separateEventRanking: hasOfficial,
    lastSnapAt: Number(lastSnapAt) || 0,
    official: hasOfficial
      ? {
          note: official.note,
          cutoffAt: official.cutoffAt || 0,
          fetchedAt: official.fetchedAt || 0,
          url: official.url || '',
          rows: official.rows.slice(0, 50).map((r) => ({ rank: r.rank, id: r.id, name: r.name, score: r.score }))
        }
      : null,
    anchor: anchor && anchor.s ? { cutoffAt: anchor.cutoffAt || 0, snapAt: anchor.t || 0, scores: anchor.s } : null,
    baselines: b
  };
}
