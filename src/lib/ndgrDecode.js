/**
 * NDGR (のどぐろ) Protobuf 軽量デコーダー
 *
 * ニコ生メッセージサーバーの Length-Delimited Protobuf Stream から
 * Statistics (同時接続数) と Chat (commentNo + userId) を抽出する。
 *
 * Proto schema reference:
 *   ChunkedMessage.state  (field 4) → NicoliveState.statistics (field 1) → Statistics
 *   ChunkedMessage.message(field 2) → NicoliveMessage.chat     (field 1) → Chat
 *
 * Statistics fields: viewers(1), comments(2), ad_points(3), gift_points(4)
 * 拡張（実バイナル確認中）: field 5/6 を varint、field 7 を UTF-8 文字列として
 * イベント系（累計スコア・順位・タイトル候補）をベストエフォートで拾う。
 * Chat fields: content(1), name(2), vpos(3), account_status(4),
 *              raw_user_id(5), hashed_user_id(6), modifier(7), no(8)
 */

/**
 * @param {Uint8Array} buf
 * @param {number} off
 * @returns {[number, number]|null} [value, nextOffset]
 */
export function pbVarint(buf, off) {
  let v = 0, s = 0;
  for (let i = off; i < buf.length; i++) {
    const b = buf[i];
    v += (b & 0x7f) * (2 ** s);
    s += 7;
    if (!(b & 0x80)) return [v, i + 1];
    if (s > 56) return null;
  }
  return null;
}

/**
 * @callback PbFieldCb
 * @param {number} fieldNum
 * @param {number} wireType  0=varint, 2=LEN
 * @param {number|null} val  varint 値 (wireType===0 の場合)
 * @param {number} start     LEN の開始オフセット (wireType===2 の場合)
 * @param {number} end       LEN の終了オフセット (wireType===2 の場合)
 * @returns {void}
 */

/**
 * @param {Uint8Array} buf
 * @param {number} start
 * @param {number} end
 * @param {PbFieldCb} cb
 */
export function pbForEach(buf, start, end, cb) {
  let o = start;
  while (o < end) {
    const t = pbVarint(buf, o);
    if (!t) break;
    o = t[1];
    const fn = t[0] >>> 3, wt = t[0] & 7;
    if (wt === 0) {
      const v = pbVarint(buf, o);
      if (!v) break;
      cb(fn, 0, v[0], o, v[1]);
      o = v[1];
    } else if (wt === 2) {
      const l = pbVarint(buf, o);
      if (!l) break;
      const s = l[1], e = l[1] + l[0];
      if (e > end) break;
      cb(fn, 2, null, s, e);
      o = e;
    } else if (wt === 1) {
      o += 8;
      if (o > end) break;
    } else if (wt === 5) {
      o += 4;
      if (o > end) break;
    } else {
      break;
    }
  }
}

/**
 * @typedef {{
 *   viewers: number|null,
 *   comments: number|null,
 *   adPoints: number|null,
 *   giftPoints: number|null,
 *   eventGiftScore: number|null,
 *   eventRank: number|null,
 *   eventTitle: string|null
 * }} NdgrStatistics
 */

/**
 * NDGR Statistics に「何かしらのワイヤシグナル」があるか（page-intercept の
 * `_ndgr.stats` カウント用）。viewers が無くても ad/gift/イベントのみの更新を拾う。
 * @param {NdgrStatistics|null|undefined} s
 * @returns {boolean}
 */
export function ndgrStatisticsHasWireSignal(s) {
  if (!s || typeof s !== 'object') return false;
  const nums = [
    s.viewers,
    s.comments,
    s.adPoints,
    s.giftPoints,
    s.eventGiftScore,
    s.eventRank
  ];
  for (const n of nums) {
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return true;
  }
  const t = String(s.eventTitle || '').trim();
  return t.length > 0;
}

/**
 * 同一 ChunkedMessage 内の複数 Statistics LEN をマージする。
 * `b` の非 null フィールドが優先（同一フレーム内の後続サブメッセージがイベント列のみ等）。
 *
 * @param {NdgrStatistics|null|undefined} a
 * @param {NdgrStatistics|null|undefined} b
 * @returns {NdgrStatistics|null}
 */
export function mergeNdgrStatistics(a, b) {
  if (!b) return a ?? null;
  if (!a) return b;
  /** @param {number|null|undefined} x @param {number|null|undefined} y */
  const pickNum = (x, y) =>
    typeof y === 'number' && Number.isFinite(y) && y >= 0 ? y : x ?? null;
  const ta = String(a.eventTitle || '').trim();
  const tb = String(b.eventTitle || '').trim();
  let titleOut = null;
  if (tb && (!ta || tb.length >= ta.length)) titleOut = tb;
  else if (ta) titleOut = ta;
  return {
    viewers: pickNum(a.viewers, b.viewers),
    comments: pickNum(a.comments, b.comments),
    adPoints: pickNum(a.adPoints, b.adPoints),
    giftPoints: pickNum(a.giftPoints, b.giftPoints),
    eventGiftScore: pickNum(a.eventGiftScore, b.eventGiftScore),
    eventRank: pickNum(a.eventRank, b.eventRank),
    eventTitle: titleOut
  };
}

