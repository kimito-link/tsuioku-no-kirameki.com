/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】ページがすでに出しているフォロワー数の読み取りと、増えた時間の対応
 * 【この箱に入らないもの】fetch / storage / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】数は渡された文字・JSON・DOM ノードにあるものだけ。無い数は作らない。
 *
 * followerCountSample.js — 配信ページがすでに届ける人数を、数分おきの標本にする。
 * 概数(1.2万など)は概数のまま覚え、増えた人数には使わない。
 */

export const FOLLOWER_SAMPLE_INTERVAL_MS = 3 * 60 * 1000;
export const FOLLOWER_SAMPLE_CAP = 160;
const FORCE_GAP_MS = 15 * 1000;
const COUNT_MAX = 2_000_000_000;

/** 画面の言葉。サービスが使っている呼び方だけ。 */
export const FOLLOWER_NOUN = Object.freeze({
  niconico: 'フォロワー',
  youtube: 'チャンネル登録者',
  twitch: 'フォロワー',
  kick: 'フォロワー',
  tiktok: 'フォロワー',
  showroom: 'フォロワー',
  twitcasting: 'サポーター',
  whowatch: 'フォロワー',
  mixch: 'ファン',
  abema: 'フォロワー',
});

/**
 * 1件の標本。
 * @typedef {{
 *   at: number,
 *   count: number,
 *   rounded: boolean,
 *   source: 'exact-event' | 'page-count' | 'rounded',
 *   noun?: string,
 *   raw?: string
 * }} FollowerSample
 */

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function exactInt(v) {
  let n = NaN;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d{1,10}$/.test(v)) n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > COUNT_MAX) return null;
  return n;
}

/**
 * @param {unknown} v
 * @returns {Record<string, any> | null}
 */
