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

// 2026-07-16: pbVarint は最大56ビット(≈7.2×10^16)まで蓄積を許すため、パース位置が
//   ずれて本来のフィールドでないゴミバイト列を varint 解釈すると巨大な値になりうる
//   (実機で giftPoints=21,775,806,936,812,300 のような値が観測された)。ニコニコ生放送の
//   実際の制度上ありえない桁を弾く上限(10億pt・実際の最高額イベントの想定を大きく上回る余裕値)。
const STATISTICS_POINTS_SANITY_MAX = 1_000_000_000;

/** @param {number|null} v @returns {number|null} */
function clampStatisticsPoints(v) {
  return typeof v === 'number' && v > STATISTICS_POINTS_SANITY_MAX ? null : v;
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
    adPoints: clampStatisticsPoints(adPoints),
    giftPoints: clampStatisticsPoints(giftPoints),
    eventGiftScore,
    eventRank,
    eventTitle
  };
}

/**
 * @typedef {{ no: number|null, rawUserId: number|null, hashedUserId: string, name: string, content: string, vpos: number|null, accountStatus: number|null, is184: boolean }} NdgrChat
 *
 * @typedef {{
 *   itemId: string,
 *   advertiserUserId: string,
 *   advertiserName: string,
 *   point: number|null,
 *   message: string,
 *   itemName: string,
 *   contributionRank: number|null
 * }} NdgrGift
 *
 * proto schema (n-air-app/nicolive-comment-protobuf, atoms.proto):
 *   1: item_id (string)             — "stamp_xxx" / "ball_basketball" 等
 *   2: advertiser_user_id (optional int64) — 文字列化して保持。anonymous gift では空
 *   3: advertiser_name (string)
 *   4: point (int64)
 *   5: message (string)
 *   6: item_name (string)            — 表示名（"バスケットボール" 等）
 *   7: contribution_rank (optional int32) — 貢献ランキング順位
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

/** 匿名(184)コメントの hashedUserId が満たす ID 形式。gift の item_name(日本語)を弾く。 */
const NDGR_HASHED_USER_ID_RE = /^[a-zA-Z0-9_:-]{8,}$/;

/**
 * v0.1.803(星野ロミ式最大化): decode した NDGR chat を「表示できるコメント」として
 *   採用してよいかの判定（純関数・コンポーネントファクタリング）。
 *
 * 旧実装は `chat.no != null`(コメント番号)が無いと丸ごと捨てていた。だが匿名(184)
 *   コメントは no を持たず content/rawUserId/hashedUserId は持っている。捨てると
 *   userId が失われ、コメントは DOM(visible)でしか拾えず userId 無し → レーン
 *   (userLaneCandidatesFromStorage は userId 必須)に乗らない → 会場/レーンが空。
 *   = 「元からあるデータ(届いている userId 付き chat)を活かせていない」退化。
 *
 * 採用条件:
 *   - `no != null` なら従来どおり採用（コメント番号がある=確実な chat）。
 *   - no が無い場合は「content が非空 かつ userId(rawUserId/hashedUserId)を持つ」
 *     ときだけ採用する。これが匿名(184)コメント。
 *
 * ⚠️ なぜ no 無しで userId 必須か(司令塔の裏取り):
 *   NDGR の gift は msg.1 に Gift 構造(fn=1=item_id 文字列)で乗ることがあり、
 *   decodeChat に通すと item_id が content(fn=1)として読まれて「content 非空」を
 *   すり抜ける。だが gift payload は rawUserId(fn=5)を持たない。item_name(fn=6)は
 *   decodeChat が【無検証で】hashedUserId に入れてしまう(decodeChat:236 は fn=6 を
 *   そのまま代入し、ID 形式の正規表現検証は fn=9〜15 のフォールバック経路にしか
 *   無い)ため、「バスケットボール」のような日本語 item_name が hashedUserId に
 *   化けて userId 有りに見える。よってここで hashedUserId を【ID 形式
 *   (^[a-zA-Z0-9_:-]{8,}$)のときだけ】userId とみなし、日本語 item_name を弾く。
 *   これで gift を chat と誤認せず gift fallback へ正しく流せる(v0.1.210 の gift
 *   fallback を壊さない)。真の匿名コメントの hashedUserId は ID 形式なので採用
 *   される。ギフトコメント形式(「〜さんがギフト〜」等)の本文除外は記録変換側
 *   (ndgrChatsToMergeRows = parseGiftCommentText)に委ねる。
 *
 * @param {Pick<NdgrChat, 'no' | 'content' | 'rawUserId' | 'hashedUserId'>} chat
 * @returns {boolean}
 */
