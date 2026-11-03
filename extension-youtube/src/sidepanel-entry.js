// sidepanel-entry.js — ニコ生版（extension/popup.html）と同一構成の YouTube Live サイドパネル UI（差分更新対応）
/* global window, chrome, document, performance */

import { formatNumberJa, safeHttpUrl } from '../../src/lib/htmlText.js';
import { anonymousIdenticonDataUrl } from '../../src/lib/anonymousIdenticon.js';
import { VOICEVOX_BASE_URL } from '../../src/lib/voicevoxClient.js';
import {
  formatYtCurrencyAmount,
  buildYtChannelUrl,
} from '../../src/lib/youtube/ytSupportRanking.js';
import { YT_VOICE_MODES, YT_DEFAULT_STYLE_IDS } from '../../src/lib/youtube/ytVoiceQueue.js';
import {
  YT_SIDE_PANEL_DISPLAY_LIMIT,
  createYtStreamIncrementalState,
  applyYtStreamIncrementalItems,
} from '../../src/lib/youtube/ytStreamStorePolicy.js';
import { getYtStreamCommentsByVideoId, getYtStreamCommentsSince } from './ytIdbStore.js';

const STORAGE_KEYS = Object.freeze({
  STREAM_SUMMARIES: 'yt_stream_summaries',
  ACTIVE_VIDEO_ID: 'yt_active_video_id',
  VOICE_SETTINGS: 'yt_voice_settings',
  VOICE_ASSIGNMENTS: 'yt_voice_assignments',
  VOICE_QUEUE: 'yt_voice_queue',
  VOICE_STATE: 'yt_voice_state',
  UI_STATE: 'yt_sidepanel_ui_state',
});

const LANE_CONFIG = Object.freeze({
  rinku: {
    listId: 'lane-rinku-list',
    countId: 'lane-rinku-count',
    emptyMessage: '配信者本人・モデレーターのコメントがここに表示されます',
    fallbackIcon: 'images/yukkuri-charactore-english/link/link-yukkuri-normal-mouth-closed.thumb128.png',
  },
  konta: {
    listId: 'lane-konta-list',
    countId: 'lane-konta-count',
    emptyMessage: 'スパチャ・ステッカー・メンバー・ギフトの応援がここに表示されます',
    fallbackIcon: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-normal.thumb128.png',
  },
  tanunee: {
    listId: 'lane-tanunee-list',
    countId: 'lane-tanunee-count',
    emptyMessage: '一般リスナーのコメントがここに表示されます',
    fallbackIcon: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-normal-mouth-closed.thumb128.png',
  },
});

const BROADCASTER_FALLBACK_ICON =
  'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png';

/** 応援ユーザーの順位カードに表示する最大人数 */
const TOP_SUPPORT_STRIP_LIMIT = 10;
/** アイコン列の各ティアに表示する最大人数 */
const STORY_USERLANE_LIMIT = 36;
/** 全員グリッドに表示する最大人数 */
const STORY_GROWTH_GRID_LIMIT = 240;

let selectedVideoId = '';
/** @type {ReturnType<typeof createYtStreamIncrementalState> | null} */
let currentIncrementalState = null;
let renderJobChain = Promise.resolve();
let visualDetailsNeedsRefresh = false;

/** チャンネルID別の決定論的 identicon キャッシュ */
/** @type {Map<string, string>} */
const identiconCache = new Map();

/** 実測・検証用のサイドパネル差分更新メトリクス */
const metrics = {
  fullGetAllCount: 0,
  incrementalFetchCount: 0,
  lastIncrementalFetchedItems: 0,
  lastIncrementalAddedItems: 0,
  lastIncrementalDurationMs: 0,
  lastFullLoadDurationMs: 0,
  voiceOnlyUpdateCount: 0,
};
if (typeof window !== 'undefined') {
  /** @type {any} */ (window).__ytSidepanelMetrics = metrics;
}

/**
 * 描画ジョブを直列化して競合を防ぐ。
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function runRenderSerialized(fn) {
  const next = renderJobChain.then(fn, fn);
  renderJobChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * 要素の子ノードをすべて安全に消去する。
 * @param {HTMLElement | null} el
 */
function clearChildren(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * チャンネルID（または表示名）から決定論的な顔アイコン（Data URL）を生成・キャッシュ取得する。
 * アイコンが取れない人・読み込み失敗時も一律グレーにせず、その人固有の顔で表示する（src/lib/anonymousIdenticon.js）。
 * @param {string} key
 * @returns {string}
 */
function getDeterministicIdenticonUrl(key) {
  const k = String(key || 'anon').trim() || 'anon';
  const cached = identiconCache.get(k);
  if (cached) return cached;
  const url = anonymousIdenticonDataUrl(k, 64);
  if (identiconCache.size > 2000) {
    const first = identiconCache.keys().next().value;
    if (first) identiconCache.delete(first);
  }
  identiconCache.set(k, url);
  return url;
}

/**
 * チャンネルIDを短縮表示用に整形する。
 * @param {string} channelId
 * @returns {string}
 */
function formatShortChannelId(channelId) {
  const raw = String(channelId || '').trim();
  if (!raw) return '';
  const cleaned = raw.startsWith('handle:') ? raw.slice('handle:'.length) : raw;
  return cleaned.length > 14 ? `${cleaned.slice(0, 14)}…` : cleaned;
}

/**
 * 経過ミリ秒を「12分」「1時間05分」等の日本語表記に整形する。
 * @param {number} elapsedMs
 * @returns {string}
 */
function formatElapsedDurationJa(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return '—';
  const totalSec = Math.floor(elapsedMs / 1000);
  if (totalSec < 60) return '1分未満';
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}分`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}時間${String(mins).padStart(2, '0')}分`;
}

/**
 * アイコン `<img>` 要素を生成する。URL が空または CDN 読み込み失敗時は
 * チャンネルIDから決まる identicon（または指定フォールバック画像）へ自動フォールバックする（AGENTS.md §3.6）。
 *
 * @param {string} iconUrl
 * @param {string} name
 * @param {string} channelKey
 * @param {string} className
 * @param {string} [explicitFallbackSrc]
 * @returns {HTMLImageElement}
 */
function createAvatarImgWithFallback(
  iconUrl,
  name,
  channelKey,
  className,
  explicitFallbackSrc = '',
) {
  const safeUrl = safeHttpUrl(iconUrl || '');
  const fallbackSrc =
    explicitFallbackSrc || getDeterministicIdenticonUrl(channelKey || name || 'anon');

  const img = document.createElement('img');
  img.className = className;
  img.src = safeUrl || fallbackSrc;
  img.alt = name || 'icon';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';

  if (safeUrl) {
    img.addEventListener(
      'error',
      () => {
        if (img.src !== fallbackSrc) {
          img.src = fallbackSrc;
        }
      },
      { once: true },
    );
  }
  return img;
}

