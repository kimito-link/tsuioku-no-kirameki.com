/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】動画ページで読んだコメントを、配信の記録の行(ytIdbStore の行)と同じ形にすること
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / 新しい Observer / タイマー
 * 【書けるstorageキー】なし(呼び出し側がカードの videoRows に入れる)
 * 【正本宣言】動画のコメントを会場モード・マーケHTML・コメビュに渡す行の形はこのファイル
 *
 * v0.1.2263(りんく 11-27「会場モードでもコメント確認できるようにしたい」・マーケHTMLが「コメントが0件です」):
 *   動画は配信ではないので記録(IndexedDB)の行が無い。横の欄のサムネイルと同じページの行を、記録の行の形にして
 *   同じ読み口(ytNicoShim の fetchStreamRows・書き出しの読み口)から返す。記録が1件でもある配信は、これまでどおり記録を使う。
 *   過去のコメントなので skipVoice(読み上げ・吹き出しで「いま来た」にしない)を付ける。
 */

/** 動画1本で渡す行の上限(ページの読み取りの上限と同じ) */
export const VIDEO_ROWS_CAP = 200;

/**
 * @param {readonly any[] | null | undefined} comments ページから読んだ行(親コメントと返信)
 * @param {{ videoId?: string, platform?: string, nowMs?: number }} [opts]
 * @returns {any[]} 古い順(記録の行と同じ並び)
 */
export function videoCommentRowsForStore(comments, opts = {}) {
  const list = Array.isArray(comments) ? comments : [];
  const vid = String(opts.videoId || '').trim();
  const platform = String(opts.platform || '').trim();
  const now = Number.isFinite(Number(opts.nowMs)) && Number(opts.nowMs) > 0 ? Number(opts.nowMs) : Date.now();
  /** @type {any[]} */
  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length && out.length < VIDEO_ROWS_CAP; i += 1) {
    const c = list[i];
    if (!c || typeof c !== 'object') continue;
    const text = String(c.text || '').trim();
    if (!text) continue;
    const cid = String(c.commentId || '').trim();
    const pk = cid ? `vid:${vid}:${cid}` : `vid:${vid}:${i}`;
    if (seen.has(pk)) continue;
    seen.add(pk);
    const posted = Number(c.postedAtMs ?? c.at);
    // ページに出ている順(YouTube の「新しい順」なら新しいものが先)を保つため、同じ時刻は先の行ほど新しくする
    const base = Number.isFinite(posted) && posted > 0 ? Math.floor(posted) : now;
    const at = base - i;
    const channelId = String(c.channelId || '').trim();
    const handle = String(c.handle || '').trim();
    out.push({
      pk,
      id: cid || pk,
      videoId: vid,
      text: text.slice(0, 600),
      name: String(c.name || handle || '').trim().slice(0, 80),
      channelId: channelId || (handle ? handle : ''),
      ...(handle ? { handle } : {}),
      iconUrl: /^https:\/\//i.test(String(c.avatarUrl || '')) ? String(c.avatarUrl) : '',
      recordedAt: at,
      postedAtMs: at,
      kind: 'text',
      skipVoice: true,
      videoComment: true,
      ...(c.isCreator === true ? { isCreator: true } : {}),
      ...(Number(c.replyLevel) > 0 ? { replyLevel: 1, parentId: String(c.parentId || '') } : {}),
      ...(platform ? { platform } : {}),
    });
  }
  out.sort((a, b) => a.recordedAt - b.recordedAt);
  return out;
}

/**
 * 記録の読み口の差し替え: 記録の行があればそのまま、無ければ同じ動画のカードの行。
 * @param {readonly any[] | null | undefined} recorded 記録(IndexedDB)の行
 * @param {any} cardWrap 動画カードの置き場の値({ videoId, card: { videoRows } })
 * @param {string} videoId
 * @returns {any[]}
 */
export function recordedRowsOrVideoRows(recorded, cardWrap, videoId) {
  const rows = Array.isArray(recorded) ? recorded : [];
  if (rows.length) return rows;
  const vid = String(videoId || '').trim();
  if (!vid || !cardWrap || typeof cardWrap !== 'object') return rows;
  const key = String(cardWrap.identityKey || cardWrap.videoId || '').trim();
  if (key !== vid) return rows;
  const vr = cardWrap.card && Array.isArray(cardWrap.card.videoRows) ? cardWrap.card.videoRows : [];
  return vr.length ? vr : rows;
}

/**
 * v0.1.2263: 記録の行が無いとき、置き場にあるどの動画のカード(YouTube・録画/動画のサービス)でも、鍵の合うカードの行を使う。
 *   background(会場の頼み)と横の欄・書き出し(shim)が同じこの1つを使う。
 * @param {readonly any[] | null | undefined} recorded
 * @param {readonly any[]} cardWraps 置き場の値の並び(無いものは null)
 * @param {string} videoId 配信・録画・動画の鍵
 * @param {string} [contentKind]
 * @returns {any[]}
 */
export function recordedRowsOrAnyVideoCardRows(recorded, cardWraps, videoId, contentKind = '') {
  const rows = Array.isArray(recorded) ? recorded : [];
  if (contentKind === 'live' || contentKind === 'live_replay' || (rows.length && contentKind !== 'video')) return rows;
  const vid = String(videoId || '').trim();
  const list = Array.isArray(cardWraps) ? cardWraps : [];
  for (const w of list) {
    const got = recordedRowsOrVideoRows([], w, vid);
    if (got.length) return got;
  }
  return contentKind === 'video' ? [] : rows;
}