export function shouldAcceptNdgrChatAsComment(chat) {
  if (!chat) return false;
  if (chat.no != null) return true;
  if (String(chat.content || '').trim().length === 0) return false;
  const hasRawUserId = chat.rawUserId != null && chat.rawUserId !== 0;
  const hashed = String(chat.hashedUserId || '').trim();
  // hashedUserId は ID 形式のときだけ信用(gift の item_name 日本語混入を弾く)。
  const hasHashedUserId = NDGR_HASHED_USER_ID_RE.test(hashed);
  return hasRawUserId || hasHashedUserId;
}

/**
 * v0.1.211: msg.24 の "nx:gift:show" event を decode する純関数。
 *
 * 実機 lv350472558 で観測された構造:
 *   fn=1 LEN: eventType ("nx:gift:show" 等)
 *   fn=5 LEN: payload (map 形式)
 *     fn=1 LEN repeated: { fn=1=key (string), fn=2=value (double LEN9 or string LEN) }
 *
 * 主要 props:
 *   - advertiserName: "名無し" 等の送り主名
 *   - adPoint: 5 (double, ギフトポイント)
 *   - totalAdPoint: 累計
 *   - itemId / itemName: 場合により含まれる
 *
 * @param {Uint8Array} buf
 * @param {number} start
 * @param {number} end
 * @returns {{ eventType: string, props: Record<string, string|number> }}
 */
export function decodeNxGiftEvent(buf, start, end) {
  let eventType = '';
  /** @type {Record<string, string|number>} */
  const props = {};
  pbForEach(buf, start, end, (fn, wt, _v, s, e) => {
    if (fn === 1 && wt === 2) {
      if (!eventType) eventType = decodeStr(buf, s, e);
    } else if (fn === 5 && wt === 2) {
      pbForEach(buf, s, e, (mfn, mwt, _mv, ms, me) => {
        if (mfn !== 1 || mwt !== 2) return;
        let key = '';
        /** @type {number|null} */
        let numVal = null;
        let strVal = '';
        pbForEach(buf, ms, me, (ifn, iwt, _iv, is, ie) => {
          if (ifn === 1 && iwt === 2) {
            if (!key) key = decodeStr(buf, is, ie);
          } else if (ifn === 2 && iwt === 2) {
            const len = ie - is;
            let parsedValueWrapper = false;
            // google.protobuf.Value: number_value = field 2 (wire 1 double), string_value = field 3.
            // 先に protobuf field として読む。string_value が 6 UTF-8 bytes の場合、
            // tag + len + payload で全体 8 bytes になり raw double heuristic と衝突する。
            pbForEach(buf, is, ie, (vfn, vwt, vv, vs, ve) => {
              if (vfn === 2 && vwt === 1 && ve - vs === 8) {
                try {
                  const view = new DataView(
                    buf.buffer,
                    buf.byteOffset + vs,
                    8
                  );
                  const v = view.getFloat64(0, true);
                  if (Number.isFinite(v)) {
                    numVal = v;
                    parsedValueWrapper = true;
                  }
                } catch { /* no-op */ }
              } else if (vfn === 3 && vwt === 2) {
                const inner = decodeStr(buf, vs, ve);
                if (inner && !strVal) {
                  strVal = inner;
                  parsedValueWrapper = true;
                }
              } else if (vfn === 4 && vwt === 0 && vv != null) {
                strVal = vv ? 'true' : 'false';
                parsedValueWrapper = true;
              }
            });
            if (!parsedValueWrapper && len === 9 && buf[is] === 0x11) {
              // 旧観測: wrapper struct { fn=2 LEN: 0x11 + 8 byte float64 }
              try {
                const view = new DataView(
                  buf.buffer,
                  buf.byteOffset + is + 1,
                  8
                );
                const v = view.getFloat64(0, true);
                if (Number.isFinite(v)) numVal = v;
              } catch { /* no-op */ }
            }
          } else if (ifn === 2 && iwt === 0 && _iv != null) {
            // v0.1.233: google.protobuf.Value wrapper を経由せず raw varint で
            //   入って来るパスへの safety net（ニコ生 ext 側が int 型を直接
            //   送るレガシー観測がある場合に拾う）。
            if (numVal == null) numVal = Number(_iv);
          } else if (ifn === 2 && iwt === 1 && ie - is === 8) {
            // v0.1.233: 同上、raw fixed64 直送りパス
            if (numVal == null) {
              try {
                const view = new DataView(
                  buf.buffer,
                  buf.byteOffset + is,
                  8
                );
                const v = view.getFloat64(0, true);
                if (Number.isFinite(v)) numVal = v;
              } catch { /* no-op */ }
            }
          }
        });
        if (key) {
          if (numVal != null) props[key] = numVal;
          else if (strVal) props[key] = strVal;
        }
      });
    }
  });
  return { eventType, props };
}

