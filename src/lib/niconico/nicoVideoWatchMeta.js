/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】ニコニコ動画の通常動画（sm / so / nm）の URL・再生数・投稿者・読み込み済みコメントの解釈
 * 【この箱に入らないもの】fetch / storage / chrome.* / 新しい Observer / 新しい通信
 * 【書けるstorageキー】なし
 * 【正本宣言】ニコ動の通常動画ページで使うメタの読み方はこのファイル
 */

const VIDEO_ID_RE = /^\/watch\/((?:sm|nm|so)\d+)(?:\/|$)/i;

/**
 * @param {string} href
 * @returns {string} sm123 形式。該当しなければ空文字
 */
export function nicoVideoIdFromUrl(href) {
  let url;
  try {
    url = new URL(String(href || ''));
  } catch {
    return '';
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'nicovideo.jp' && !host.endsWith('.nicovideo.jp')) return '';
  if (host === 'live.nicovideo.jp' || host === 'sp.live.nicovideo.jp') return '';
  const m = (url.pathname || '').match(VIDEO_ID_RE);
  return m ? String(m[1]).toLowerCase() : '';
}

/**
 * @param {string} href
 * @returns {boolean}
 */
export function isNicoVideoWatchUrl(href) {
  return nicoVideoIdFromUrl(href) !== '';
}

/**
 * ページがすでに呼んだコメント取得の URL か（こちらから新しく呼ぶ判定ではない）。
 * @param {string} url
 * @returns {boolean}
 */
export function isNicoVideoNvcommentUrl(url) {
  const s = String(url || '');
  return /nvcomment\.nicovideo\.jp\/v1\/threads/i.test(s);
}

/**
 * ニコニコの数値ユーザー ID か（配信コメントとの照合に使える）。
 * @param {string} id
 * @returns {boolean}
 */
export function isNicoNumericUserId(id) {
  return /^\d{1,16}$/.test(String(id || '').trim());
}

/**
 * JSON-LD の WatchAction だけを再生数とする（WantAction はマイリストなど）。
 * @param {any} ld
 * @returns {number | null}
 */
export function viewCountFromNicoJsonLd(ld) {
  const list = Array.isArray(ld)
    ? ld
    : ld && typeof ld === 'object'
      ? [ld]
      : [];
  for (const item of list) {
    const stats = Array.isArray(item?.interactionStatistic) ? item.interactionStatistic : [];
    for (const st of stats) {
      const typ = String(st?.interactionType || '');
      if (!typ.includes('WatchAction')) continue;
      const n = Number(st?.userInteractionCount);
      if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    }
  }
  return null;
}

/**
 * @param {any} root
 * @returns {any | null}
 */
function findWatchV4Data(root) {
  if (!root || typeof root !== 'object') return null;
  const direct = root?.$watchV4?.data || root?.data?.response?.$watchV4?.data || root?.response?.$watchV4?.data;
  if (direct && typeof direct === 'object') return direct;
  if (root?.video?.count && typeof root.video.count === 'object') return root;
  const data = root?.data;
  if (data && typeof data === 'object') {
    if (data.$watchV4?.data) return data.$watchV4.data;
    if (data.response?.$watchV4?.data) return data.response.$watchV4.data;
    if (data.video?.count) return data;
  }
  return null;
}

/**
 * 視聴データの count.view だけを再生数とする。comment / mylist / like は使わない。
 * @param {any} root
 * @returns {number | null}
 */
export function viewCountFromNicoWatchData(root) {
  const data = findWatchV4Data(root);
  const n = Number(data?.video?.count?.view);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return null;
}

/**
 * @param {any} root
 * @param {any} jsonLd
 * @returns {{
 *   videoId: string,
 *   title: string,
 *   viewCount: number | null,
 *   ownerId: string,
 *   ownerName: string,
 * }}
 */
export function parseNicoVideoWatchMeta(root, jsonLd) {
  const data = findWatchV4Data(root);
  const videoId = String(data?.video?.id || '').trim().toLowerCase();
  const title = String(data?.video?.title || data?.metadata?.jsonLd?.name || '').replace(/\s+/g, ' ').trim();
  const owner = data?.metadata?.jsonLd?.owner || data?.owner || {};
  const ownerId = isNicoNumericUserId(owner?.id) ? String(owner.id).trim() : '';
  const ownerName = String(owner?.name || '').replace(/\s+/g, ' ').trim();
  const viewCount = viewCountFromNicoWatchData(root) ?? viewCountFromNicoJsonLd(jsonLd);
  return {
    videoId: /^(?:sm|nm|so)\d+$/i.test(videoId) ? videoId : '',
    title,
    viewCount,
    ownerId,
    ownerName,
  };
}

/**
 * ページがすでに受け取った nvcomment JSON から、本文を持たない投稿者一覧を作る。
 * owner / easy スレは対象外。同じ人は1人にまとめる。
 * @param {any} json
 * @param {number} [cap]
 * @returns {{ userId: string, name: string, postedAtMs: number, commentCount: number }[]}
 */
