/**
 * 【層】L0 判定層(純粋関数)
 * 【この箱に入るもの】スマホのリアルタイム化(Ably)で行き来するイベントの形の検査・コメント鏡の行との相互変換・
 *   スマホ側で鏡にイベントを足す判定。PC(status-entry)・サーバー(src/server/liveEventsApi.js)・スマホ(app)が共有する。
 * 【この箱に入らないもの】fetch・Ably への接続・タイマー・Redis(各層が持つ)
 *
 * ★なぜ(v0.1.1756・設計書 /mnt/project-files/smartphone/design-3-realtime.md):
 *   スマホは画面の中身(まとめ・約130KB)を約5秒ごとに取りに行き、コメント鏡は PC 側で最短8秒ごとにしか書かれない
 *   =コメントがスマホに出るまで最大10秒以上かかる。新着コメントだけを3秒ごとにまとめて Ably で届ける。
 *   - 届ける先(チャンネル)は閲覧トークンから作る推測できない名前。購読はサーバーが出す「購読だけ」の許可で行う。
 *   - Ably のキーがサーバーに無いときは何もしない(PC は送らない・スマホは今のポーリングのまま)。
 *   - 外部から来る値は形から検査し、壊れた1件だけ捨てる(AGENTS.md §3.6)。
 * @module liveEvents
 */

import { toEpochMs } from './timeAuthority.js';

/** 1回の送信に入れてよいイベント数(liveEventBatch の上限と同じ)。 */
export const LIVE_EVENTS_MAX_PER_SEND = 50;
/** 1回の送信の本文の上限(バイト)。5KiB のまとめ+封筒。 */
export const LIVE_EVENTS_MAX_BODY_BYTES = 16 * 1024;
/**
 * 閲覧トークンごとの1日の送信回数の上限。3秒ごとに1日中送っても 28,800 回。
 */
export const DEFAULT_LIVE_EVENTS_DAILY_LIMIT = 30_000;
/**
 * 全体の月の送信回数の上限(env LIVE_EVENTS_MONTHLY_LIMIT で上書き)。
 *   ★Ably は「送った1件+届けた件数」を数える(スマホ1台なら1回の送信で2件)。無料枠は月600万件。
 *   250万回 × 2 = 500万件=無料枠の内側に止める(設計書 8章)。超えたら送らない=スマホはポーリングに戻る。
 */
export const DEFAULT_LIVE_EVENTS_MONTHLY_LIMIT = 2_500_000;
/** スマホへ出す購読の許可の寿命(ms)。切れたらスマホが取り直す。 */
export const LIVE_EVENTS_TOKEN_TTL_MS = 60 * 60 * 1000;
/** スマホがイベントを鏡に足すときに残す行数(コメント鏡の上限と同じ)。 */
export const LIVE_EVENTS_MIRROR_CAP = 60;

const TYPES = new Set(['comment', 'gift', 'ad', 'liveChanged']);
const LV_RE = /^lv\d{1,15}$/;
const SEND_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** @param {unknown} v @param {number} max */
function str(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v).slice(0, max) : '';
}

/** 画像の URL は https のものだけ通す(それ以外は空=スマホは代わりの顔を出す)。 @param {unknown} v */
function safeUrl(v) {
  const s = str(v, 400);
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : '';
}

/**
 * 1件のイベントを検査して、通してよい形に整える。駄目なら null(=その1件だけ捨てる)。
 * @param {unknown} raw
 * @returns {{ type: string, no: string, at: number, name: string, text: string, avatarUrl: string, userId: string, kind: string, liveId?: string } | null}
 */
export function sanitizeLiveEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const e = /** @type {Record<string, unknown>} */ (raw);
  const type = str(e.type, 16);
  if (!TYPES.has(type)) return null;
  const at = Number(e.at);
  const out = {
    type,
    no: /^\d{1,12}$/.test(str(e.no, 12)) ? str(e.no, 12) : '',
    at: Number.isFinite(at) && at > 0 ? Math.floor(at) : 0,
    name: str(e.name, 64),
    text: str(e.text, 200),
    avatarUrl: safeUrl(e.avatarUrl),
    userId: str(e.userId, 40),
    kind: str(e.kind, 16)
  };
  if (type === 'liveChanged') {
    const lv = str(e.liveId, 20).toLowerCase();
    return LV_RE.test(lv) ? { ...out, liveId: lv } : null;
  }
  // コメント・ギフト・広告は「いつ」と「何か」が無ければ描けない。
  if (!out.at || (!out.text && !out.name)) return null;
  return out;
}

/**
 * PC からの送信の本文を検査する。形が違えば null(=400)。壊れたイベントは1件ずつ捨てる。
 * @param {unknown} body
 * @returns {{ liveId: string, sendId: string, events: any[], dropped: number } | null}
 */
export function sanitizeLiveEventsBody(body) {
  if (!body || typeof body !== 'object') return null;
  const b = /** @type {Record<string, unknown>} */ (body);
  const liveId = str(b.liveId, 20).toLowerCase();
  const sendId = str(b.sendId, 64);
  if (!LV_RE.test(liveId) || !SEND_ID_RE.test(sendId) || !Array.isArray(b.events)) return null;
  if (b.events.length > LIVE_EVENTS_MAX_PER_SEND) return null;
  const events = b.events.map(sanitizeLiveEvent).filter(Boolean);
  if (!events.length) return null;
  const dropped = Math.max(0, Math.min(1_000_000, Math.floor(Number(b.dropped) || 0)));
  return { liveId, sendId, events, dropped };
}