/**
 * コメント行の人物ヘッダー（サムネ・名前・チャンネルID・リンク・声バッジ）を生成する。
 * @param {{ name?: string, channelId?: string, iconUrl?: string, voiceStyleId?: number }} user
 * @returns {DocumentFragment}
 */
function createAuthorHeaderFragment(user) {
  const frag = document.createDocumentFragment();
  const displayName = String(user.name || user.channelId || '匿名リスナー').trim();
  const channelId = String(user.channelId || '').trim();
  const channelUrl = safeHttpUrl(buildYtChannelUrl(channelId));
  const shortId = formatShortChannelId(channelId);

  const cell = channelUrl ? document.createElement('a') : document.createElement('span');
  cell.className = channelUrl
    ? 'nl-story-userlane-cell nl-story-userlane-cell--linkable author-link'
    : 'nl-story-userlane-cell author-link';
  if (channelUrl) {
    /** @type {HTMLAnchorElement} */ (cell).href = channelUrl;
    /** @type {HTMLAnchorElement} */ (cell).target = '_blank';
    /** @type {HTMLAnchorElement} */ (cell).rel = 'noopener noreferrer';
  }
  cell.title = channelId ? `${displayName} (${channelId})` : displayName;

  cell.appendChild(
    createAvatarImgWithFallback(
      user.iconUrl || '',
      displayName,
      channelId || displayName,
      'nl-story-userlane-avatar avatar-img',
    ),
  );

  const meta = document.createElement('span');
  meta.className = 'nl-story-userlane-meta';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'nl-story-userlane-meta__name';
  nameSpan.textContent = displayName;
  meta.appendChild(nameSpan);

  if (shortId) {
    const idTag = document.createElement('span');
    idTag.className = 'nl-story-userlane-meta__id channel-id-tag';
    idTag.textContent = `(${shortId})`;
    idTag.title = channelId;
    meta.appendChild(idTag);
  }

  cell.appendChild(meta);
  frag.appendChild(cell);

  if (Number.isFinite(Number(user.voiceStyleId))) {
    const voicePill = document.createElement('span');
    voicePill.className = 'voice-pill';
    voicePill.dataset.voiceStyleId = String(user.voiceStyleId);
    voicePill.textContent = `声 #${user.voiceStyleId}`;
    frag.appendChild(voicePill);
  }

  return frag;
}

/**
 * 1件のコメントカードを DOM API で生成する（innerHTML 不使用・AGENTS.md §0.7）。
 * @param {any} item
 * @returns {HTMLElement}
 */
function createChatItemElement(item) {
  const card = document.createElement('div');
  const kind = String(item.kind || 'text');
  const isGiftLike =
    kind === 'superchat' ||
    kind === 'sticker' ||
    kind === 'membership' ||
    kind === 'membership_gift';
  card.className = `chat-item ${isGiftLike ? 'nl-tl-gift' : 'nl-tl-row'} kind-${kind}`;
  card.dataset.itemId = String(item.id || '');
  card.dataset.channelId = String(item.channelId || '');
  if (Number.isFinite(Number(item.voiceStyleId))) {
    card.dataset.voiceStyleId = String(item.voiceStyleId);
  }

  const head = document.createElement('div');
  head.className = 'chat-item-head';
  head.appendChild(createAuthorHeaderFragment(item));

  if ((kind === 'superchat' || kind === 'sticker') && Number(item.amount) > 0) {
    const pill = document.createElement('span');
    pill.className = 'amount-pill';
    pill.textContent = formatYtCurrencyAmount(item.amount, item.currency);
    head.appendChild(pill);
  } else if (kind === 'membership') {
    const pill = document.createElement('span');
    pill.className = 'member-pill';
    pill.textContent = 'メンバー加入';
    head.appendChild(pill);
  } else if (kind === 'membership_gift') {
    const pill = document.createElement('span');
    pill.className = 'member-pill';
    pill.textContent = 'ギフト';
    head.appendChild(pill);
  }

  if (item.ts) {
    const tsSpan = document.createElement('span');
    tsSpan.className = 'channel-id-tag';
    tsSpan.style.marginLeft = 'auto';
    tsSpan.textContent = String(item.ts);
    head.appendChild(tsSpan);
  }

  card.appendChild(head);

  if (item.text) {
    const body = document.createElement('div');
    body.className = 'chat-text';
    body.textContent = String(item.text);
    card.appendChild(body);
  }

  return card;
}

/**
 * レーン1列を全件置換で初期描画する（初回・配信切替時のみ）。
 * @param {'rinku' | 'konta' | 'tanunee'} lane
 * @param {any[]} displayItems
 * @param {number} totalLaneCount
 */
function renderLaneFull(lane, displayItems, totalLaneCount) {
  const cfg = LANE_CONFIG[lane];
  const listEl = document.getElementById(cfg.listId);
  const countEl = document.getElementById(cfg.countId);
  if (countEl) {
    countEl.textContent = `${formatNumberJa(totalLaneCount)}件`;
  }
  if (!listEl) return;

  clearChildren(listEl);
  if (displayItems.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = cfg.emptyMessage;
    listEl.appendChild(hint);
    return;
  }

  const frag = document.createDocumentFragment();
  for (let i = 0; i < displayItems.length; i += 1) {
    frag.appendChild(createChatItemElement(displayItems[i]));
  }
  listEl.appendChild(frag);
}

/**
 * レーン1列に新着コメントだけを差分で先頭へ追記し、上限（150件）を超えた末尾ノードだけを除去する。
 * @param {'rinku' | 'konta' | 'tanunee'} lane
 * @param {any[]} newlyAddedChronological
 * @param {number} totalLaneCount
 */
function patchLaneIncremental(lane, newlyAddedChronological, totalLaneCount) {
  const cfg = LANE_CONFIG[lane];
  const countEl = document.getElementById(cfg.countId);
  if (countEl) {
    countEl.textContent = `${formatNumberJa(totalLaneCount)}件`;
  }
  if (!newlyAddedChronological || newlyAddedChronological.length === 0) return;

  const listEl = document.getElementById(cfg.listId);
  if (!listEl) return;

  const emptyHint = listEl.querySelector('.empty-hint');
  if (emptyHint) {
    emptyHint.remove();
  }

  if (newlyAddedChronological.length >= YT_SIDE_PANEL_DISPLAY_LIMIT) {
    clearChildren(listEl);
    const newest = newlyAddedChronological.slice(-YT_SIDE_PANEL_DISPLAY_LIMIT).reverse();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < newest.length; i += 1) {
      frag.appendChild(createChatItemElement(newest[i]));
    }
    listEl.appendChild(frag);
    return;
  }

  const frag = document.createDocumentFragment();
  for (let i = newlyAddedChronological.length - 1; i >= 0; i -= 1) {
    frag.appendChild(createChatItemElement(newlyAddedChronological[i]));
  }
  listEl.insertBefore(frag, listEl.firstChild);

  while (listEl.children.length > YT_SIDE_PANEL_DISPLAY_LIMIT) {
    if (listEl.lastElementChild) {
      listEl.removeChild(listEl.lastElementChild);
    } else {
      break;
    }
  }
}