/**
 * @param {Uint8Array} buf
 * @param {number} start
 * @param {number} end
 * @returns {NdgrStatistics}
 */
export function decodeStatistics(buf, start, end) {
  let viewers = null,
    comments = null,
    adPoints = null,
    giftPoints = null;
  let eventGiftScore = null;
  let eventRank = null;
  /** @type {string[]} */
  const titleCandidates = [];
  pbForEach(buf, start, end, (fn, wt, val, s, e) => {
    if (wt === 0) {
      if (fn === 1) viewers = val;
      else if (fn === 2) comments = val;
      else if (fn === 3) adPoints = val;
      else if (fn === 4) giftPoints = val;
      else if (fn === 5) eventGiftScore = val;
      else if (fn === 6) eventRank = val;
    } else if (wt === 2) {
      const str = decodeStr(buf, s, e).trim();
      if (fn === 7 && str) titleCandidates.push(str);
      else if ((fn === 8 || fn === 9) && str) titleCandidates.push(str);
    }
  });
  let eventTitle = null;
  for (const cand of titleCandidates) {
    if (!cand || cand.length > 400 || /^https?:\/\//i.test(cand)) continue;
    if (!eventTitle || cand.length > eventTitle.length) eventTitle = cand;
  }
  return {
    viewers,
    comments,
    adPoints,
    giftPoints,
    eventGiftScore,
    eventRank,
    eventTitle
  };
}

/**
 * @typedef {{ no: number|null, rawUserId: number|null, hashedUserId: string, name: string, content: string, vpos: number|null, accountStatus: number|null, is184: boolean }} NdgrChat
 * @typedef {{ advertiserUserId: string, advertiserName: string }} NdgrGift
 */

const _dec = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: false }) : null;
/** @param {Uint8Array} buf @param {number} s @param {number} e */
function decodeStr(buf, s, e) {
  if (!_dec) return '';
  try { return _dec.decode(buf.subarray(s, e)); } catch { return ''; }
}

/**
 * @param {Uint8Array} buf
 * @param {number} start
 * @param {number} end
 * @returns {NdgrChat}
 */
export function decodeChat(buf, start, end) {
  let no = null, rawUserId = /** @type {number|null} */ (null), hashedUserId = '', name = '', content = '';
  let vpos = /** @type {number|null} */ (null);
  let accountStatus = /** @type {number|null} */ (null);
  let is184 = false;
  pbForEach(buf, start, end, (fn, wt, val, s, e) => {
    if (fn === 8 && wt === 0) no = val;
    if (fn === 5 && wt === 0) rawUserId = val;
    if (fn === 6 && wt === 2) hashedUserId = hashedUserId || decodeStr(buf, s, e);
    if (fn === 2 && wt === 2) name = decodeStr(buf, s, e);
    if (fn === 1 && wt === 2) content = decodeStr(buf, s, e);
    if (fn === 3 && wt === 0) vpos = val;
    if (fn === 4 && wt === 0) accountStatus = val;
    if (fn === 7 && wt === 2) {
      pbForEach(buf, s, e, (mfn, mwt, mval) => {
        if (mfn === 1 && mwt === 0) is184 = Boolean(mval);
      });
    }
    if (wt === 0 && !rawUserId && fn >= 9 && fn <= 15 && val > 10000) rawUserId = val;
    if (wt === 2 && !hashedUserId && fn >= 9 && fn <= 15) {
      const str = decodeStr(buf, s, e);
      if (/^[a-zA-Z0-9_:-]{8,}$/.test(str)) hashedUserId = str;
    }
  });
  return { no, rawUserId, hashedUserId, name, content, vpos, accountStatus, is184 };
}

/**
 * NicoliveMessage oneof の Gift（field 8 想定）を軽量デコード。proto 差異に耐えるため LEN 文字列を走査する。
 *
 * @param {Uint8Array} buf
 * @param {number} start
 * @param {number} end
 * @returns {NdgrGift}
 */