/**
 * コメント鏡の1行(TimelineMirrorRow)を、送るイベントにする。ギフトの行は gift。
 * @param {any} row
 */
export function mirrorRowToLiveEvent(row) {
  if (!row || typeof row !== 'object') return null;
  const kind = String(row.kind || '');
  return sanitizeLiveEvent({
    type: kind === 'gift' ? 'gift' : 'comment',
    no: row.no,
    at: row.at,
    name: row.name,
    text: row.text,
    avatarUrl: row.avatarUrl,
    userId: row.userId,
    kind
  });
}

/**
 * スマホ: 受け取ったイベントをコメント鏡の行に戻す(既存の描画部品にそのまま渡すため)。
 * @param {any} ev
 */
export function liveEventToMirrorRow(ev) {
  const e = sanitizeLiveEvent(ev);
  if (!e || e.type === 'liveChanged') return null;
  /** @type {Record<string, unknown>} */
  const row = { at: e.at, name: e.name, text: e.text, avatarUrl: e.avatarUrl, userId: e.userId, kind: e.kind || (e.type === 'gift' ? 'gift' : '') };
  if (e.no) row.no = e.no;
  return row;
}

/** 行の同じさの目印: 番号があれば番号、無ければ時刻+人+本文。 @param {any} r */
function rowKey(r) {
  return r && r.no ? `n:${r.no}` : `t:${Number(r?.at) || 0}|${String(r?.userId || '')}|${String(r?.text || '')}`;
}

/**
 * スマホ: コメント鏡にイベント由来の行を足す(同じ行は足さない・時刻順・最新 cap 件)。元の鏡は変えない。
 *   ★ポーリングで届いた鏡(PC で最短8秒ごと)がイベントより古くても、足した行は消えない(巻き戻さない)。
 *   配信が違う鏡には足さない(配信が切り替わったら足した行は捨てる)。
 * @param {any} snap コメント鏡(null 可)
 * @param {any[]} rows イベントから戻した行
 * @param {{ liveId: string, cap?: number }} opts
 * @returns {any} 新しい鏡(足すものが無ければ元の鏡)
 */
export function mergeLiveRowsIntoMirror(snap, rows, opts) {
  const liveId = String(opts?.liveId || '').toLowerCase();
  const extra = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
  if (!extra.length || !LV_RE.test(liveId)) return snap;
  const base = snap && typeof snap === 'object' ? snap : null;
  if (base && String(base.liveId || '').toLowerCase() !== liveId) return snap;
  const baseRows = Array.isArray(base?.rows) ? base.rows : [];
  const seen = new Set(baseRows.map(rowKey));
  const add = extra.filter((r) => {
    const k = rowKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!add.length) return snap;
  const cap = Number(opts?.cap) > 0 ? Number(opts.cap) : LIVE_EVENTS_MIRROR_CAP;
  const merged = [...baseRows, ...add]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (Number(a.r.at) || 0) - (Number(b.r.at) || 0) || a.i - b.i)
    .map((x) => x.r)
    .slice(-cap);
  // 時点の読み方は timeAuthority に委ねる(独自に解釈しない)。
  const newestAt = Math.max(toEpochMs(base?.capturedAt), ...add.map((r) => toEpochMs(r.at)));
  return {
    ...(base || {}),
    liveId,
    rows: merged,
    capturedAt: newestAt,
    totalSeen: Math.max(Number(base?.totalSeen) || 0, merged.length) + (base ? add.length : 0)
  };
}

/**
 * スマホ: Ably の SSE の1件(enveloped=true の Message、または中身そのもの)から、送られたまとめを取り出す。
 *   形が違えば null(=その1件を捨てる)。
 * @param {unknown} raw SSE の data(文字列)
 * @returns {{ liveId: string, events: any[] } | null}
 */
export function parseLiveEventsMessage(raw) {
  let o = raw;
  try {
    if (typeof o === 'string') o = JSON.parse(o);
    // enveloped=true: { id, name, data: "<JSON 文字列>" | {…}, encoding }
    if (o && typeof o === 'object' && 'data' in /** @type {object} */ (o) && !('events' in /** @type {object} */ (o))) {
      const d = /** @type {any} */ (o).data;
      o = typeof d === 'string' ? JSON.parse(d) : d;
    }
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const m = /** @type {Record<string, unknown>} */ (o);
  const liveId = str(m.liveId, 20).toLowerCase();
  if (!LV_RE.test(liveId) || !Array.isArray(m.events)) return null;
  const events = m.events.slice(0, LIVE_EVENTS_MAX_PER_SEND).map(sanitizeLiveEvent).filter(Boolean);
  return { liveId, events };
}

/** Redis のキー名(ここだけで決める)。 */
export const liveEventKeys = {
  /** @param {string} quotaId @param {string} day YYYYMMDD */
  daily: (quotaId, day) => `quota:ev:${quotaId}:${day}`,
  /** @param {string} month YYYYMM */
  monthly: (month) => `quota:evm:${month}`
};