/**
 * 2. 3キャラの数字カード（りんく=記録 / こん太=同時接続 / たぬ姉=来場者数）と
 * 3. 数字の行（来場・コメント・経過・スパチャ合計・メンバー/ギフト件数）を更新する。
 *
 * @param {any} currentSummary
 * @param {number} totalComments
 * @param {any} ranking
 * @param {ReturnType<typeof createYtStreamIncrementalState> | null} incState
 */
function renderLiveStatsAndOfficialRow(currentSummary, totalComments, ranking, incState) {
  const uniqueVisitors = Number(ranking?.uniqueCommenterCount || 0);
  const concurrent =
    typeof currentSummary?.concurrentViewers === 'number' &&
    Number.isFinite(currentSummary.concurrentViewers) &&
    currentSummary.concurrentViewers >= 0
      ? currentSummary.concurrentViewers
      : null;

  // 2. 3キャラの数字カード
  const commentsCardVal = document.getElementById('liveStatComments');
  if (commentsCardVal) {
    commentsCardVal.textContent = formatNumberJa(totalComments);
  }

  const concurrentEstEl = document.getElementById('watchConcurrentEst');
  if (concurrentEstEl) {
    concurrentEstEl.textContent = concurrent !== null ? formatNumberJa(concurrent) : '—';
  }

  const visitorsCardVal = document.getElementById('watchViewerDom');
  if (visitorsCardVal) {
    visitorsCardVal.textContent = formatNumberJa(uniqueVisitors);
  }

  // 3. 数字の行（nl-official-nico-stats）
  const offVisitors = document.getElementById('officialStatVisitors');
  if (offVisitors) {
    offVisitors.textContent = formatNumberJa(uniqueVisitors);
  }

  const offComments = document.getElementById('officialStatComments');
  if (offComments) {
    offComments.textContent = formatNumberJa(totalComments);
  }

  const offElapsed = document.getElementById('officialStatElapsed');
  if (offElapsed) {
    const startMs =
      (incState && incState.firstRecordedAt > 0 ? incState.firstRecordedAt : 0) ||
      Number(currentSummary?.createdAt || 0);
    const endMs =
      Math.max(
        incState && incState.lastRecordedAt > 0 ? incState.lastRecordedAt : 0,
        Number(currentSummary?.updatedAt || 0),
      ) || Date.now();
    if (startMs > 0 && endMs >= startMs && (totalComments > 0 || currentSummary)) {
      offElapsed.textContent = formatElapsedDurationJa(endMs - startMs);
    } else {
      offElapsed.textContent = '—';
    }
  }

  const offSuperchat = document.getElementById('officialStatSuperchat');
  if (offSuperchat) {
    const primary = ranking?.primaryCurrencySummary;
    offSuperchat.textContent = primary?.formatted || '—';
  }

  const offMemGift = document.getElementById('officialStatMemberGift');
  if (offMemGift) {
    const memGiftCount =
      Number(ranking?.counts?.membership || 0) + Number(ranking?.counts?.membershipGift || 0);
    offMemGift.textContent = `${formatNumberJa(memGiftCount)}件`;
  }

  // コメビュ折りたたみのメタ件数
  const comeviewMeta = document.getElementById('yt-comeview-summary-meta');
  if (comeviewMeta) {
    comeviewMeta.textContent = `合計 ${formatNumberJa(totalComments)}件`;
  }
}

/**
 * 順位カード1枚（`.nl-top-support-rank__line`）を組み立てる。
 * @param {{
 *   placeText: string,
 *   countText: string,
 *   name: string,
 *   channelId: string,
 *   iconUrl: string,
 *   channelUrl?: string
 * }} opts
 * @returns {HTMLElement}
 */