/**
 * NicoliveMessage oneof の Gift（field 8）を proto 原本準拠でデコードする。
 *
 * proto schema は NdgrGift 型定義の docstring を参照。
 * codex の web 調査（2026-05-07、n-air-app/nicolive-comment-protobuf
 * atoms.proto blob 3edaa1b 確認）で、過去の経験的 decoder（fn=1 を string
 * userId と仮定し fn=2 を name と仮定する設計）が proto 仕様と齟齬していた
 * ことが判明したため、本書き直しで proto 原本に整合させた。
 *
 * @param {Uint8Array} buf
 * @param {number} start
 * @param {number} end
 * @returns {NdgrGift}
 */
export function decodeGift(buf, start, end) {
  let itemId = '';
  let advertiserUserId = '';
  let advertiserName = '';
  /** @type {number|null} */
  let point = null;
  let message = '';
  let itemName = '';
  /** @type {number|null} */
  let contributionRank = null;
  pbForEach(buf, start, end, (fn, wt, val, s, e) => {
    if (fn === 1 && wt === 2) {
      if (!itemId) itemId = decodeStr(buf, s, e);
    } else if (fn === 2 && wt === 0 && val != null) {
      // proto: optional int64. JS の number 安全範囲を超えうるので文字列化して保持。
      if (!advertiserUserId) advertiserUserId = String(val);
    } else if (fn === 3 && wt === 2) {
      if (!advertiserName) advertiserName = decodeStr(buf, s, e);
    } else if (fn === 4 && wt === 0 && val != null) {
      if (point == null) point = val;
    } else if (fn === 5 && wt === 2) {
      if (!message) message = decodeStr(buf, s, e);
    } else if (fn === 6 && wt === 2) {
      if (!itemName) itemName = decodeStr(buf, s, e);
    } else if (fn === 7 && wt === 0 && val != null) {
      if (contributionRank == null) contributionRank = val;
    }
  });
  return { itemId, advertiserUserId, advertiserName, point, message, itemName, contributionRank };
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
 * @typedef {{
 *   key: string,
 *   topFn: number,
 *   msgFn: number|null,
 *   byteSize: number,
 *   hexPreview: string,
 *   innerHistogram: Record<string, number>,
 *   stringSamples: string[],
 *   propsKeyNames?: string[]
 * }} NdgrUnknownSample
 *
 * v0.1.209 緊急投入: msg.8 (gift) が来ない一方で msg.3 / top.11 が来る配信が確認された
 * （実機 lv350473936、giftPoints=3130 だが ndgrWireCounters.gifts=0）。proto 仕様か
 * ニコニコ側プロトコル差し替えで gift event の field 番号が変わっている可能性が
 * 強いため、未知 field の中身を最大 3 件サンプル保存して、診断バンドル経由で
 * 構造を解析する用途。
 *
 * - `key`: "top:11" or "msg:3" 等の識別子
 * - `topFn`: ChunkedMessage 直下の field number
 * - `msgFn`: NicoliveMessage 内の field number（top レベルのみなら null）
 * - `byteSize`: payload バイト長
 * - `hexPreview`: 先頭 96 bytes の hex 文字列（中身解析の手がかり）
 * - `innerHistogram`: 中の field tag → 件数（gift の itemId/userId/point 等の構造識別用）
 * - `stringSamples`: 中の string 型 field の最初 3 件（advertiserName 等の判別用）
 * - `propsKeyNames`: v0.1.235 追加。msg:24 nx:gift:show の `decodeNxGiftEvent` 戻り値の
 *   props キー名一覧（最大 16 件）。`pickNxGiftString` 候補リストと実機 wire の
 *   キー名が乖離していないか診断するため。partial empty (`msg:24:noitem` 等) の
 *   サンプルにのみ含まれ、未知 field 系のサンプルでは省略される。
 */

/**
 * @typedef {{
 *   stats: NdgrStatistics|null,
 *   chats: NdgrChat[],
 *   gifts: NdgrGift[],
 *   tagHistogram: NdgrTagHistogram,
 *   unknownSamples: Record<string, NdgrUnknownSample[]>
 * }} NdgrDecodeResult
 */

const NDGR_KNOWN_TOP_FN = new Set([1, 2, 4, 5]);
// v0.1.211: 真因確定後に known set を更新。1=Chat、8=Gift（proto 原本）、
// 20=Chat (legacy)、24=NxGiftEvent (msg.24 nx:gift:show)。残り (2, 3, 23 等)
// は引き続き unknownSamples で観測継続。
const NDGR_KNOWN_MSG_FN = new Set([1, 8, 20, 24]);
const NDGR_MAX_UNKNOWN_SAMPLES_PER_KEY = 3;

/**
 * v0.1.211: false positive を生む item_id を判定（"nx:" / "system:" prefix）。
 * msg.24 の "nx:gift:show" 等の event type 文字列が item_id に紛れ込むのを防ぐ。
 * @param {string} itemId
 * @returns {boolean}
 */
function isFalsePositiveItemId(itemId) {
  if (!itemId) return false;
  const s = String(itemId).trim();
  if (s.startsWith('nx:')) return true;
  if (s.startsWith('system:')) return true;
  if (s.startsWith('event:')) return true;
  return false;
}

/**
 * v0.1.233: ニコニコの gift item_id は ASCII 英数 + `_` `-` の slug 形式
 * （`stamp_xxx` / `ball_basketball` / `heart` 等、proto schema と OSS 観測）。
 * 一方 chat content（「草」「kwsk」「???????????」等の任意テキスト）が
 * decodeChat で拾えない（chat.no が null）ときに decodeGift 側で itemId と
 * 誤認されると、popup ギフトサマリで偽陽性を量産する。
 *
 * 実機 lv350481542 / lv350482510 で `gifts: 91 〜 266` のうち
 * `giftsWith{Uid,Point,Rank} = 0` という偏りが観測されており、これらは
 * msg.1/20/その他経路で chat 本文を itemId と誤って拾っているケースが大半と
 * 推測される（v0.1.222 の研究レポート所見と整合）。
 *
 * 本判定は item_id 形式の strictness を上げて、ASCII slug かつ 3-80 文字の
 * もののみを gift item_id として採用する。実 gift item_id は確実に通過し、
 * chat 本文や URL 断片は弾かれる。
 *
 * @param {string|null|undefined} itemId
 * @returns {boolean}
 */
function looksLikeValidGiftItemId(itemId) {
  if (!itemId) return false;
  const s = String(itemId).trim();
  if (!s) return false;
  if (isFalsePositiveItemId(s)) return false;
  // ASCII 英数 + `_` `-`、先頭は英字、3〜80 文字
  return /^[a-zA-Z][a-zA-Z0-9_-]{2,79}$/.test(s);
}

/**
 * @param {Record<string, string|number>} props
 * @param {string[]} keys
 * @returns {string}
 */
function pickNxGiftString(props, keys) {
  for (const key of keys) {
    const value = props[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

/**
 * @param {Record<string, string|number>} props
 * @param {string[]} keys
 * @returns {number|null}
 */
function pickNxGiftNumber(props, keys) {
  for (const key of keys) {
    const value = props[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const normalized = value.replace(/,/g, '').trim();
      if (!normalized) continue;
      const n = Number(normalized);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * Uint8Array の指定範囲を hex 文字列に変換
 * @param {Uint8Array} buf
 * @param {number} start
 * @param {number} end
 */
function bufToHex(buf, start, end) {
  let out = '';
  const cap = Math.min(end, buf.length);
  for (let i = start; i < cap; i++) {
    out += buf[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * 未知 field の中身を sample 保存する内部ヘルパー（最大 3 件 / key）
 * @param {Record<string, NdgrUnknownSample[]>} samples
 * @param {string} key
 * @param {number} topFn
 * @param {number|null} msgFn
 * @param {Uint8Array} buf
 * @param {number} s
 * @param {number} e
 * @param {string[]} [propsKeyNames] v0.1.235: msg:24 nx:gift:show 系で
 *   `decodeNxGiftEvent` の戻り値の props キー名一覧。pickNxGiftString の
 *   候補リストと実機 wire のキー名が乖離していないか診断用。最大 16 件
 *   までサンプルに格納する。
 */
function recordNdgrUnknownSample(samples, key, topFn, msgFn, buf, s, e, propsKeyNames) {
  if (!samples[key]) samples[key] = [];
  if (samples[key].length >= NDGR_MAX_UNKNOWN_SAMPLES_PER_KEY) return;
  /** @type {Record<string, number>} */
  const innerHistogram = {};
  /** @type {string[]} */
  const stringSamples = [];
  pbForEach(buf, s, e, (ifn, iwt, _iv, is, ie) => {
    const ikey = String(ifn);
    innerHistogram[ikey] = (innerHistogram[ikey] || 0) + 1;
    if (iwt === 2 && stringSamples.length < 3) {
      const str = decodeStr(buf, is, ie);
      if (str && str.length > 0 && str.length <= 80) {
        stringSamples.push(str);
      }
    }
  });
  /** @type {NdgrUnknownSample} */
  const sample = {
    key,
    topFn,
    msgFn,
    byteSize: e - s,
    hexPreview: bufToHex(buf, s, Math.min(e, s + 96)),
    innerHistogram,
    stringSamples
  };
  if (Array.isArray(propsKeyNames) && propsKeyNames.length > 0) {
    sample.propsKeyNames = propsKeyNames.slice(0, 16);
  }
  samples[key].push(sample);
}

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
  /** @type {Record<string, NdgrUnknownSample[]>} */
  const unknownSamples = {};

  pbForEach(buf, s0, e0, (fn, wt, _v, s, e) => {
    if (wt !== 2) return;
    const topKey = String(fn);
    tagHistogram.top[topKey] = (tagHistogram.top[topKey] || 0) + 1;

    // v0.1.209: top レベルで未知 field が来た場合に中身を sample 保存
    if (!NDGR_KNOWN_TOP_FN.has(fn)) {
      recordNdgrUnknownSample(
        unknownSamples,
        `top:${fn}`,
        fn,
        null,
        buf,
        s,
        e
      );
    }

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
    // chat/gift デコーダ側で構造的に validate 済みなので、見当違いの payload を
    // 踏んでも偽陽性は出ない。
    if (fn === 1 || fn === 2) {
      pbForEach(buf, s, e, (mfn, mwt, _mv, ms, me) => {
        if (mwt !== 2) return;
        const msgKey = String(mfn);
        tagHistogram.msg[msgKey] = (tagHistogram.msg[msgKey] || 0) + 1;

        // v0.1.209: msg レベルで未知 field が来た場合に中身を sample 保存
        if (!NDGR_KNOWN_MSG_FN.has(mfn)) {
          recordNdgrUnknownSample(
            unknownSamples,
            `msg:${mfn}`,
            fn,
            mfn,
            buf,
            ms,
            me
          );
        }

        if (mfn === 1 || mfn === 20) {
          const chat = decodeChat(buf, ms, me);
          // v0.1.803(星野ロミ式最大化): no が無くても content があれば採用し、
          //   userId 付き匿名(184)コメントを捨てずレーンへ活かす。判定は
          //   shouldAcceptNdgrChatAsComment(純関数・テスト済)に一元化。
          if (shouldAcceptNdgrChatAsComment(chat)) {
            chats.push(chat);
          } else {
            // chat として採用しない場合のみ gift として fallback 試行。
            // v0.1.210: chat 失敗時は gift として fallback 試行。
            // v0.1.211: false positive 抑制のため "nx:" / "system:" prefix を除外。
            // v0.1.233: 判定を looksLikeValidGiftItemId に強化。chat 本文（日本語等）が
            //   itemId と誤認されて gift 偽陽性を量産していた問題に対応。
            const g = decodeGift(buf, ms, me);
            if (looksLikeValidGiftItemId(g.itemId)) {
              gifts.push(g);
            }
          }
        } else if (mfn === 8) {
          const g = decodeGift(buf, ms, me);
          // anonymous gift（advertiser_user_id 欠落）でも item_id / advertiser_name
          // / point / item_name / contribution_rank のいずれかが取れていれば valid。
          if (
            g.itemId ||
            g.advertiserUserId ||
            g.advertiserName ||
            g.itemName ||
            g.point != null ||
            g.contributionRank != null
          ) {
            gifts.push(g);
          }
        } else if (mfn === 24) {
          // v0.1.211: msg.24 の "nx:gift:show" 系を専用 decoder で処理。
          // 実機で 99 件来ていたが、これは map 形式の event payload で、
          // proto 原本の Gift 構造とは異なる。
          const ev = decodeNxGiftEvent(buf, ms, me);
          if (ev.eventType === 'nx:gift:show') {
            const advName = pickNxGiftString(ev.props, [
              'advertiserName',
              'advertiser_name',
              'senderName',
              'sender_name',
              'userName',
              'user_name',
              'nickname',
              'name'
            ]);
            const advUid = pickNxGiftString(ev.props, [
              'advertiserUserId',
              'advertiser_user_id',
              'senderUserId',
              'sender_user_id',
              'rawUserId',
              'raw_user_id',
              'userId',
              'user_id'
            ]);
            const itemIdStr = pickNxGiftString(ev.props, [
              'itemId',
              'item_id',
              'giftItemId',
              'gift_item_id'
            ]);
            const itemNameStr = pickNxGiftString(ev.props, [
              'itemName',
              'item_name',
              'giftName',
              'gift_name'
            ]);
            const point = pickNxGiftNumber(ev.props, [
              'adPoint',
              'ad_point',
              'point',
              'points',
              'giftPoint',
              'gift_point',
              'itemPoint',
              'item_point'
            ]);
            const contributionRank = pickNxGiftNumber(ev.props, [
              'contributionRank',
              'contribution_rank',
              'rank'
            ]);
            if (advName || advUid || itemIdStr || itemNameStr || point != null || contributionRank != null) {
              gifts.push({
                itemId: itemIdStr,
                advertiserUserId: advUid,
                advertiserName: advName,
                point,
                message: '',
                itemName: itemNameStr,
                contributionRank
              });
              // v0.1.235: push 成功（=name か point か何かは取れた）でも、
              //   実機では itemId/itemName/uid/rank が部分欠落するケースが多い
              //   （診断 lv350482067: gifts=10 だが giftsWithItem=5/giftsWithUid=4/
              //   giftsWithRank=0）。`pickNxGiftString` の候補リストと実機 wire の
              //   キー名が乖離している可能性を診断するため、欠落カテゴリ別に
              //   hex + props キー名一覧をサンプル保存する。挙動変更ゼロ。
              const propsKeyNames = Object.keys(ev.props);
              if (!itemIdStr && !itemNameStr) {
                recordNdgrUnknownSample(
                  unknownSamples,
                  'msg:24:noitem',
                  fn,
                  mfn,
                  buf,
                  ms,
                  me,
                  propsKeyNames
                );
              }
              if (!advUid) {
                recordNdgrUnknownSample(
                  unknownSamples,
                  'msg:24:nouid',
                  fn,
                  mfn,
                  buf,
                  ms,
                  me,
                  propsKeyNames
                );
              }
              if (contributionRank == null) {
                recordNdgrUnknownSample(
                  unknownSamples,
                  'msg:24:norank',
                  fn,
                  mfn,
                  buf,
                  ms,
                  me,
                  propsKeyNames
                );
              }
            } else {
              // v0.1.233: msg.24 nx:gift:show を decode したが gift fields が
              //   全部空で push できなかった = 想定外 wire 形式の可能性が高い。
              //   実機の hex sample を unknownSamples に「msg:24:empty」として
              //   保存し、診断 JSON 経由で wire 構造を解析する用途。
              // v0.1.235: empty 時も props キー名（あれば）を残して、Vue 側が
              //   キー名を完全に変えたケースとペイロード自体が空のケースを切り分ける。
              recordNdgrUnknownSample(
                unknownSamples,
                'msg:24:empty',
                fn,
                mfn,
                buf,
                ms,
                me,
                Object.keys(ev.props)
              );
            }
          }
        } else {
          // v0.1.210: msg.2/3/その他 でも gift として試す
          // v0.1.211: false positive 抑制のため "nx:" / "system:" prefix を除外
          // v0.1.233: 判定を looksLikeValidGiftItemId に強化（chat 本文 false positive 対策）
          const g = decodeGift(buf, ms, me);
          if (looksLikeValidGiftItemId(g.itemId)) {
            gifts.push(g);
          }
        }
      });
    }
  });

  return { stats, chats, gifts, tagHistogram, unknownSamples };
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

/**
 * Backward API（`/data/backward/v4/...`）の応答をデコードする。
 *
 * ⭐ 過去ログ全件遡及の核心（2026-05-27 OSS 3実装=NDGRClient/NdgrClientSharp/
 *   rinsuki-lab で確定。詳細は memory reference_ndgr_backward_packedsegment_protocol）。
 *   Backward API の応答は **単一の PackedSegment**（View/segment と違い length-delimited
 *   stream ではなく body 全体が 1 メッセージ）:
 *     PackedSegment {
 *       repeated ChunkedMessage messages = 1;   // ← コメント本体（インライン）
 *       Next { string uri = 1 } next = 2;        // ← 次に古い backward URI（無ければ配信開始）
 *       StateSnapshot snapshot = 3;              // 状態（コメントではない・無視）
 *     }
 *   旧実装は backward 応答を decodeChunkedEntry（path 分類）で誤解釈し、別 segment fetch を
 *   試みて chat を 0 件しか拾えず、数ホップで backward_exhausted していた。本関数で
 *   messages をインライン抽出し next.uri で連鎖するのが正解。
 *
 * @param {Uint8Array} buf Backward API 応答の body 全体。
 * @param {number} [start] 解析開始オフセット（既定 0）。
 * @param {number} [end] 解析終了オフセット（既定 buf.length）。
 * @returns {{ results: NdgrDecodeResult[], nextUri: string }}
 *   results = 各 ChunkedMessage のデコード結果（chats を含む）。
 *   nextUri = 次に古い backward URI（`/data/backward/v4/...`）。無ければ ''（配信開始）。
 */
export function decodePackedSegmentNav(buf, start, end) {
  const s0 = start ?? 0;
  const e0 = end ?? buf.length;
  /** @type {NdgrDecodeResult[]} */
  const results = [];
  let nextUri = '';
  pbForEach(buf, s0, e0, (fn, wt, _v, s, e) => {
    if (wt !== 2) return;
    if (fn === 1) {
      // messages: repeated ChunkedMessage（コメント本体）。
      results.push(decodeChunkedMessage(buf, s, e));
      return;
    }
    if (fn === 2 && !nextUri) {
      // next: Next{ string uri = 1 }。内側 field1 の文字列を取り出す。
      pbForEach(buf, s, e, (ifn, iwt, _iv, is, ie) => {
        if (ifn === 1 && iwt === 2 && !nextUri) {
          const u = decodeStr(buf, is, ie);
          if (/^https?:\/\//.test(u)) nextUri = u;
        }
      });
    }
    // fn === 3（snapshot）は状態スナップショットなので無視。
  });
  return { results, nextUri };
}

/**
 * NDGR ChunkedEntry（`/api/view/v4/:view?at={unixtime}` の応答）から、過去ログ
 * バックフィルの巡回に必要な URI と long-poll ポインタを抽出する。
 *
 * ChunkedEntry は oneof:
 *   backward (BackwardSegment.segment.uri … さらに過去へ辿るポインタ)
 *   previous (同上・古い経路)
 *   segment  (MessageSegment.uri … その時刻のコメント本体 = ChunkedMessage stream)
 *   next     (ReadyForNext.at … 次にポーリングすべき unixtime)
 *   snapshot (Snapshot.uri … 視聴者数等のスナップショット)
 *
 * ⚠️ niconico は NDGR の field 番号を過去に何度も差し替えている（decodeGift の
 *   v0.1.209/211/233 の経緯参照）。そこで本デコーダは field 番号に依存せず、
 *   「length-delimited 値の中に現れる NDGR URI 文字列を再帰的に拾い、URL の path で
 *   分類する」防御的方式を採る。これにより oneof の field 番号が変わっても壊れない。
 *   `next.at`（long-poll ポインタ）だけは varint なので、URI を持つ message 以外の
 *   トップレベル varint をベストエフォートで拾う。
 *
 * ⭐ v0.1.406: 実機ヘッドフルで「取り込み0件」の真因が判明し対処。NDGR の `?at=` 応答は
 *   **length-delimited stream**（`[varint長][ChunkedEntry][varint長][ChunkedEntry]…`）であり、
 *   バッファ先頭は protobuf の field tag ではなく「最初のフレームの長さ varint」。旧実装は
 *   バッファを offset 0 から単一の bare message として `pbForEach` していたため、長さ varint
 *   （例 357=`e5 02`）を tag(field44,wt5) と誤読し pbForEach が即 break → URI を1つも拾えず
 *   `backward_exhausted seg=0` で巡回が即終了していた（RT 側は createLengthDelimitedStream-
 *   Accumulator でデフレーム済なのに backfill 巡回だけ抜けていた非対称）。
 *   そこで本関数は **(1) バッファ全体を bare message として walk（旧来・テストフィクスチャ
 *   や単一メッセージ応答との後方互換）+ (2) length-delimited フレームに分割して各フレームを
 *   walk** の両方を行い結果を union する。`classify()` は厳格に NDGR URI path のみ採用するため、
 *   bare 応答をフレーム誤分割しても偽 URI は混入しない（両方式の安全な重ね掛け）。
 *
 * @typedef {{
 *   backwardUri: string,
 *   segmentUris: string[],
 *   previousUris: string[],
 *   snapshotUri: string,
 *   nextAt: number|null
 * }} NdgrChunkedEntryNav
 *
 * @param {Uint8Array} buf
 * @param {number} [start]
 * @param {number} [end]
 * @returns {NdgrChunkedEntryNav}
 */
export function decodeChunkedEntry(buf, start, end) {
  const s0 = start ?? 0;
  const e0 = end ?? buf.length;
  /** @type {NdgrChunkedEntryNav} */
  const nav = {
    backwardUri: '',
    segmentUris: [],
    previousUris: [],
    snapshotUri: '',
    nextAt: null
  };

  // NDGR の view/segment/backward/snapshot URI かを path で判定（host は mpn.live 等で
  // 変わり得るので host には依存しない）。
  /** @param {string} u */
  const classify = (u) => {
    const s = String(u || '');
    if (!/^https?:\/\//.test(s)) return null;
    if (/\/data\/backward\/v\d\//.test(s)) return 'backward';
    if (/\/data\/segment\/v\d\//.test(s)) return 'segment';
    if (/\/data\/snapshot\/v\d\//.test(s)) return 'snapshot';
    if (/\/api\/view\/v\d\//.test(s)) return 'view';
    return null;
  };

  // 再帰的に length-delimited 値を掘り、URI 文字列を分類して集める。
  // ループ・暴走防止に深さ上限を設ける（ChunkedEntry は浅いネスト）。
  //
  // v0.1.457 previous 回収: ChunkedEntry の `segment`(field1=ライブ edge) と
  //   `previous`(field3=直近過去) は同じ MessageSegment 型・同じ /data/segment/v4/ path で
  //   path 分類だけでは区別できない。そこで「ChunkedEntry 直下の field 番号」を再帰に伝播し
  //   （entryField）、その配下で見つかった segment URI を field3 由来なら previousUris、
  //   それ以外（field1=ライブ edge 等）は従来どおり segmentUris に振り分ける。判定不能
  //   （entryField 不明）なら安全側で segmentUris にフォールバック（後方互換）。
  /**
   * @param {number} s
   * @param {number} e
   * @param {number} depth
   * @param {number|null} entryField この walk が属する ChunkedEntry 直下の field 番号。
   *   トップレベル（ChunkedEntry そのものを walk 中）は null。再帰で MessageSegment へ
   *   降りるときに、その MessageSegment が紐づく ChunkedEntry field（1=segment/3=previous）を渡す。
   */
  const walk = (s, e, depth, entryField) => {
    if (depth > 6) return;
    pbForEach(buf, s, e, (fn, wt, val, fs, fe) => {
      if (wt === 0) {
        // ベストエフォートで long-poll ポインタ（unixtime/相対値）を拾う。
        // 妥当な範囲の正の整数のみ採用（最初に見つかった 1 個を next.at とする）。
        if (
          nav.nextAt == null &&
          typeof val === 'number' &&
          Number.isFinite(val) &&
          val > 0
        ) {
          nav.nextAt = val;
        }
        return;
      }
      if (wt !== 2) return;
      const str = decodeStr(buf, fs, fe);
      const kind = classify(str);
      if (kind === 'backward') {
        if (!nav.backwardUri) nav.backwardUri = str;
        return;
      }
      if (kind === 'segment') {
        // v0.1.457: ChunkedEntry field3（previous）由来の segment URI は previousUris へ。
        //   それ以外（field1=ライブ edge / 判定不能）は従来どおり segmentUris へ。
        if (entryField === 3) {
          if (!nav.previousUris.includes(str)) nav.previousUris.push(str);
        } else if (!nav.segmentUris.includes(str)) {
          nav.segmentUris.push(str);
        }
        return;
      }
      if (kind === 'snapshot') {
        if (!nav.snapshotUri) nav.snapshotUri = str;
        return;
      }
      // URI でなければ、ネストした message の可能性があるので掘り下げる。
      // 文字列としての妥当性が低い（= バイナリ message っぽい）ものだけ再帰。
      // v0.1.457: トップレベル（entryField==null）から降りるときは、この子の field 番号
      //   （fn）を entryField として伝播する。これにより配下の MessageSegment.uri が
      //   field1（segment）か field3（previous）かを区別できる。既に entryField が
      //   確定している深い階層ではそれを維持する。
      const nextEntryField = entryField == null ? fn : entryField;
      walk(fs, fe, depth + 1, nextEntryField);
    });
  };

  // (1) バッファ全体を bare message として walk（旧来＝単一メッセージ応答・テスト
  //     フィクスチャとの後方互換）。entryField=null（トップレベル＝ChunkedEntry 自身）。
  walk(s0, e0, 0, null);

  // (2) length-delimited stream として各フレームを walk。NDGR の `?at=` 応答はこの
  //     形（`[varint長][ChunkedEntry]…`）で来るため、こちらが実機での主経路。
  //     pbVarint で長さを読み、フレームの絶対オフセット [fStart, fEnd) を walk する
  //     （subarray の byteOffset 計算を避けるため絶対オフセットで処理）。
  let o = s0;
  let guard = 0;
  while (o < e0 && guard < 100_000) {
    guard += 1;
    const lv = pbVarint(buf, o);
    if (!lv) break;
    const fStart = lv[1];
    const fEnd = fStart + lv[0];
    if (lv[0] <= 0 || fEnd > e0) break; // 長さ0 / バッファ超過 = フレーミングでない
    walk(fStart, fEnd, 1, null); // 各フレーム＝1 ChunkedEntry。entryField は直下で確定。
    o = fEnd;
  }

  return nav;
}
