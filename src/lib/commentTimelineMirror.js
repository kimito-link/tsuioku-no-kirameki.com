// @ts-nocheck — 任意のコメント配列を歩く動的整形
/**
 * コメントタイムラインの「鏡」スナップショット純関数（council/liveview-wholesale-root-SYNTHESIS.md 第2段）。
 *
 * 狙い = 純Web応援ライブビューで「コメントが進む動き」を見せる。これまで純Webに送る鏡(laneMirror/
 *   statCardsMirror/northStarMirror)はコメントの流れを一切含まず、純Webでは応援タイムラインが常に
 *   「0コメント・まだ応援コメントがないのだ…」のまま=構造上コメントが進まなかった。
 *   → popup が既に手元に持つコメント配列(displayEntries)から【最新N件・最小フィールド】に間引いた
 *     スナップショットを鏡として publish→status が jsonBlob に相乗り→純Web が貼って「流れ」を出す。
 *
 * ★過去の重さ却下(丸ごとDOM鏡 v0.1.948)との違い= ここは「既に手元にある配列を最新N件に slice して
 *   最小フィールドだけ取る」純データ整形=毎paintで全DOM sanitize するような重い同期処理ではない。
 * ★最小フィールド = 表示に要る分だけ(時刻順表示+名前+本文+顔)。個人を新たに名寄せしない(既にある値のみ)。
 *
 * @typedef {{ at: number, name: string, text: string, avatarUrl: string, userId: string, kind: string }} TimelineMirrorRow
 * @typedef {{ liveId: string, capturedAt: number, rows: TimelineMirrorRow[], totalSeen: number }} CommentTimelineMirrorSnapshot
 *
 * @module commentTimelineMirror
 */

/** 鏡に載せる最新件数の上限(純Webで「流れ」を見せるのに十分・容量を抑える)。 */
export const TIMELINE_MIRROR_CAP = 60;
/** 1スナップショットの容量上限(超えたら cap を半減して作り直す=status/送信を重くしない)。 */
const TIMELINE_MIRROR_MAX_JSON_BYTES = 256 * 1024;
/** 本文の最大長(長文コメントで容量が膨らむのを防ぐ)。 */
const TIMELINE_TEXT_MAX = 120;

function s(v) {
  return String(v == null ? '' : v).trim();
}

/** コメント1件 → 鏡 row(最小フィールド)。表示名/本文/顔/時刻のみ。null は捨てる。 */
function toTimelineRow(item, resolveName, resolveAvatar) {
  const it = item && typeof item === 'object' ? item : null;
  if (!it) return null;
  const at = Number(it.at ?? it.date ?? it.vpos ?? 0);
  const text = s(it.text).slice(0, TIMELINE_TEXT_MAX);
  const userId = s(it.userId);
  // name/avatar は「既に手元で解決済みの値」を呼び出し側から渡す(新たな名寄せ・fetch はしない)。
  const name = typeof resolveName === 'function' ? s(resolveName(it)) : s(it.nickname);
  const avatarUrl = typeof resolveAvatar === 'function' ? s(resolveAvatar(it)) : s(it.avatarUrl);
  const kind = s(it.kind) || (it.isGift ? 'gift' : 'comment');
  // 本文も名前も顔も無い行は鏡に載せても無意味=捨てる。
  if (!text && !name && !avatarUrl) return null;
  return {
    at: Number.isFinite(at) && at > 0 ? at : 0,
    name,
    text,
    avatarUrl,
    userId,
    kind
  };
}

/**
 * コメント配列(+任意のギフト配列)から最新N件のタイムライン鏡を組む純関数。
 * @param {object} args
 * @param {string} args.liveId
 * @param {any[]} args.comments       popup が手元に持つコメント配列(displayEntries 等)
 * @param {any[]} [args.giftEvents]   ギフトイベント配列(任意・コメントと時刻順に統合)
 * @param {number} args.capturedAt    epoch ms(producer 側で渡す=テスト容易)
 * @param {(c:any)=>string} [args.resolveName]   既解決の表示名を返す(新規名寄せはしない)
 * @param {(c:any)=>string} [args.resolveAvatar] 既解決の顔URLを返す
 * @param {number} [args.cap]
 * @returns {CommentTimelineMirrorSnapshot|null}
 */
export function buildCommentTimelineMirrorSnapshot(args) {
  const a = args && typeof args === 'object' ? args : {};
  const liveId = s(a.liveId).toLowerCase();
  const comments = Array.isArray(a.comments) ? a.comments : [];
  const gifts = Array.isArray(a.giftEvents) ? a.giftEvents : [];
  const capturedAt = Number(a.capturedAt) || 0;
  if (!comments.length && !gifts.length) return null;

  const merged = [...comments, ...gifts]
    .map((it) => toTimelineRow(it, a.resolveName, a.resolveAvatar))
    .filter(Boolean);
  if (!merged.length) return null;

  // 時刻順(古→新)に並べ、最新 cap 件を取る(末尾=最新)。at が 0 の行は元の順序を保つ安定ソート。
  merged.sort((x, y) => (x.at || 0) - (y.at || 0));
  const totalSeen = merged.length;

  let cap = Number.isFinite(a.cap) && a.cap > 0 ? Math.floor(a.cap) : TIMELINE_MIRROR_CAP;
  let rows = merged.slice(-cap);
  let snap = { liveId, capturedAt, rows, totalSeen };
  // 容量二段ガード: 超えたら cap を半減して作り直す(status/送信を重くしない)。
  for (let guard = 0; guard < 4; guard += 1) {
    let bytes = 0;
    try { bytes = JSON.stringify(snap).length; } catch { bytes = 0; }
    if (bytes <= TIMELINE_MIRROR_MAX_JSON_BYTES || rows.length <= 8) break;
    cap = Math.max(8, Math.floor(cap / 2));
    rows = merged.slice(-cap);
    snap = { liveId, capturedAt, rows, totalSeen };
  }
  return snap;
}

/**
 * 鏡 row が「流れ」描画に使える最小要件を満たすか(純Web/status が描く前のガード)。
 * @param {any} row
 * @returns {boolean}
 */
export function isTimelineMirrorRowRenderable(row) {
  const r = row && typeof row === 'object' ? row : null;
  if (!r) return false;
  return Boolean(s(r.text) || s(r.name) || s(r.avatarUrl));
}

/**
 * 鏡スナップショットから描画用の row 配列を復元する(古→新の順を保証・空行を除去)。
 * @param {CommentTimelineMirrorSnapshot|null|undefined} snap
 * @returns {TimelineMirrorRow[]}
 */
export function restoreCommentTimelineRows(snap) {
  const rows = snap && Array.isArray(snap.rows) ? snap.rows : [];
  return rows.filter(isTimelineMirrorRowRenderable);
}