function createSupportRankLineCard(opts) {
  const channelUrl = safeHttpUrl(opts.channelUrl || buildYtChannelUrl(opts.channelId));
  const card = channelUrl ? document.createElement('a') : document.createElement('div');
  card.className = channelUrl
    ? 'nl-top-support-rank__line nl-top-support-rank__line--linkable supporter-row'
    : 'nl-top-support-rank__line supporter-row';
  card.setAttribute('role', 'listitem');
  if (channelUrl) {
    /** @type {HTMLAnchorElement} */ (card).href = channelUrl;
    /** @type {HTMLAnchorElement} */ (card).target = '_blank';
    /** @type {HTMLAnchorElement} */ (card).rel = 'noopener noreferrer';
  }
  const displayName = String(opts.name || opts.channelId || 'リスナー').trim();
  const shortId = formatShortChannelId(opts.channelId);
  card.title = opts.channelId
    ? `${displayName} (${opts.channelId}) — ${opts.countText}`
    : `${displayName} — ${opts.countText}`;

  const placeSpan = document.createElement('span');
  placeSpan.className = 'nl-top-support-rank__place';
  placeSpan.textContent = opts.placeText;
  card.appendChild(placeSpan);

  const countSpan = document.createElement('span');
  countSpan.className = 'nl-top-support-rank__count';
  countSpan.textContent = opts.countText;
  card.appendChild(countSpan);

  const thumbWrap = document.createElement('span');
  thumbWrap.className = 'nl-top-support-rank__thumb-wrap';
  thumbWrap.appendChild(
    createAvatarImgWithFallback(
      opts.iconUrl || '',
      displayName,
      opts.channelId || displayName,
      'nl-top-support-rank__thumb',
    ),
  );
  card.appendChild(thumbWrap);

  if (shortId) {
    const idSpan = document.createElement('span');
    idSpan.className = 'nl-top-support-rank__id';
    idSpan.textContent = shortId;
    idSpan.title = opts.channelId;
    card.appendChild(idSpan);
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 'nl-top-support-rank__name';
  nameSpan.textContent = displayName;
  card.appendChild(nameSpan);

  return card;
}

/**
 * 4. 応援ユーザーの順位カード（`#topSupportRankStrip`）を描画する。
 * 左上に配信者カード、その後に 1位〜の人カード（コメント件数順・同数ならスパチャ額順）。
 *
 * @param {any} currentSummary
 * @param {any} ranking
 */
function renderTopSupportRankStrip(currentSummary, ranking) {
  const listEl = document.getElementById('topSupportRankList');
  if (!listEl) return;

  clearChildren(listEl);
  const frag = document.createDocumentFragment();

  // 左上: 配信者カード（.nl-top-support-rank__caster）
  const casterTile = document.createElement('div');
  casterTile.className = 'nl-top-support-rank__caster';
  casterTile.setAttribute('role', 'listitem');

  const casterLabel = document.createElement('span');
  casterLabel.className = 'nl-top-support-rank__caster-label';
  casterLabel.textContent = '配信者';
  casterTile.appendChild(casterLabel);

  const bName = String(
    currentSummary?.broadcasterName || currentSummary?.title || 'YouTube 配信者',
  ).trim();
  const bChannelId = String(currentSummary?.broadcasterChannelId || '').trim();
  const bChannelUrl =
    safeHttpUrl(buildYtChannelUrl(bChannelId)) ||
    (selectedVideoId
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(selectedVideoId)}`
      : '');

  const casterThumb = createAvatarImgWithFallback(
    currentSummary?.broadcasterIconUrl || '',
    bName,
    bChannelId || bName,
    'nl-top-support-rank__caster-thumb',
    BROADCASTER_FALLBACK_ICON,
  );
  casterTile.appendChild(casterThumb);

  const casterNameSpan = document.createElement('span');
  casterNameSpan.className = 'nl-top-support-rank__caster-name';
  casterNameSpan.textContent = bName;
  casterNameSpan.title = bChannelId ? `${bName} (${bChannelId})` : bName;
  casterTile.appendChild(casterNameSpan);

  if (bChannelUrl) {
    const followLink = document.createElement('a');
    followLink.className = 'nl-top-support-rank__caster-follow';
    followLink.href = bChannelUrl;
    followLink.target = '_blank';
    followLink.rel = 'noopener noreferrer';
    followLink.textContent = bChannelId ? 'チャンネル' : '視聴ページ';
    casterTile.appendChild(followLink);
  }
  frag.appendChild(casterTile);

  // 1位〜の人カード（コメント件数順、同数ならスパチャ額順。左上の配信者カードと重複しないよう配信者本人は除く）
  const commenters = (Array.isArray(ranking?.commenters) ? ranking.commenters : []).filter(
    (c) => !bChannelId || c.channelId !== bChannelId,
  );
  const topSlice = commenters.slice(0, TOP_SUPPORT_STRIP_LIMIT);
  for (let i = 0; i < topSlice.length; i += 1) {
    const c = topSlice[i];
    const countLabel = c.primaryFormattedAmount
      ? `${c.commentCount}件 · ${c.primaryFormattedAmount}`
      : `${c.commentCount}件`;
    frag.appendChild(
      createSupportRankLineCard({
        placeText: String(i + 1),
        countText: countLabel,
        name: c.name,
        channelId: c.channelId,
        iconUrl: c.iconUrl,
        channelUrl: c.channelUrl,
      }),
    );
  }

  listEl.appendChild(frag);
}

/**
 * 5. North Star レーン（「スパチャランキング（通貨別）」・「メンバー・ギフト」）を描画する。
 * @param {any} ranking
 */
function renderNorthStarSupportLanes(ranking) {
  const summaryEl = document.getElementById('yt-support-summary');
  const currencyContainer = document.getElementById('yt-currency-ranking-container');
  const memberSummaryEl = document.getElementById('yt-member-gift-summary');
  const memberListEl = document.getElementById('yt-member-gift-list');

  const paidTotalCount =
    Number(ranking?.counts?.superchat || 0) + Number(ranking?.counts?.sticker || 0);

  if (summaryEl) {
    summaryEl.textContent = `スパチャ・ステッカー ${formatNumberJa(paidTotalCount)}件（通貨別集計・換算なし）`;
  }
  if (memberSummaryEl) {
    memberSummaryEl.textContent = `メンバー加入 ${formatNumberJa(ranking?.counts?.membership || 0)}件 / ギフト ${formatNumberJa(ranking?.counts?.membershipGift || 0)}件`;
  }

  // レーン1: スパチャランキング（通貨別）
  if (currencyContainer) {
    clearChildren(currencyContainer);
    const currencies = Object.keys(ranking?.byCurrency || {});
    if (currencies.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = 'スーパーチャット・ステッカーが届くと通貨ごとに集計されます。';
      currencyContainer.appendChild(hint);
    } else {
      for (const currency of currencies) {
        const box = document.createElement('div');
        box.className = 'currency-box';
        box.dataset.currency = currency;

        const header = document.createElement('div');
        header.className = 'currency-header';
        const titleSpan = document.createElement('span');
        titleSpan.textContent = `${currency} ランキング`;
        const totalSpan = document.createElement('span');
        totalSpan.textContent = `合計 ${formatYtCurrencyAmount(
          ranking.totalsByCurrency[currency],
          currency,
        )}`;
        header.appendChild(titleSpan);
        header.appendChild(totalSpan);
        box.appendChild(header);

        const listWrap = document.createElement('div');
        listWrap.className = 'nl-top-support-rank__list';
        listWrap.setAttribute('role', 'list');

        const rows = ranking.byCurrency[currency].slice(0, 12);
        for (const row of rows) {
          listWrap.appendChild(
            createSupportRankLineCard({
              placeText: `${row.rank}位`,
              countText: `${row.formattedAmount} (${row.count}回)`,
              name: row.name,
              channelId: row.channelId,
              iconUrl: row.iconUrl,
              channelUrl: row.channelUrl,
            }),
          );
        }

        box.appendChild(listWrap);
        currencyContainer.appendChild(box);
      }
    }
  }

  // レーン2: メンバー・ギフト
  if (memberListEl) {
    clearChildren(memberListEl);
    const memberSupporters = (ranking?.supporters || []).filter(
      (/** @type {any} */ s) => s.membershipCount > 0 || s.giftCount > 0,
    );
    if (memberSupporters.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = 'メンバー加入・メンバーシップギフトが届くとここに表示されます。';
      memberListEl.appendChild(hint);
    } else {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < Math.min(memberSupporters.length, 16); i += 1) {
        const sup = memberSupporters[i];
        const badgeText =
          sup.giftCount > 0
            ? `ギフト ${sup.giftCount}回`
            : `メンバー加入 ${sup.membershipCount}回`;
        frag.appendChild(
          createSupportRankLineCard({
            placeText: `${i + 1}`,
            countText: badgeText,
            name: sup.name,
            channelId: sup.channelId,
            iconUrl: sup.iconUrl,
            channelUrl: sup.channelUrl,
          }),
        );
      }
      memberListEl.appendChild(frag);
    }
  }
}

/**
 * `.nl-story-userlane` 内の丸アイコン人物セル（名前・件数・金額バッジ付き）を生成する。
 * @param {{
 *   name: string,
 *   channelId: string,
 *   iconUrl: string,
 *   channelUrl?: string,
 *   pulseBadge?: string,
 *   statsBadge?: string
 * }} opts
 * @returns {HTMLElement}
 */
function createStoryUserlaneCell(opts) {
  const channelUrl = safeHttpUrl(opts.channelUrl || buildYtChannelUrl(opts.channelId));
  const cell = channelUrl ? document.createElement('a') : document.createElement('span');
  cell.className = channelUrl
    ? 'nl-story-userlane-cell nl-story-userlane-cell--linkable'
    : 'nl-story-userlane-cell';
  cell.setAttribute('role', 'listitem');
  if (channelUrl) {
    /** @type {HTMLAnchorElement} */ (cell).href = channelUrl;
    /** @type {HTMLAnchorElement} */ (cell).target = '_blank';
    /** @type {HTMLAnchorElement} */ (cell).rel = 'noopener noreferrer';
  }
  if (opts.pulseBadge) {
    cell.setAttribute('data-pulse', opts.pulseBadge);
  }

  const displayName = String(opts.name || opts.channelId || 'リスナー').trim();
  const shortId = formatShortChannelId(opts.channelId);
  cell.title = opts.channelId ? `${displayName} (${opts.channelId})` : displayName;

  cell.appendChild(
    createAvatarImgWithFallback(
      opts.iconUrl || '',
      displayName,
      opts.channelId || displayName,
      'nl-story-userlane-avatar',
    ),
  );

  const meta = document.createElement('span');
  meta.className = 'nl-story-userlane-meta';
  if (opts.statsBadge) {
    meta.setAttribute('data-stats', opts.statsBadge);
  }

  if (shortId) {
    const idSpan = document.createElement('span');
    idSpan.className = 'nl-story-userlane-meta__id';
    idSpan.textContent = shortId;
    meta.appendChild(idSpan);
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 'nl-story-userlane-meta__name';
  nameSpan.textContent = displayName;
  meta.appendChild(nameSpan);

  cell.appendChild(meta);
  return cell;
}

/**
 * 6. 「アイコン列・グリッド・診断を表示」（`#supportVisualDetails`）内の
 * 3つの列（スパチャ列・メンバー/ギフト列・コメントした人（件数順））と
 * 全員丸アイコン敷き詰めグリッド（`#sceneStoryGrowth` + `いま N 人を表示中`）を描画する。
 *
 * @param {any} ranking
 */
function renderSupportVisualDetails(ranking) {
  const commenters = Array.isArray(ranking?.commenters) ? ranking.commenters : [];

  // 1) スパチャ列
  const superchatLaneEl = document.getElementById('storyUserLaneSuperchat');
  const superchatCountEl = document.getElementById('storyLaneSuperchatCount');
  const superchatUsers = commenters
    .filter((c) => c.superchatCount + c.stickerCount > 0)
    .sort((a, b) => {
      if (b.superchatTotalAmount !== a.superchatTotalAmount) {
        return b.superchatTotalAmount - a.superchatTotalAmount;
      }
      return b.commentCount - a.commentCount;
    });
  if (superchatCountEl) {
    superchatCountEl.textContent = `${formatNumberJa(superchatUsers.length)}人`;
  }
  if (superchatLaneEl) {
    clearChildren(superchatLaneEl);
    if (superchatUsers.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'nl-story-userlane__empty-note';
      empty.textContent = 'Super Chat / Sticker の応援者が届くとここに丸アイコンが並びます。';
      superchatLaneEl.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      for (const u of superchatUsers.slice(0, STORY_USERLANE_LIMIT)) {
        const amtText = u.primaryFormattedAmount || `${u.superchatCount + u.stickerCount}回`;
        frag.appendChild(
          createStoryUserlaneCell({
            name: u.name,
            channelId: u.channelId,
            iconUrl: u.iconUrl,
            channelUrl: u.channelUrl,
            pulseBadge: amtText,
            statsBadge: `💬${u.commentCount}件 💰${amtText}`,
          }),
        );
      }
      superchatLaneEl.appendChild(frag);
    }
  }

  // 2) メンバー・ギフト列
  const memberLaneEl = document.getElementById('storyUserLaneMemberGift');
  const memberCountEl = document.getElementById('storyLaneMemberGiftCount');
  const memberUsers = commenters
    .filter((c) => c.giftCount > 0 || c.membershipCount > 0 || c.isMember)
    .sort((a, b) => {
      if (b.giftCount !== a.giftCount) return b.giftCount - a.giftCount;
      if (b.membershipCount !== a.membershipCount) return b.membershipCount - a.membershipCount;
      return b.commentCount - a.commentCount;
    });
  if (memberCountEl) {
    memberCountEl.textContent = `${formatNumberJa(memberUsers.length)}人`;
  }
  if (memberLaneEl) {
    clearChildren(memberLaneEl);
    if (memberUsers.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'nl-story-userlane__empty-note';
      empty.textContent = 'メンバー加入・ギフト・メンバー発言者が届くとここに丸アイコンが並びます。';
      memberLaneEl.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      for (const u of memberUsers.slice(0, STORY_USERLANE_LIMIT)) {
        const pulse =
          u.giftCount > 0
            ? `🎁${u.giftCount}回`
            : u.membershipCount > 0
              ? `加入${u.membershipCount}回`
              : '⭐メンバー';
        frag.appendChild(
          createStoryUserlaneCell({
            name: u.name,
            channelId: u.channelId,
            iconUrl: u.iconUrl,
            channelUrl: u.channelUrl,
            pulseBadge: pulse,
            statsBadge: `💬${u.commentCount}件 ${pulse}`,
          }),
        );
      }
      memberLaneEl.appendChild(frag);
    }
  }

  // 3) コメントした人（件数順）
  const commentersLaneEl = document.getElementById('storyUserLaneCommenters');
  const commentersCountEl = document.getElementById('storyLaneCommentersCount');
  if (commentersCountEl) {
    commentersCountEl.textContent = `${formatNumberJa(commenters.length)}人`;
  }
  if (commentersLaneEl) {
    clearChildren(commentersLaneEl);
    if (commenters.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'nl-story-userlane__empty-note';
      empty.textContent = 'コメントした人が届くと件数順に丸アイコンが並びます。';
      commentersLaneEl.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      for (const u of commenters.slice(0, STORY_USERLANE_LIMIT)) {
        const stats = u.primaryFormattedAmount
          ? `💬${u.commentCount}件 · ${u.primaryFormattedAmount}`
          : `💬${u.commentCount}件`;
        frag.appendChild(
          createStoryUserlaneCell({
            name: u.name,
            channelId: u.channelId,
            iconUrl: u.iconUrl,
            channelUrl: u.channelUrl,
            pulseBadge: `${u.commentCount}件`,
            statsBadge: stats,
          }),
        );
      }
      commentersLaneEl.appendChild(frag);
    }
  }

  // 4) コメントした全員の顔を小さな丸で敷き詰めるグリッド（件数バッジ付き・「いま N 人を表示中」）
  const growthGridEl = document.getElementById('sceneStoryGrowth');
  const gaugeLabelEl = document.getElementById('sceneStoryGaugeLabel');
  const gridSlice = commenters.slice(0, STORY_GROWTH_GRID_LIMIT);
  if (growthGridEl) {
    clearChildren(growthGridEl);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < gridSlice.length; i += 1) {
      const u = gridSlice[i];
      const channelUrl = safeHttpUrl(u.channelUrl || buildYtChannelUrl(u.channelId));
      const cell = channelUrl ? document.createElement('a') : document.createElement('span');
      cell.className = 'nl-story-growth-cell nl-story-growth-cell--repeat';
      cell.setAttribute('data-support-ordinal', String(u.commentCount));
      cell.title = `${u.name} (${u.commentCount}件)`;
      if (channelUrl) {
        /** @type {HTMLAnchorElement} */ (cell).href = channelUrl;
        /** @type {HTMLAnchorElement} */ (cell).target = '_blank';
        /** @type {HTMLAnchorElement} */ (cell).rel = 'noopener noreferrer';
      }

      const media = document.createElement('span');
      media.className = 'nl-story-growth-cell__media';
      media.appendChild(
        createAvatarImgWithFallback(
          u.iconUrl || '',
          u.name,
          u.channelId || u.name,
          'nl-story-growth-icon nl-story-growth-icon--remote',
        ),
      );
      cell.appendChild(media);
      frag.appendChild(cell);
    }
    growthGridEl.appendChild(frag);
  }
  if (gaugeLabelEl) {
    gaugeLabelEl.textContent = `いま ${formatNumberJa(commenters.length)} 人を表示中`;
  }
  visualDetailsNeedsRefresh = false;
}

/**
 * 読み上げ設定・VOICEVOX接続状態・待機キュー表示だけを更新する（IndexedDB アクセスなし）。
 * @param {Record<string, any>} [prefetchedData]
 */
async function renderVoiceUiFromStorage(prefetchedData) {
  const data =
    prefetchedData ||
    (await chrome.storage.local.get([
      STORAGE_KEYS.STREAM_SUMMARIES,
      STORAGE_KEYS.VOICE_SETTINGS,
      STORAGE_KEYS.VOICE_QUEUE,
      STORAGE_KEYS.VOICE_STATE,
    ]));

  const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
  const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
  const settings = data[STORAGE_KEYS.VOICE_SETTINGS] || {
    enabled: true,
    mode: YT_VOICE_MODES.ALL,
    broadcasterNameOverride: '',
  };
  const voiceState = data[STORAGE_KEYS.VOICE_STATE] || {
    effectiveMode: settings.mode,
    autoSwitched: false,
  };
  const voiceQueue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
    ? data[STORAGE_KEYS.VOICE_QUEUE]
    : [];

  const enabledEl = /** @type {HTMLInputElement | null} */ (
    document.getElementById('yt-voice-enabled')
  );
  if (enabledEl && document.activeElement !== enabledEl) {
    enabledEl.checked = Boolean(settings.enabled);
  }

  const modeEl = /** @type {HTMLSelectElement | null} */ (
    document.getElementById('yt-voice-mode')
  );
  if (modeEl && document.activeElement !== modeEl) {
    modeEl.value = settings.mode === YT_VOICE_MODES.SELECT ? 'select' : 'all';
  }

  const bNameInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById('yt-broadcaster-name-input')
  );
  if (bNameInput && document.activeElement !== bNameInput) {
    bNameInput.value =
      settings.broadcasterNameOverride || currentSummary?.broadcasterName || '';
  }

  const queueInfoEl = document.getElementById('yt-voice-queue-info');
  if (queueInfoEl) {
    const modeLabel =
      voiceState.effectiveMode === YT_VOICE_MODES.SELECT ? '選んで読む' : '全部読む';
    queueInfoEl.textContent = `待機キュー: ${voiceQueue.length}件（実効モード: ${modeLabel}）`;
  }

  const autoSwitchBadge = document.getElementById('yt-voice-autoswitch-badge');
  if (autoSwitchBadge) {
    if (voiceState.autoSwitched) {
      autoSwitchBadge.classList.add('is-active');
    } else {
      autoSwitchBadge.classList.remove('is-active');
    }
  }

  const statusBox = document.getElementById('yt-voice-status-box');
  if (statusBox) {
    if (voiceState.voicevoxOnline === true) {
      const styleCount =
        Number(voiceState.availableStyleCount) ||
        (Array.isArray(settings.availableStyleIds)
          ? settings.availableStyleIds.length
          : YT_DEFAULT_STYLE_IDS.length);
      statusBox.className = 'voice-status-box is-online';
      statusBox.textContent = `VOICEVOX 接続中（${VOICEVOX_BASE_URL} / 利用可能スタイル: ${styleCount}種・サイドパネルを閉じていても再生継続）`;
    } else if (voiceState.voicevoxOnline === false) {
      const detail =
        voiceState.voicevoxReason === 'timeout'
          ? '応答がタイムアウトしました'
          : 'ローカルの VOICEVOX エンジンへ接続できませんでした';
      statusBox.className = 'voice-status-box is-offline';
      statusBox.textContent = `VOICEVOX が起動していません（${VOICEVOX_BASE_URL} — ${detail}）。VOICEVOX を起動して「VOICEVOX 再確認」を押すと、チャンネルIDごとに決まった声で読み上げます。`;
    }
  }

  const lastSpokenEl = document.getElementById('yt-voice-last-spoken');
  if (lastSpokenEl && voiceState.lastSpokenSummary) {
    lastSpokenEl.textContent = String(voiceState.lastSpokenSummary);
  }
}

