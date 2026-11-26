/**
 * 視聴者の行動を、配信モードと同じ数字の帯と、同じ応援アイコン列で描く。
 * タイルは buildPersonTileEl、段の描画は paintStoryUserLaneDomFilled をそのまま使う（似せて自作しない）。
 */
import { paintStoryUserLaneDomFilled } from './story/renderStoryUserLaneDom.js';
import { createVenueStatStrip } from '../lib/venueStatStrip.js';
import { VIEWER_BEHAVIOR_FALLBACK_AVATAR, resolveViewerBehaviorAvatarUrl } from '../lib/viewerBehavior.js';

const LANE_IO = {
  storyAvatarLoadGuard: { pickDisplaySrc: (s) => s || VIEWER_BEHAVIOR_FALLBACK_AVATAR, noteRemoteAttempt: () => {} },
  isHttpOrHttpsUrl: (u) => /^https?:/i.test(String(u || '')),
  storyTileUsesYukkuriTvStyle: () => false,
  upgradeAnonymousAvatarImage: () => {},
};

const FACES = { faceLink: '', faceGift: '', faceKonta: '', faceTanu: '' };

/**
 * @param {import('./viewerBehavior.js').ViewerBehaviorBoard | null | undefined} board
 * @param {{ pendingOnly?: boolean }} [opts]
 */
export function viewerBehaviorRowsToLaneBuckets(board, opts = {}) {
  const rows = Array.isArray(board?.rows) ? board.rows : [];
  /** @type {{ link: any[], gift: any[], ad: any[], konta: any[], tanu: any[] }} */
  const buckets = { link: [], gift: [], ad: [], konta: [], tanu: [] };
  const videoOrder = board && (board.contentKind === 'video' || board.kind === 'video');
  /** @type {any[]} */
  const videoItems = [];
  for (const row of rows) {
    if (opts.pendingOnly && !row.pending && !row.isAnonymous) continue;
    if (opts.pendingOnly && row.isAnonymous && !row.pending) continue;
    const badges = [];
    if (row.relation === 'regular' && row.relationLabel) badges.push(row.relationLabel);
    else if (row.relationLabel && row.relationLabel !== '初めて' && row.relationLabel !== 'なじみ') badges.push(row.relationLabel);
    if ((row.giftCount || 0) > 0 || (row.knownAmountJpy || 0) > 0) badges.push('ギフト');
    if (row.relation === 'regular' && !badges.includes(row.relationLabel || 'なじみ')) badges.unshift(row.relationLabel || 'なじみ');
    const idLine = videoOrder
      ? (badges.length ? badges.join('・') : String(row.relationLabel || ''))
      : String(row.relationLabel || '');
    const src = resolveViewerBehaviorAvatarUrl(row.isAnonymous ? '' : row.id, row.avatarUrl);
    const item = {
      displaySrc: src || VIEWER_BEHAVIOR_FALLBACK_AVATAR,
      title: String(row.name || ''),
      meta: { idLine, nameLine: String(row.name || '') },
      entry: { userId: row.isAnonymous ? '' : String(row.id || ''), nickname: String(row.name || ''), avatarUrl: src },
      commentCount: Number(row.commentCount) || 0,
      pending: row.pending === true,
      factLine: String(row.factLine || ''),
      commentAnchor: String(row.commentAnchor || ''),
      pageAt: Number(row.pageAt) > 0 ? Math.floor(Number(row.pageAt)) : 0,
    };
    if (videoOrder) videoItems.push(item);
    else if (row.relation === 'regular') buckets.link.push(item);
    else if ((row.giftCount || 0) > 0 || (row.knownAmountJpy || 0) > 0) buckets.gift.push(item);
    else buckets.tanu.push(item);
  }
  if (videoOrder) {
    videoItems.sort((a, b) => (b.pageAt || 0) - (a.pageAt || 0));
    buckets.tanu.push(...videoItems);
  }
  return buckets;
}

/**
 * @param {import('./viewerBehavior.js').ViewerBehaviorBoard | null | undefined} board
 * @returns {import('./venueStatStrip.js').VenueStatStripModel}
 */
export function viewerBehaviorStatStripModel(board) {
  const items = [];
  const viewCount = board && board.viewCount != null && Number.isFinite(Number(board.viewCount)) && Number(board.viewCount) >= 0 ? Math.floor(Number(board.viewCount)) : null;
  if (viewCount != null) {
    items.push({ key: 'concurrent', label: '再生', text: viewCount.toLocaleString('ja-JP'), unit: '回', isPlaceholder: false, face: 'konta', title: 'ページに出ている再生回数です。' });
  }
  const comments = board && Number(board.commentsTotal) > 0 ? Math.floor(Number(board.commentsTotal)) : 0;
  items.push({
    key: 'records',
    label: '応援',
    text: comments.toLocaleString('ja-JP'),
    unit: 'コメント',
    isPlaceholder: comments <= 0,
    face: 'link',
    title: 'いまページに読み込まれているコメントの件数です。',
  });
  const gifts = board && Number(board.giftCountTotal) > 0 ? Math.floor(Number(board.giftCountTotal)) : 0;
  const amt = board && Number(board.knownAmountTotal) > 0 ? Math.floor(Number(board.knownAmountTotal)) : 0;
  items.push({
    key: 'gifts',
    label: 'ギフト',
    text: gifts > 0 ? (amt > 0 ? `${gifts.toLocaleString('ja-JP')}（約¥${amt.toLocaleString('ja-JP')}）` : gifts.toLocaleString('ja-JP')) : '—',
    unit: gifts > 0 && amt <= 0 ? '件' : '',
    isPlaceholder: gifts <= 0,
    face: 'tanu',
    title: 'コメントに付いているギフト・投げ銭のうち、いま見えている分です。金額は分かっているときだけ出します。',
  });
  if (board?.spend && board.spend.text) {
    items.push({ key: 'estimatedViewerSpend', label: board.spend.label || '推定（視聴者の購入額）', text: board.spend.text, unit: '', isPlaceholder: !!board.spend.placeholder, face: '', title: board.spend.title || '' });
  }
  if (board?.takeHome && board.takeHome.text) {
    items.push({ key: 'estimatedStreamerTakeHome', label: board.takeHome.label || '推定（配信者の受取）', text: board.takeHome.text, unit: '', isPlaceholder: !!board.takeHome.placeholder, face: '', title: board.takeHome.title || '' });
  }
  return { source: 'self', stale: false, ageMs: 0, items };
}