export function decodeGift(buf, start, end) {
  let advertiserUserId = '';
  let advertiserName = '';
  /** @type {string[]} */
  const strs = [];
  pbForEach(buf, start, end, (fn, wt, val, s, e) => {
    if (wt === 2) {
      const str = decodeStr(buf, s, e);
      if (str) strs.push(str);
      if (fn === 2 && str) advertiserName = advertiserName || str;
      if (fn === 1 && str && /^\d{5,14}$/.test(str)) {
        advertiserUserId = advertiserUserId || str;
      }
    } else if (wt === 0 && val != null) {
      const vs = String(val);
      if (/^\d{5,14}$/.test(vs)) advertiserUserId = advertiserUserId || vs;
    }
  });
  for (const str of strs) {
    if (!advertiserUserId && /^\d{5,14}$/.test(str)) advertiserUserId = str;
  }
  if (!advertiserName) {
    for (const str of strs) {
      if (
        str !== advertiserUserId &&
        str.length > 0 &&
        str.length <= 128 &&
        !/^https?:\/\//i.test(str)
      ) {
        advertiserName = str;
        break;
      }
    }
  }
  return { advertiserUserId, advertiserName };
}

/**
 * @typedef {{
 *   top: Record<string, number>,
 *   msg: Record<string, number>
 * }} NdgrTagHistogram
 *
 * - `top`: ChunkedMessage 直下で観測した field tag → 件数
 * - `msg`: 内側の NicoliveMessage（top.fn=2）one-of の field tag → 件数
 *
 * niconico 側がプロトコルを差し替えた時に「どの tag が新規に増えたか」を
 * 0 件のまま居る既存 tag と並べて見るための診断用カウンタ。
 */

/**
 * @typedef {{ stats: NdgrStatistics|null, chats: NdgrChat[], gifts: NdgrGift[], tagHistogram: NdgrTagHistogram }} NdgrDecodeResult
 */

/**
 * 1件の ChunkedMessage をデコードして統計情報とチャットを返す
 * @param {Uint8Array} buf
 * @param {number} [start]
 * @param {number} [end]
 * @returns {NdgrDecodeResult}
 */
export function decodeChunkedMessage(buf, start, end) {
  const s0 = start ?? 0;
  const e0 = end ?? buf.length;
  /** @type {NdgrStatistics|null} */
  let stats = null;
  /** @type {NdgrChat[]} */
  const chats = [];
  /** @type {NdgrGift[]} */
  const gifts = [];
  /** @type {NdgrTagHistogram} */
  const tagHistogram = { top: {}, msg: {} };

  pbForEach(buf, s0, e0, (fn, wt, _v, s, e) => {
    if (wt !== 2) return;
    const topKey = String(fn);
    tagHistogram.top[topKey] = (tagHistogram.top[topKey] || 0) + 1;

    if (fn === 4) {
      pbForEach(buf, s, e, (_sfn, swt, _sv, ss, se) => {
        if (swt === 2) {
          const sub = decodeStatistics(buf, ss, se);
          if (!ndgrStatisticsHasWireSignal(sub)) return;
          stats = mergeNdgrStatistics(stats, sub);
        }
      });
    }

    if (fn === 5) {
      const sub = decodeStatistics(buf, s, e);
      if (ndgrStatisticsHasWireSignal(sub)) {
        stats = mergeNdgrStatistics(stats, sub);
      }
    }

    // top.1 / top.2 とも NicoliveMessage の oneof ラッパとして同じロジックで掘る。
    // niconico の現プロトコルでは大半のメッセージ（chat / gift / system event）が
    // top.1 に乗っており、top.2 は古い経路（残っているが少数）。両方処理しないと
    // ギフトイベントが永遠に 0 件のままになる。
    // chat/gift デコーダ側で構造的に validate 済み（`chat.no != null` /
    // `advertiserUserId || advertiserName`）なので、見当違いの payload を踏んでも
    // 偽陽性は出ない。
    if (fn === 1 || fn === 2) {
      pbForEach(buf, s, e, (mfn, mwt, _mv, ms, me) => {
        if (mwt !== 2) return;
        const msgKey = String(mfn);
        tagHistogram.msg[msgKey] = (tagHistogram.msg[msgKey] || 0) + 1;
        if (mfn === 1 || mfn === 20) {
          const chat = decodeChat(buf, ms, me);
          if (chat.no != null) chats.push(chat);
        } else if (mfn === 8) {
          const g = decodeGift(buf, ms, me);
          if (g.advertiserUserId || g.advertiserName) gifts.push(g);
        }
      });
    }
  });

  return { stats, chats, gifts, tagHistogram };
}

/**
 * PackedSegment (field 1 = repeated ChunkedMessage) をデコード
 * @param {Uint8Array} buf
 * @param {number} [start]
 * @param {number} [end]
 * @returns {NdgrDecodeResult[]}
 */
export function decodePackedSegment(buf, start, end) {
  const s0 = start ?? 0;
  const e0 = end ?? buf.length;
  /** @type {NdgrDecodeResult[]} */
  const results = [];
  pbForEach(buf, s0, e0, (fn, wt, _v, s, e) => {
    if (fn === 1 && wt === 2) {
      results.push(decodeChunkedMessage(buf, s, e));
    }
  });
  return results;
}