/**
 * 配信セレクタ・要約テキスト・チャット表示フィルタバッジを更新する。
 * @param {Record<string, any>} summaries
 * @param {string} activeId
 * @param {number} totalItemsCount
 */
function updateStreamHeaderUi(summaries, activeId, totalItemsCount) {
  const videoIds = Object.keys(summaries).sort(
    (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0),
  );
  if (!selectedVideoId || !summaries[selectedVideoId]) {
    selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || '';
  }

  const selectEl = /** @type {HTMLSelectElement | null} */ (
    document.getElementById('yt-stream-select')
  );
  if (selectEl && document.activeElement !== selectEl) {
    clearChildren(selectEl);
    if (videoIds.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '記録済みの配信はまだありません';
      selectEl.appendChild(opt);
    } else {
      for (const vid of videoIds) {
        const s = summaries[vid];
        const opt = document.createElement('option');
        opt.value = vid;
        const labelTitle = s.title || vid;
        opt.textContent = `${labelTitle} (${formatNumberJa(Number(s.itemCount || 0))}件)`;
        if (vid === selectedVideoId) opt.selected = true;
        selectEl.appendChild(opt);
      }
    }
  }

  const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
  const summaryEl = document.getElementById('yt-stream-summary');
  if (summaryEl) {
    if (currentSummary) {
      const bName = currentSummary.broadcasterName
        ? ` / 配信者: ${currentSummary.broadcasterName}`
        : '';
      summaryEl.textContent = `記録中: ${currentSummary.title || currentSummary.videoId}${bName}（合計 ${formatNumberJa(totalItemsCount)}件）`;
    } else {
      summaryEl.textContent = 'YouTube Live の視聴ページを開くと自動でチャットを記録します';
    }
  }

  const filterBadge = document.getElementById('yt-detected-filter-badge');
  const noticeBanner = document.getElementById('yt-all-chat-notice');
  const filterLabel = String(currentSummary?.chatFilterLabel || '').trim();
  if (filterBadge && noticeBanner) {
    if (!filterLabel) {
      filterBadge.textContent = 'チャット表示: 検出待ち';
      noticeBanner.classList.remove('is-warning');
    } else if (/トップチャット|top chat/i.test(filterLabel)) {
      filterBadge.textContent = `現在「${filterLabel}」— 「すべてのチャット」推奨`;
      noticeBanner.classList.add('is-warning');
    } else {
      filterBadge.textContent = `チャット表示: ${filterLabel}`;
      noticeBanner.classList.remove('is-warning');
    }
  }
}