function asObj(v) {
  if (v && typeof v === 'object') return /** @type {Record<string, any>} */ (v);
  if (typeof v !== 'string' || !v || v.length > 4000) return null;
  try {
    const o = JSON.parse(v);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

/**
 * ページの短い表示を人数にする。概数は rounded。視聴数の文は捨てる。
 * @param {unknown} raw
 * @returns {{ count: number, rounded: boolean, raw?: string } | null}
 */
export function parseFollowerCountText(raw) {
  const text = String(raw ?? '')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/．/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length > 80) return null;
  const viewerish = /視聴|コメント|comment|viewer/i.test(text);
  const followerish = /フォロワー|登録者|ファン|サポーター|follower|subscriber/i.test(text);
  if (viewerish && !followerish) return null;
  const compact = /([\d]+(?:[.,]\d+)?)\s*(億|万|千|[kKmM])(?![a-zA-Z])/u.exec(text);
  if (compact) {
    const n = Number(compact[1].replace(',', '.'));
    const unit = compact[2];
    const mul = unit === '億' ? 100000000 : unit === '万' ? 10000 : unit === '千' ? 1000 : unit.toLowerCase() === 'k' ? 1000 : 1000000;
    const count = Math.round(n * mul);
    if (!Number.isFinite(n) || count < 0 || count > COUNT_MAX) return null;
    return { count, rounded: true, raw: `${compact[1]}${unit}` };
  }
  const nums = text.match(/[\d,，]+/g);
  if (!nums || nums.length !== 1) return null;
  const count = exactInt(nums[0].replace(/[,，]/g, ''));
  if (count == null) return null;
  return { count, rounded: false };
}

/**
 * 概数の桁と小数を落としただけの整数（139K や 13.9万 を 139 と読んだもの）か。
 * 正確な人数どうしは比べない。
 * @param {Array<{ count?: number, rounded?: boolean, raw?: string }>} samples
 * @param {number} count
 * @param {boolean} rounded
 */
export function isMisparsedExactCount(samples, count, rounded) {
  if (rounded || !Number.isInteger(count)) return false;
  for (const sample of samples) {
    if (!sample || sample.rounded !== true) continue;
    const roundedCount = Number(sample.count);
    if (roundedCount >= 1000 && count > 0 && count < roundedCount / 50) return true;
    const digits = String(sample.raw || '').replace(/\D/g, '');
    if (digits && Number(digits) === count && count !== roundedCount) return true;
  }
  return false;
}

/**
 * ノード自身と、その短い親の文から人数を読む。概数があるときは、桁を落とした整数よりそちらを採る。
 * @param {Element} el
 * @returns {{ count: number, rounded: boolean, raw?: string } | null}
 */
function parseFollowerElement(el) {
  /** @type {{ count: number, rounded: boolean, raw?: string } | null} */
  let exact = null;
  /** @type {string[]} */
  const bits = [];
  try {
    const aria = String(el.getAttribute?.('aria-label') || '');
    const title = String(el.getAttribute?.('title') || '');
    if (aria) bits.push(aria);
    if (title) bits.push(title);
  } catch {
    /* 属性が無くても本文は見る */
  }
  /** @type {Element | null} */
  let node = el;
  for (let depth = 0; depth < 4 && node; depth += 1) {
    const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
    if (text && text.length <= 80) bits.push(text);
    node = node.parentElement;
  }
  for (const bit of bits) {
    const parsed = parseFollowerCountText(bit);
    if (!parsed) continue;
    if (parsed.rounded) return parsed;
    if (!exact) exact = parsed;
  }
  return exact;
}

/**
 * @param {unknown} existing
 * @param {unknown} sample
 * @param {number} [nowMs]
 * @returns {FollowerSample[]}
 */
export function appendFollowerSample(existing, sample, nowMs = Date.now()) {
  const prev = Array.isArray(existing) ? /** @type {FollowerSample[]} */ (existing) : [];
  const row = asObj(sample);
  if (!row) return prev;
  const count = exactInt(row.count);
  if (count == null) return prev;
  const atRaw = Number(row.at);
  const at = Number.isFinite(atRaw) && atRaw > 0 ? Math.floor(atRaw) : Math.floor(nowMs);
  if (!(at > 0)) return prev;
  const rounded = row.rounded === true;
  if (isMisparsedExactCount(prev, count, rounded)) return prev;
  const source = row.source === 'exact-event' ? 'exact-event' : rounded ? 'rounded' : 'page-count';
  const last = prev.length ? prev[prev.length - 1] : null;
  const force = row.force === true;
  if (source === 'exact-event') {
    if (last && last.rounded !== true && last.count === count && !force) return prev;
  } else if (!force) {
    if (last && at - last.at < FOLLOWER_SAMPLE_INTERVAL_MS) return prev;
  } else if (last && at - last.at < FORCE_GAP_MS) {
    return prev;
  }
  const noun = typeof row.noun === 'string' ? row.noun : '';
  const raw = rounded && typeof row.raw === 'string' ? row.raw.slice(0, 20) : '';
  /** @type {FollowerSample} */
  const next = {
    at,
    count,
    rounded,
    source,
    ...(noun ? { noun } : {}),
    ...(raw ? { raw } : {}),
  };
  const out = prev.concat(next);
  return out.length > FOLLOWER_SAMPLE_CAP ? out.slice(out.length - FOLLOWER_SAMPLE_CAP) : out;
}

/**
 * @param {{ count: number, rounded: boolean, raw?: string }} parsed
 * @param {string} noun
 * @param {'page-count' | 'exact-event'} [source]
 * @returns {Omit<FollowerSample, 'at'>}
 */
function sampleOf(parsed, noun, source) {
  const src = parsed.rounded ? 'rounded' : (source || 'page-count');
  return {
    count: parsed.count,
    rounded: parsed.rounded,
    source: src,
    noun,
    ...(parsed.raw ? { raw: parsed.raw } : {}),
  };
}

/**
 * Kick の /api/v2/channels/<slug>（ページがすでに取っている応答）の followers_count。
 * @param {unknown} json
 */
export function followerSampleFromKickChannel(json) {
  const o = asObj(json);
  if (!o) return null;
  const user = asObj(o.user);
  const n = exactInt(o.followers_count) ?? exactInt(o.followersCount) ?? exactInt(user?.followers_count);
  if (n == null) return null;
  return sampleOf({ count: n, rounded: false }, FOLLOWER_NOUN.kick, 'page-count');
}

/**
 * Kick の購読済みソケット FollowersUpdated。人数の合計であり、誰がフォローしたかではない。
 * @param {unknown} eventName
 * @param {unknown} data
 */
export function followerSampleFromKickEvent(eventName, data) {
  const name = String(eventName || '').replace(/^App\\Events\\/, '');
  if (name !== 'FollowersUpdated') return null;
  const o = asObj(data);
  const n = exactInt(o?.followersCount) ?? exactInt(o?.followers_count);
  if (n == null) return null;
  return sampleOf({ count: n, rounded: false }, FOLLOWER_NOUN.kick, 'exact-event');
}

/**
 * TikTok の GET /api-live/user/room/ の配信者オブジェクトだけを見る。無いときは null。
 * @param {unknown} json
 */
export function followerSampleFromTikTokRoom(json) {
  const user = asObj(asObj(asObj(json)?.data)?.user);
  if (!user) return null;
  const info = asObj(user.followInfo);
  const stats = asObj(user.stats);
  const n = exactInt(info?.followerCount) ?? exactInt(stats?.followerCount) ?? exactInt(user.followerCount);
  if (n == null) return null;
  return sampleOf({ count: n, rounded: false }, FOLLOWER_NOUN.tiktok, 'page-count');
}

/**
 * ふわっちの GET /lives/<id> の配信者オブジェクトだけを見る。無いときは null。
 * @param {unknown} json
 */
export function followerSampleFromWhowatch(json) {
  const root = asObj(json);
  const live = asObj(root?.live) || root;
  const user = asObj(live?.user);
  if (!user) return null;
  const n = exactInt(user.follower_count) ?? exactInt(user.followers_count) ?? exactInt(user.followerCount);
  if (n == null) return null;
  return sampleOf({ count: n, rounded: false }, FOLLOWER_NOUN.whowatch, 'page-count');
}

/**
 * ふわっちの GET /users/<番号>/profile。follower_count だけ。follow_count（自分がフォローしている数）は使わない。
 * @param {unknown} json
 */
export function followerSampleFromWhowatchProfile(json) {
  const root = asObj(json);
  if (!root) return null;
  const n = exactInt(root.follower_count);
  if (n == null) return null;
  return sampleOf({ count: n, rounded: false }, FOLLOWER_NOUN.whowatch, 'page-count');
}

/**
 * ミクチャの /api-web/users/<n>/live の broadcasterInfo.fan（画面のファン数）。
 * @param {unknown} json
 */
export function followerSampleFromMixch(json) {
  const n = exactInt(asObj(asObj(json)?.broadcasterInfo)?.fan);
  if (n == null) return null;
  return sampleOf({ count: n, rounded: false }, FOLLOWER_NOUN.mixch, 'page-count');
}

/**
 * SHOWROOM の follower_num だけ。view_num（入室者数）はフォロワーにしない。
 * room/status には無く、/api/room/profile にある（2026-11-18 実測）。
 * @param {unknown} json
 */
export function followerSampleFromShowroom(json) {
  const root = asObj(json);
  if (!root) return null;
  const roots = [root, asObj(root.data), asObj(root.room), asObj(root.live_info)].filter(Boolean);
  for (const o of roots) {
    const n = exactInt(o?.follower_num) ?? exactInt(o?.followerNum);
    if (n != null) return sampleOf({ count: n, rounded: false }, FOLLOWER_NOUN.showroom, 'page-count');
  }
  return null;
}

/** @type {Readonly<Record<string, readonly string[]>>} */
const DOM_SELECTORS = Object.freeze({
  youtube: Object.freeze(['#owner-sub-count', 'ytd-video-owner-renderer #owner-sub-count']),
  twitch: Object.freeze(['[data-a-target="followers-count"]', '[data-a-target*="follower-count"]', '[aria-label*="follower" i]', '[aria-label*="フォロワー"]']),
  kick: Object.freeze(['[data-testid="followers-count"]', '[data-testid*="follower-count"]']),
  tiktok: Object.freeze(['[data-e2e="live-follower-count"]', '[data-e2e*="follower-count"]', '[data-e2e="user-info-follower"]']),
  showroom: Object.freeze(['[class*="follower-num"]', '[class*="follower_num"]', '[class*="Follower"]']),
  whowatch: Object.freeze(['[class*="follower-count"]', '[class*="FollowerCount"]']),
  abema: Object.freeze(['[class*="FollowerCount"]', '[class*="follower-count"]', '[aria-label*="フォロワー"]', '[aria-label*="フォロー数"]']),
});

/**
 * 開いているページの、人数専用の短いノードだけを読む。全文書は走査しない。
 * @param {ParentNode | null | undefined} doc
 * @param {string} platformId
 */
export function followerSampleFromDom(doc, platformId) {
  const sels = DOM_SELECTORS[platformId];
  if (!doc || typeof doc.querySelectorAll !== 'function' || !sels) return null;
  const noun = /** @type {Record<string, string>} */ (FOLLOWER_NOUN)[platformId] || 'フォロワー';
  for (const sel of sels) {
    /** @type {Element[]} */
    let nodes = [];
    try {
      nodes = Array.from(doc.querySelectorAll(sel)).slice(0, 8);
    } catch {
      continue;
    }
    for (const el of nodes) {
      const aria = String(el.getAttribute?.('aria-label') || '');
      const title = String(el.getAttribute?.('title') || '');
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      const blob = `${aria} ${title} ${text}`.replace(/\s+/g, ' ').trim();
      if (!blob || blob.length > 80) continue;
      if (platformId === 'abema' && !/フォロワー|フォロー数|follower/i.test(`${sel} ${blob}`)) continue;
      if (platformId === 'twitch' && !/follower|フォロワー/i.test(`${sel} ${blob}`)) continue;
      const parsed = parseFollowerElement(el);
      if (!parsed) continue;
      return sampleOf(parsed, noun, 'page-count');
    }
  }
  if (platformId === 'youtube') return youtubeOwnerFollowerSample(doc, noun);
  return null;
}

/**
 * いまの視聴ページは #owner-sub-count が無いことがある。
 * 配信者欄の短い「チャンネル登録者数 13.9万人」と、ページ世界が置いた data 属性だけを見る。
 * @param {ParentNode | null | undefined} doc
 * @param {string} noun
 */
function youtubeOwnerFollowerSample(doc, noun) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;
  /** @type {ParentNode[]} */
  const roots = [];
  try {
    for (const el of Array.from(doc.querySelectorAll('#owner, ytd-watch-metadata, ytd-video-owner-renderer')).slice(0, 4)) {
      roots.push(el);
      const shadow = /** @type {{ shadowRoot?: ParentNode | null }} */ (el).shadowRoot;
      if (shadow) roots.push(shadow);
    }
  } catch {
    /* 欄が無くても data 属性は見る */
  }
  for (const root of roots) {
    /** @type {Element[]} */
    let nodes = [];
    try {
      nodes = Array.from(root.querySelectorAll('span, yt-formatted-string, #owner-sub-count')).slice(0, 24);
    } catch {
      continue;
    }
    /** @type {{ count: number, rounded: boolean, raw?: string } | null} */
    let exact = null;
    for (const el of nodes) {
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 40 || !/登録者|subscriber/i.test(text)) continue;
      const parsed = parseFollowerElement(el);
      if (!parsed) continue;
      if (parsed.rounded) return sampleOf(parsed, noun, 'page-count');
      if (!exact) exact = parsed;
    }
    if (exact) {
      const rootEl = /** @type {{ documentElement?: Element, getAttribute?: (n: string) => string | null }} */ (doc);
      const published = String(rootEl.documentElement?.getAttribute?.('data-nl-yt-subscribers') || rootEl.getAttribute?.('data-nl-yt-subscribers') || '');
      const fromAttr = parseFollowerCountText(published);
      if (fromAttr?.rounded && isMisparsedExactCount([fromAttr], exact.count, false)) {
        return sampleOf(fromAttr, noun, 'page-count');
      }
      return sampleOf(exact, noun, 'page-count');
    }
  }
  const rootEl = /** @type {{ documentElement?: Element, getAttribute?: (n: string) => string | null }} */ (doc);
  const published = String(rootEl.documentElement?.getAttribute?.('data-nl-yt-subscribers') || rootEl.getAttribute?.('data-nl-yt-subscribers') || '');
  const fromAttr = parseFollowerCountText(published);
  return fromAttr ? sampleOf(fromAttr, noun, 'page-count') : null;
}

