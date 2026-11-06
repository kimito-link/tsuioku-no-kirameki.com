// ytCrossVideoDuplicates.js — 別の配信の記録に紛れ込んだコメントを見分ける純関数(片付け用)。
//
// ★なぜ(2026-11-06 りんく「消して」): v0.1.1903 までは、チャット欄が前の配信のまま残ると、そのコメントを今の配信の記録にも
//   入れていた(Kai Cenat の @Christopher-c9h が 高松あいさんの記録に12件など)。YouTube のコメントは1件ごとに id があり、
//   1件は1つの配信にしか無い。同じ id が2つ以上の配信の記録にあれば、いちばん早く記録された1件だけを本物として残し、
//   ほかを消す(紛れ込みは必ず「配信を移ったあと」=本物より後に記録される)。
//   同じ時刻なら、アーカイブの埋め直しで書かれた時刻(postedAtMs)を持つ方 → videoId の並び順で決める(毎回同じ答え)。

/**
 * @typedef {{ pk: string, id: string, videoId: string, recordedAt?: number, postedAtMs?: number }} YtCommentKeyRow
 */

/**
 * @param {YtCommentKeyRow} a
 * @param {YtCommentKeyRow} b
 * @returns {number} a を残すべきなら負
 */
function compareOwner(a, b) {
  const ta = Number(a?.recordedAt) || Number.MAX_SAFE_INTEGER;
  const tb = Number(b?.recordedAt) || Number.MAX_SAFE_INTEGER;
  if (ta !== tb) return ta - tb;
  const pa = Number(a?.postedAtMs) > 0 ? 0 : 1;
  const pb = Number(b?.postedAtMs) > 0 ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return String(a?.videoId || '') < String(b?.videoId || '') ? -1 : String(a?.videoId || '') > String(b?.videoId || '') ? 1 : 0;
}

/**
 * 消すべき記録(紛れ込み)を選ぶ。
 * @param {Iterable<YtCommentKeyRow>} rows 全配信の記録(pk・id・videoId・recordedAt だけあればよい)
 * @returns {{ deletePks: string[], byVideo: Record<string, number>, pairs: Record<string, number> }}
 *   byVideo = 配信ごとの消す件数 / pairs = 「本物の配信>紛れ込んだ配信」ごとの件数(計器用)
 */
export function pickYtCrossVideoDuplicates(rows) {
  /** @type {Map<string, YtCommentKeyRow[]>} */
  const byId = new Map();
  for (const r of rows || []) {
    const id = String(r?.id || '').trim();
    const vid = String(r?.videoId || '').trim();
    if (!id || !vid || !r?.pk) continue;
    const list = byId.get(id);
    if (list) list.push(r);
    else byId.set(id, [r]);
  }
  /** @type {string[]} */
  const deletePks = [];
  /** @type {Record<string, number>} */
  const byVideo = {};
  /** @type {Record<string, number>} */
  const pairs = {};
  for (const list of byId.values()) {
    if (list.length < 2) continue;
    const vids = new Set(list.map((r) => r.videoId));
    if (vids.size < 2) continue; // 同じ配信の中の重複は pk で既に1件(ここでは触らない)
    const sorted = [...list].sort(compareOwner);
    const owner = sorted[0].videoId;
    for (const r of sorted.slice(1)) {
      if (r.videoId === owner) continue;
      deletePks.push(String(r.pk));
      byVideo[r.videoId] = (byVideo[r.videoId] || 0) + 1;
      const k = `${owner}>${r.videoId}`;
      pairs[k] = (pairs[k] || 0) + 1;
    }
  }
  return { deletePks, byVideo, pairs };
}