/**
 * 初回オープン時または配信切替時に、選択中の配信を1回だけ IndexedDB から読み込んで初期状態を作る。
 */
async function renderStreamFullLoad() {
  const t0 = performance.now();
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.STREAM_SUMMARIES,
    STORAGE_KEYS.ACTIVE_VIDEO_ID,
    STORAGE_KEYS.VOICE_SETTINGS,
    STORAGE_KEYS.VOICE_QUEUE,
    STORAGE_KEYS.VOICE_STATE,
  ]);

  const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
  const activeId = String(data[STORAGE_KEYS.ACTIVE_VIDEO_ID] || '');
  const videoIds = Object.keys(summaries).sort(
    (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0),
  );
  if (!selectedVideoId || !summaries[selectedVideoId]) {
    selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || '';
  }

  const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
  const items = selectedVideoId ? await getYtStreamCommentsByVideoId(selectedVideoId) : [];
  metrics.fullGetAllCount += 1;

  currentIncrementalState = createYtStreamIncrementalState(selectedVideoId, {
    broadcasterChannelId: currentSummary?.broadcasterChannelId || '',
    displayLimit: YT_SIDE_PANEL_DISPLAY_LIMIT,
  });

  const applied = applyYtStreamIncrementalItems(currentIncrementalState, items, {
    broadcasterChannelId: currentSummary?.broadcasterChannelId || '',
  });

  updateStreamHeaderUi(summaries, activeId, applied.totalCount);
  renderLiveStatsAndOfficialRow(
    currentSummary,
    applied.totalCount,
    applied.ranking,
    currentIncrementalState,
  );
  renderTopSupportRankStrip(currentSummary, applied.ranking);
  renderNorthStarSupportLanes(applied.ranking);
  renderSupportVisualDetails(applied.ranking);

  await renderVoiceUiFromStorage(data);
  renderLaneFull('rinku', applied.laneDisplay.rinku, applied.laneCounts.rinku);
  renderLaneFull('konta', applied.laneDisplay.konta, applied.laneCounts.konta);
  renderLaneFull('tanunee', applied.laneDisplay.tanunee, applied.laneCounts.tanunee);

  metrics.lastFullLoadDurationMs = Math.round((performance.now() - t0) * 100) / 100;
}