export function nicoVideoCommentersFromNvcommentJson(json, cap = 5000) {
  const root = json && typeof json === 'object' ? json : {};
  const threads = Array.isArray(root?.data?.threads)
    ? root.data.threads
    : Array.isArray(root?.threads)
      ? root.threads
      : [];
  const limit = Number.isFinite(Number(cap)) && Number(cap) > 0 ? Math.floor(Number(cap)) : 5000;
  /** @type {Map<string, { userId: string, name: string, postedAtMs: number, commentCount: number }>} */
  const byId = new Map();
  for (const th of threads) {
    const fork = String(th?.fork || th?.forkLabel || '').toLowerCase();
    if (fork === 'owner' || fork === 'easy') continue;
    const comments = Array.isArray(th?.comments) ? th.comments : [];
    for (const c of comments) {
      const userId = String(c?.userId || '').trim();
      if (!userId) continue;
      const postedAtMs = Date.parse(String(c?.postedAt || '')) || Number(c?.postedAtMs) || 0;
      const prev = byId.get(userId);
      if (!prev) {
        byId.set(userId, { userId, name: '', postedAtMs: postedAtMs || 0, commentCount: 1 });
      } else {
        prev.commentCount += 1;
        if (postedAtMs > (prev.postedAtMs || 0)) prev.postedAtMs = postedAtMs;
      }
      if (byId.size >= limit && !prev) break;
    }
  }
  return [...byId.values()];
}

/**
 * 属性に載せる短い形（本文なし）。
 * @param {any} json
 * @returns {string}
 */
export function packNicoVideoCommentersAttr(json) {
  const people = nicoVideoCommentersFromNvcommentJson(json).map((p) => [p.userId, p.postedAtMs, p.commentCount]);
  if (!people.length) return '';
  try {
    return JSON.stringify({ v: 1, p: people });
  } catch {
    return '';
  }
}

/**
 * @param {string} raw
 * @returns {{ userId: string, name: string, postedAtMs: number, commentCount: number }[]}
 */
export function unpackNicoVideoCommentersAttr(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    const rows = Array.isArray(j?.p) ? j.p : [];
    return rows
      .map((row) => {
        const userId = String(Array.isArray(row) ? row[0] : row?.userId || '').trim();
        const postedAtMs = Number(Array.isArray(row) ? row[1] : row?.postedAtMs) || 0;
        const commentCount = Number(Array.isArray(row) ? row[2] : row?.commentCount) || 1;
        return { userId, name: '', postedAtMs, commentCount };
      })
      .filter((p) => p.userId);
  } catch {
    return [];
  }
}

/**
 * コメント欄の DOM に出ている /user/123 や data-user-id だけを読む（通信しない）。
 * @param {{ querySelectorAll?: Function } | null | undefined} root
 * @returns {{ userId: string, name: string, postedAtMs: number, commentCount: number }[]}
 */
export function nicoVideoCommentersFromDomRoot(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  /** @type {Map<string, { userId: string, name: string, postedAtMs: number, commentCount: number }>} */
  const byId = new Map();
  const add = (id, name) => {
    const userId = String(id || '').trim();
    if (!isNicoNumericUserId(userId)) return;
    const nick = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const prev = byId.get(userId);
    if (!prev) byId.set(userId, { userId, name: nick, postedAtMs: 0, commentCount: 1 });
    else {
      prev.commentCount += 1;
      if (nick && nick.length > prev.name.length) prev.name = nick;
    }
  };
  try {
    const links = root.querySelectorAll('a[href*="/user/"]');
    const list = links && typeof links.length === 'number' ? links : [];
    for (let i = 0; i < list.length; i += 1) {
      const el = list[i];
      const href = String(el?.getAttribute?.('href') || el?.href || '');
      const m = href.match(/\/user\/(\d+)(?:\/|$|\?)/);
      if (!m) continue;
      add(m[1], el?.textContent);
    }
  } catch {
    /* セレクタが無い根でも落とさない */
  }
  try {
    const nodes = root.querySelectorAll('[data-user-id], [data-user_id], [data-userid]');
    const list = nodes && typeof nodes.length === 'number' ? nodes : [];
    for (let i = 0; i < list.length; i += 1) {
      const el = list[i];
      const id = el?.getAttribute?.('data-user-id') || el?.getAttribute?.('data-user_id') || el?.getAttribute?.('data-userid') || el?.dataset?.userId;
      add(id, el?.textContent);
    }
  } catch {
    /* 同上 */
  }
  return [...byId.values()];
}

/**
 * @param {readonly { userId?: string, name?: string, postedAtMs?: number, commentCount?: number }[]} groups
 * @returns {{ userId: string, name: string, postedAtMs: number, commentCount: number }[]}
 */
export function mergeNicoVideoCommenters(...groups) {
  /** @type {Map<string, { userId: string, name: string, postedAtMs: number, commentCount: number }>} */
  const byId = new Map();
  for (const list of groups) {
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      const userId = String(p?.userId || '').trim();
      if (!userId) continue;
      const prev = byId.get(userId);
      const name = String(p?.name || '').replace(/\s+/g, ' ').trim();
      const postedAtMs = Number(p?.postedAtMs) || 0;
      const commentCount = Number(p?.commentCount) || 1;
      if (!prev) {
        byId.set(userId, { userId, name, postedAtMs, commentCount });
      } else {
        prev.commentCount = Math.max(prev.commentCount, commentCount);
        if (postedAtMs > prev.postedAtMs) prev.postedAtMs = postedAtMs;
        if (name && name.length > prev.name.length) prev.name = name;
      }
    }
  }
  return [...byId.values()];
}
