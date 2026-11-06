// ytChatContinuationVideoId.js — チャット欄(/live_chat?continuation=…)の URL から、そのチャットが「どの配信のものか」を読む純関数。
//
// ★なぜ(2026-11-06 りんく実機・v0.1.1901): チャット欄の URL には ?v= が無く、記録係は親のページの URL から動画IDを決めていた。
//   YouTube は別の配信へ移ってもチャット欄が前の配信のまま残ることがあり(ABEMA ニュースのページのチャット欄に
//   石川典行さんの配信のコメントが出続けていた)、そのコメントが「今のページの配信」の記録に入っていた
//   (ABEMA の記録の上位10人が全員 石川さんの配信の人・石川さんの記録にも前の配信の人)。
//   チャット欄の URL の continuation(YouTube の中の印・base64 の入れ子)には、そのチャットの動画IDが入っている
//   (形: 外側 base64 → 中に base64 の文字列 → その中に「0x0a/0x12, 長さ 0x0b, 動画ID 11文字」が2〜3回)。
//   ここで読めた動画IDを、親のページの URL より優先する(読めなければ '' を返し、呼び出し側は今までどおり親の URL を使う)。

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
// 長さ 11(0x0b)の文字列の欄。欄の番号は 1(0x0a)か 2(0x12)。
// eslint-disable-next-line no-control-regex -- 2進の欄の印(0x0a/0x12/0x0b)を探すため
const VID_FIELD_RE = /[\x0a\x12]\x0b([A-Za-z0-9_-]{11})/g;
const B64_RUN_RE = /[A-Za-z0-9+/_-]{16,}={0,2}/g;

/** @param {string} s base64 / base64url @returns {string} 2進の文字列(失敗は '') */
function b64ToBinary(s) {
  try {
    let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (!t) return '';
    // 後ろに次の欄の文字(例 '0')が1文字くっつくと長さが 4n+1 になり読めないので、その1文字を落とす
    if (t.length % 4 === 1) t = t.slice(0, -1);
    while (t.length % 4) t += '=';
    return atob(t);
  } catch {
    return '';
  }
}

/**
 * @param {string} bin
 * @param {Map<string, number>} counts
 */
function countVideoIdFields(bin, counts) {
  VID_FIELD_RE.lastIndex = 0;
  let m;
  while ((m = VID_FIELD_RE.exec(bin))) {
    const id = m[1];
    if (!VIDEO_ID_RE.test(id)) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
}

/**
 * continuation の文字列から動画IDを読む。2回以上出てきた ID だけを信じる(偶然の一致を拾わない)。
 * @param {string} continuation
 * @returns {string} 読めなければ ''
 */
export function ytVideoIdFromChatContinuation(continuation) {
  const outer = b64ToBinary(String(continuation || '').trim());
  if (!outer) return '';
  /** @type {Map<string, number>} */
  const counts = new Map();
  countVideoIdFields(outer, counts);
  B64_RUN_RE.lastIndex = 0;
  let m;
  let runs = 0;
  while ((m = B64_RUN_RE.exec(outer)) && runs < 20) {
    runs += 1;
    // 前後の長さの印などが base64 の文字に見えて混ざることがあるので、頭を 0〜3 文字ずらして読む
    //   (ずれた読みはでたらめな並びになり、2回以上そろって出る ID にはならない)
    /** @type {Map<string, number>} */
    let bestInner = new Map();
    for (let off = 0; off < 4 && off < m[0].length; off += 1) {
      const inner = b64ToBinary(m[0].slice(off));
      if (!inner) continue;
      /** @type {Map<string, number>} */
      const c = new Map();
      countVideoIdFields(inner, c);
      if ([...c.values()].reduce((a, b) => a + b, 0) > [...bestInner.values()].reduce((a, b) => a + b, 0)) bestInner = c;
    }
    for (const [id, n] of bestInner) counts.set(id, (counts.get(id) || 0) + n);
  }
  let best = '';
  let bestN = 0;
  let tie = false;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
      tie = false;
    } else if (n === bestN) tie = true;
  }
  return bestN >= 2 && !tie ? best : '';
}

/**
 * チャット欄の URL(/live_chat?continuation=… ・ /live_chat_replay?continuation=…)から動画IDを読む。
 * ?v= があればそれを使う。チャット欄でなければ ''。
 * @param {string} rawUrl
 * @returns {string}
 */
export function ytVideoIdFromChatFrameUrl(rawUrl) {
  /** @type {URL} */
  let u;
  try {
    u = new URL(String(rawUrl || ''), 'https://www.youtube.com');
  } catch {
    return '';
  }
  if (!u.pathname.startsWith('/live_chat')) return '';
  const v = String(u.searchParams.get('v') || '').trim();
  if (VIDEO_ID_RE.test(v)) return v;
  return ytVideoIdFromChatContinuation(String(u.searchParams.get('continuation') || ''));
}