/**
 * `yt_stream_summaries` 変化時に、全件 `getAll` せず `lastRecordedAt` 以降の新着レコードだけを
 * IndexedDB から差分取得し、各セクションを差分更新する。
 */
async function renderStreamIncrementalUpdate() {
  const t0 = performance.now();
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.STREAM_SUMMARIES,
    STORAGE_KEYS.ACTIVE_VIDEO_ID,
    STORAGE_KEYS.VOICE_SETTINGS,
    STORAGE_KEYS.VOICE_QUEUE,
    STORAGE_KEYS.VOICE_STATE,
  ]);

  const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
  const activeId = String(data[STORAGE_KEYS.ACTIVE_VIDEO_ID] || '');
  const videoIds = Object.keys(summaries).sort(
    (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0),
  );
  if (!selectedVideoId || !summaries[selectedVideoId]) {
    selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || '';
  }

  if (!currentIncrementalState || currentIncrementalState.videoId !== selectedVideoId) {
    await renderStreamFullLoad();
    return;
  }

  const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
  const newRecords = selectedVideoId
    ? await getYtStreamCommentsSince(selectedVideoId, currentIncrementalState.lastRecordedAt)
    : [];
  metrics.incrementalFetchCount += 1;
  metrics.lastIncrementalFetchedItems = newRecords.length;

  const applied = applyYtStreamIncrementalItems(currentIncrementalState, newRecords, {
    broadcasterChannelId: currentSummary?.broadcasterChannelId || '',
  });
  metrics.lastIncrementalAddedItems = applied.addedCount;

  updateStreamHeaderUi(summaries, activeId, applied.totalCount);
  renderLiveStatsAndOfficialRow(
    currentSummary,
    applied.totalCount,
    applied.ranking,
    currentIncrementalState,
  );
  await renderVoiceUiFromStorage(data);

  if (applied.addedCount > 0) {
    patchLaneIncremental('rinku', applied.addedByLane.rinku, applied.laneCounts.rinku);
    patchLaneIncremental('konta', applied.addedByLane.konta, applied.laneCounts.konta);
    patchLaneIncremental('tanunee', applied.addedByLane.tanunee, applied.laneCounts.tanunee);
    renderTopSupportRankStrip(currentSummary, applied.ranking);

    const visualDetailsEl = /** @type {HTMLDetailsElement | null} */ (
      document.getElementById('supportVisualDetails')
    );
    if (visualDetailsEl?.open) {
      renderSupportVisualDetails(applied.ranking);
    } else {
      visualDetailsNeedsRefresh = true;
    }
  }

  if (applied.rankingChanged) {
    renderNorthStarSupportLanes(applied.ranking);
  }

  metrics.lastIncrementalDurationMs = Math.round((performance.now() - t0) * 100) / 100;
}

/**
 * Background / Offscreen に VOICEVOX 状態の再確認を依頼し、結果を表示に反映する。
 */
function requestVoicevoxRecheck() {
  chrome.runtime.sendMessage({ type: 'YT_RECHECK_VOICEVOX' }, () => {
    void chrome.runtime.lastError;
    runRenderSerialized(() => renderVoiceUiFromStorage());
  });
}

/**
 * 折りたたみ欄（設定・コメビュ・アイコン列）の開閉状態を復元・保存する。
 * 初期状態はいずれも閉じた状態（false）とする。
 */