/**
 * @param {Document} doc
 */
export function createViewerBehaviorLiveLaneEls(doc) {
  const stack = doc.createElement('div');
  stack.className = 'nl-story-userlane-stack nlsb-viewer-behavior-lane-stack';
  const makeLane = (name) => {
    const lane = doc.createElement('div');
    lane.className = name === 'tanu' ? 'nl-story-userlane nl-story-userlane--tanu' : 'nl-story-userlane';
    lane.dataset.laneName = name;
    return lane;
  };
  const makeWrap = (extra = '') => {
    const wrap = doc.createElement('div');
    wrap.className = `nl-story-userlane-tier-wrap${extra ? ` ${extra}` : ''}`;
    return wrap;
  };
  const makeGuide = () => {
    const guide = doc.createElement('div');
    guide.className = 'nl-story-userlane-guide';
    const lines = doc.createElement('div');
    lines.className = 'nl-story-userlane-guide__lines';
    guide.appendChild(lines);
    return { guide, lines };
  };
  const top = makeGuide();
  const giftGuide = makeGuide();
  const adGuide = makeGuide();
  const kontaGuide = makeGuide();
  const tanuGuide = makeGuide();
  const bottom = makeGuide();
  const laneLink = makeLane('link');
  const laneGift = makeLane('gift');
  const laneAd = makeLane('ad');
  const laneKonta = makeLane('konta');
  const laneTanu = makeLane('tanu');
  const hintLink = doc.createElement('div');
  hintLink.className = 'nl-story-userlane-tier-hint';
  hintLink.hidden = true;
  const linkWrap = makeWrap();
  const giftWrap = makeWrap('nl-story-userlane-tier-wrap--gift');
  const adWrap = makeWrap('nl-story-userlane-tier-wrap--ad');
  const kontaWrap = makeWrap();
  const tanuWrap = makeWrap();
  linkWrap.append(laneLink, hintLink);
  giftWrap.append(giftGuide.guide, laneGift);
  adWrap.append(adGuide.guide, laneAd);
  kontaWrap.append(kontaGuide.guide, laneKonta);
  tanuWrap.append(tanuGuide.guide, laneTanu);
  stack.append(top.guide, linkWrap, giftWrap, adWrap, kontaWrap, tanuWrap, bottom.guide);
  return {
    stack,
    laneLink,
    laneGift,
    laneAd,
    laneKonta,
    laneTanu,
    hintLink,
    linkWrap,
    giftWrap,
    adWrap,
    guideTop: top.guide,
    guideLinesTop: top.lines,
    guideMidGift: giftGuide.guide,
    guideLinesMidGift: giftGuide.lines,
    guideMidAd: adGuide.guide,
    guideLinesMidAd: adGuide.lines,
    guideMidKonta: kontaGuide.guide,
    guideLinesMidKonta: kontaGuide.lines,
    guideMidTanu: tanuGuide.guide,
    guideLinesMidTanu: tanuGuide.lines,
    guideBottom: bottom.guide,
    guideLinesBottom: bottom.lines,
  };
}

/**
 * @param {ParentNode} host
 * @param {import('./viewerBehavior.js').ViewerBehaviorBoard | null | undefined} board
 * @param {{ pendingOnly?: boolean, document?: Document }} [opts]
 */
export function hydrateViewerBehaviorLiveLayout(host, board, opts = {}) {
  const doc = opts.document || (host && 'ownerDocument' in host ? host.ownerDocument : null) || (typeof document !== 'undefined' ? document : null);
  if (!host || !doc || !board) return;
  let stripHost = host.querySelector('[data-stat-strip-host]');
  let laneHost = host.querySelector('[data-live-lane-host]');
  if (!laneHost) return;
  if (stripHost) {
    const strip = createVenueStatStrip(doc, { platform: board.platform || 'youtube' });
    stripHost.replaceChildren(strip.el);
    strip.paint(viewerBehaviorStatStripModel(board));
  }
  const els = createViewerBehaviorLiveLaneEls(doc);
  laneHost.replaceChildren(els.stack);
  const buckets = viewerBehaviorRowsToLaneBuckets(board, { pendingOnly: opts.pendingOnly === true });
  const n = buckets.link.length + buckets.gift.length + buckets.tanu.length + buckets.konta.length;
  paintStoryUserLaneDomFilled(els, FACES, buckets, n, LANE_IO, {
    guides: false,
    wrapTileEl: (tileEl) => {
      const img = tileEl.querySelector && tileEl.querySelector('img');
      if (img) {
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
      }
      return tileEl;
    },
  });
}