/**
 * ツイキャスの配信ページ .tw-user-nav-stat のうち「サポーター」の行だけ。
 * 「サポート中」は別の数なので使わない。API の supporter_count は取りに行かない。
 * @param {ParentNode | null | undefined} doc
 */
export function followerSampleFromTcDocument(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;
  /** @type {Element[]} */
  let nodes = [];
  try {
    nodes = Array.from(doc.querySelectorAll('.tw-user-nav-stat li')).slice(0, 12);
  } catch {
    return null;
  }
  for (const el of nodes) {
    const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 40 || !text.includes('サポーター') || text.includes('サポート中')) continue;
    const parsed = parseFollowerCountText(text);
    if (!parsed || parsed.rounded) continue;
    return sampleOf(parsed, FOLLOWER_NOUN.twitcasting, 'page-count');
  }
  return null;
}

/**
 * @param {unknown} samples
 * @param {{ noun?: string, supportAts?: number[], commentAts?: number[] }} [opts]
 */
export function analyzeFollowerGrowth(samples, opts = {}) {
  const list = (Array.isArray(samples) ? samples : [])
    .map((s) => {
      const o = asObj(s);
      return {
        at: Math.floor(Number(o?.at)),
        count: Math.floor(Number(o?.count)),
        rounded: o?.rounded === true,
        noun: typeof o?.noun === 'string' ? o.noun : '',
        raw: typeof o?.raw === 'string' ? o.raw : '',
      };
    })
    .filter((s) => s.at > 0 && Number.isInteger(s.count) && s.count >= 0 && s.count <= COUNT_MAX)
    .sort((a, b) => a.at - b.at)
    .filter((s, _i, all) => !isMisparsedExactCount(all, s.count, s.rounded));
  if (!list.length) return null;
  const noun = list.find((s) => s.noun)?.noun || opts.noun || 'フォロワー';
  const usable = list.filter((s) => !s.rounded);
  if (usable.length < 2) {
    const rounded = list.filter((s) => s.rounded);
    if (!rounded.length) return null;
    const shown = (/** @type {typeof rounded[number]} */ s) => s.raw || s.count.toLocaleString('ja-JP');
    const start = rounded[0];
    const end = rounded[rounded.length - 1];
    const span = rounded.length === 1 ? shown(end) : `${shown(start)} → ${shown(end)}`;
    return {
      noun,
      roundedOnly: true,
      label: `${noun} ${span}（概数）。増えた人数は出していません。`,
      windows: /** @type {{ t0: number, t1: number, delta: number, supportCount: number, commentCount: number }[]} */ ([]),
    };
  }
  const start = usable[0];
  const end = usable[usable.length - 1];
  /** @type {{ t0: number, t1: number, delta: number }[]} */
  const pairs = [];
  for (let i = 1; i < usable.length; i += 1) {
    const delta = usable[i].count - usable[i - 1].count;
    if (delta > 0) pairs.push({ t0: usable[i - 1].at, t1: usable[i].at, delta });
  }
  pairs.sort((a, b) => b.delta - a.delta || a.t0 - b.t0);
  const supportAts = Array.isArray(opts.supportAts) ? opts.supportAts : [];
  const commentAts = Array.isArray(opts.commentAts) ? opts.commentAts : [];
  const countIn = (/** @type {number[]} */ ats, /** @type {number} */ t0, /** @type {number} */ t1) =>
    ats.reduce((n, t) => n + (t >= t0 && t <= t1 ? 1 : 0), 0);
  return {
    noun,
    roundedOnly: false,
    startCount: start.count,
    endCount: end.count,
    net: end.count - start.count,
    startAt: start.at,
    endAt: end.at,
    windows: pairs.slice(0, 3).map((w) => ({
      ...w,
      supportCount: countIn(supportAts, w.t0, w.t1),
      commentCount: countIn(commentAts, w.t0, w.t1),
    })),
  };
}

/**
 * 欄に出す人数。桁を落とした整数は使わず、正確な最後の標本、無ければ概数の最後を返す。
 * @param {unknown} samples
 * @returns {{ count: number, at: number, rounded: boolean } | null}
 */
export function followerCountForDisplay(samples) {
  const list = (Array.isArray(samples) ? samples : [])
    .map((s) => {
      const o = asObj(s);
      return {
        at: Math.floor(Number(o?.at)),
        count: Math.floor(Number(o?.count)),
        rounded: o?.rounded === true,
        raw: typeof o?.raw === 'string' ? o.raw : '',
      };
    })
    .filter((s) => s.at > 0 && Number.isInteger(s.count) && s.count >= 0 && s.count <= COUNT_MAX)
    .filter((s, _i, all) => !isMisparsedExactCount(all, s.count, s.rounded));
  if (!list.length) return null;
  const exact = list.filter((s) => !s.rounded);
  const pick = exact.length ? exact[exact.length - 1] : list[list.length - 1];
  return { count: pick.count, at: pick.at, rounded: pick.rounded === true };
}