async function restoreCollapsibleUiState() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEYS.UI_STATE]);
    const uiState = data[STORAGE_KEYS.UI_STATE] || {};
    const settingsDetails = /** @type {HTMLDetailsElement | null} */ (
      document.getElementById('yt-settings-details')
    );
    const comeviewDetails = /** @type {HTMLDetailsElement | null} */ (
      document.getElementById('yt-comeview-details')
    );
    const supportVisualDetails = /** @type {HTMLDetailsElement | null} */ (
      document.getElementById('supportVisualDetails')
    );
    if (settingsDetails) {
      settingsDetails.open = uiState.settingsOpen === true;
    }
    if (comeviewDetails) {
      comeviewDetails.open = uiState.comeviewOpen === true;
    }
    if (supportVisualDetails) {
      supportVisualDetails.open = uiState.supportVisualOpen === true;
    }
  } catch {
    // ignore
  }
}

function saveCollapsibleUiState() {
  try {
    const settingsDetails = /** @type {HTMLDetailsElement | null} */ (
      document.getElementById('yt-settings-details')
    );
    const comeviewDetails = /** @type {HTMLDetailsElement | null} */ (
      document.getElementById('yt-comeview-details')
    );
    const supportVisualDetails = /** @type {HTMLDetailsElement | null} */ (
      document.getElementById('supportVisualDetails')
    );
    chrome.storage.local.set({
      [STORAGE_KEYS.UI_STATE]: {
        settingsOpen: Boolean(settingsDetails?.open),
        comeviewOpen: Boolean(comeviewDetails?.open),
        supportVisualOpen: Boolean(supportVisualDetails?.open),
      },
    });
  } catch {
    // ignore
  }
}

function bindUiEvents() {
  // 1. 上部ボタン列: ↻ 再読み込み / 💬 コメビュ / 🔊 読み上げ
  const reloadBtn = document.getElementById('reloadWatchTabBtn');
  reloadBtn?.addEventListener('click', () => {
    try {
      chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
        void chrome.runtime.lastError;
        const activeTab = tabs && tabs[0];
        if (activeTab?.id && activeTab.url && /youtube\.com\/watch/i.test(activeTab.url)) {
          chrome.tabs.reload(activeTab.id);
        }
      });
    } catch {
      // ignore
    }
    runRenderSerialized(() => renderStreamFullLoad());
  });

  const openComeviewBtn = document.getElementById('openComeviewBtn');
  openComeviewBtn?.addEventListener('click', () => {
    const comeviewDetails = /** @type {HTMLDetailsElement | null} */ (
      document.getElementById('yt-comeview-details')
    );
    if (!comeviewDetails) return;
    comeviewDetails.open = !comeviewDetails.open;
    saveCollapsibleUiState();
    if (comeviewDetails.open) {
      comeviewDetails.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  const openVoiceBtn = document.getElementById('openComeviewVoiceBtn');
  openVoiceBtn?.addEventListener('click', () => {
    const settingsDetails = /** @type {HTMLDetailsElement | null} */ (
      document.getElementById('yt-settings-details')
    );
    if (!settingsDetails) return;
    settingsDetails.open = !settingsDetails.open;
    saveCollapsibleUiState();
    if (settingsDetails.open) {
      settingsDetails.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  const supportVisualDetails = /** @type {HTMLDetailsElement | null} */ (
    document.getElementById('supportVisualDetails')
  );
  supportVisualDetails?.addEventListener('toggle', () => {
    if (
      supportVisualDetails.open &&
      visualDetailsNeedsRefresh &&
      currentIncrementalState?.rankingAcc?.snapshot
    ) {
      renderSupportVisualDetails(currentIncrementalState.rankingAcc.snapshot);
    }
    saveCollapsibleUiState();
  });

  const comeviewDetails = document.getElementById('yt-comeview-details');
  comeviewDetails?.addEventListener('toggle', () => {
    saveCollapsibleUiState();
  });

  const settingsDetails = document.getElementById('yt-settings-details');
  settingsDetails?.addEventListener('toggle', () => {
    saveCollapsibleUiState();
  });

  const selectEl = /** @type {HTMLSelectElement | null} */ (
    document.getElementById('yt-stream-select')
  );
  selectEl?.addEventListener('change', () => {
    selectedVideoId = selectEl.value;
    runRenderSerialized(() => renderStreamFullLoad());
  });

  const enabledEl = /** @type {HTMLInputElement | null} */ (
    document.getElementById('yt-voice-enabled')
  );
  enabledEl?.addEventListener('change', () => {
    chrome.runtime.sendMessage(
      {
        type: 'YT_UPDATE_VOICE_SETTINGS',
        payload: { enabled: enabledEl.checked },
      },
      () => {
        void chrome.runtime.lastError;
        runRenderSerialized(() => renderVoiceUiFromStorage());
      },
    );
  });

  const modeEl = /** @type {HTMLSelectElement | null} */ (
    document.getElementById('yt-voice-mode')
  );
  modeEl?.addEventListener('change', () => {
    chrome.runtime.sendMessage(
      {
        type: 'YT_UPDATE_VOICE_SETTINGS',
        payload: { mode: modeEl.value === 'select' ? YT_VOICE_MODES.SELECT : YT_VOICE_MODES.ALL },
      },
      () => {
        void chrome.runtime.lastError;
        runRenderSerialized(() => renderVoiceUiFromStorage());
      },
    );
  });

  const bNameInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById('yt-broadcaster-name-input')
  );
  bNameInput?.addEventListener('change', () => {
    chrome.runtime.sendMessage(
      {
        type: 'YT_UPDATE_VOICE_SETTINGS',
        payload: { broadcasterNameOverride: bNameInput.value.trim() },
      },
      () => {
        void chrome.runtime.lastError;
        runRenderSerialized(() => renderVoiceUiFromStorage());
      },
    );
  });

  const recheckBtn = document.getElementById('yt-voice-recheck-btn');
  recheckBtn?.addEventListener('click', () => {
    requestVoicevoxRecheck();
  });

  const clearBtn = document.getElementById('yt-voice-clear-btn');
  clearBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'YT_CLEAR_VOICE_QUEUE' }, () => {
      void chrome.runtime.lastError;
      runRenderSerialized(() => renderVoiceUiFromStorage());
    });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[STORAGE_KEYS.UI_STATE] && Object.keys(changes).length === 1) {
      return;
    }
    const streamChanged = Boolean(
      changes[STORAGE_KEYS.STREAM_SUMMARIES] || changes[STORAGE_KEYS.ACTIVE_VIDEO_ID],
    );
    if (streamChanged) {
      runRenderSerialized(() => renderStreamIncrementalUpdate());
    } else {
      metrics.voiceOnlyUpdateCount += 1;
      runRenderSerialized(() => renderVoiceUiFromStorage());
    }
  });
}

async function initSidepanel() {
  await restoreCollapsibleUiState();
  bindUiEvents();
  await runRenderSerialized(() => renderStreamFullLoad());
  requestVoicevoxRecheck();
}

initSidepanel();
