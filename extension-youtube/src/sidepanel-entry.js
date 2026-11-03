// sidepanel-entry.js — YouTube Live 3レーン・通貨別応援者ランキング・読み上げ設定の表示専用 UI（差分更新対応）
/* global window, chrome, document, performance */

import { safeHttpUrl } from '../../src/lib/htmlText.js';
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

let selectedVideoId = '';
/** @type {ReturnType<typeof createYtStreamIncrementalState> | null} */
let currentIncrementalState = null;
let renderJobChain = Promise.resolve();

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
 * アイコン画像要素を生成する。CDN 404 等の読み込み失敗時は自動でゆっくりキャラまたは頭文字バッジに差し替える（AGENTS.md §3.6）。
 * @param {string} iconUrl
 * @param {string} name
 * @param {string} [fallbackIconPath]
 * @returns {HTMLElement}
 */
function createAvatarNode(iconUrl, name, fallbackIconPath) {
  const safeUrl = safeHttpUrl(iconUrl || '');

  const makeFallback = () => {
    if (fallbackIconPath) {
      const fImg = document.createElement('img');
      fImg.className = 'nl-story-userlane-avatar avatar-img';
      fImg.src = fallbackIconPath;
      fImg.alt = name || 'icon';
      fImg.decoding = 'async';
      return fImg;
    }
    const initial =
      String(name || '?')
        .replace(/^@/, '')
        .trim()
        .slice(0, 1)
        .toUpperCase() || '?';
    const span = document.createElement('span');
    span.className = 'avatar-fallback';
    span.textContent = initial;
    return span;
  };

  if (!safeUrl) {
    return makeFallback();
  }

  const img = document.createElement('img');
  img.className = 'nl-story-userlane-avatar avatar-img';
  img.src = safeUrl;
  img.alt = name || 'icon';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => {
    const fallback = makeFallback();
    if (img.parentNode) {
      img.parentNode.replaceChild(fallback, img);
    }
  });
  return img;
}

/**
 * 人物表示ノード（サムネ・ハンドルネーム・チャンネルID・リンク）をニコ生版 `.nl-story-userlane-cell` 構造で組み立てる（AGENTS.md §3.5）。
 * @param {{ name?: string, channelId?: string, iconUrl?: string, voiceStyleId?: number }} user
 * @param {string} [fallbackIconPath]
 * @returns {DocumentFragment}
 */
function createAuthorHeaderFragment(user, fallbackIconPath) {
  const frag = document.createDocumentFragment();
  const displayName = String(user.name || user.channelId || '匿名リスナー').trim();
  const channelId = String(user.channelId || '').trim();
  const channelUrl = safeHttpUrl(buildYtChannelUrl(channelId));
  const shortId = channelId
    ? `${channelId.slice(0, 14)}${channelId.length > 14 ? '…' : ''}`
    : '';

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

  cell.appendChild(createAvatarNode(user.iconUrl || '', displayName, fallbackIconPath));

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
 * @param {'rinku' | 'konta' | 'tanunee'} [lane]
 * @returns {HTMLElement}
 */
function createChatItemElement(item, lane = 'tanunee') {
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

  const fallbackIcon = LANE_CONFIG[lane]?.fallbackIcon || LANE_CONFIG.tanunee.fallbackIcon;
  const head = document.createElement('div');
  head.className = 'chat-item-head';
  head.appendChild(createAuthorHeaderFragment(item, fallbackIcon));

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
 * @param {any[]} displayItems 既に新しい順（降順）で上限件数にスライスされた配列
 * @param {number} totalLaneCount
 */
function renderLaneFull(lane, displayItems, totalLaneCount) {
  const cfg = LANE_CONFIG[lane];
  const listEl = document.getElementById(cfg.listId);
  const countEl = document.getElementById(cfg.countId);
  if (countEl) {
    countEl.textContent = `${totalLaneCount}件`;
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
    frag.appendChild(createChatItemElement(displayItems[i], lane));
  }
  listEl.appendChild(frag);
}

/**
 * レーン1列に新着コメントだけを差分で先頭へ追記し、上限（150件）を超えた末尾ノードだけを除去する。
 * @param {'rinku' | 'konta' | 'tanunee'} lane
 * @param {any[]} newlyAddedChronological 時系列順の新着配列
 * @param {number} totalLaneCount
 */
function patchLaneIncremental(lane, newlyAddedChronological, totalLaneCount) {
  const cfg = LANE_CONFIG[lane];
  const countEl = document.getElementById(cfg.countId);
  if (countEl) {
    countEl.textContent = `${totalLaneCount}件`;
  }
  if (!newlyAddedChronological || newlyAddedChronological.length === 0) return;

  const listEl = document.getElementById(cfg.listId);
  if (!listEl) return;

  // 空案内ヒントがあれば除去
  const emptyHint = listEl.querySelector('.empty-hint');
  if (emptyHint) {
    emptyHint.remove();
  }

  // 新着数が表示上限以上の場合は最新分だけで置換
  if (newlyAddedChronological.length >= YT_SIDE_PANEL_DISPLAY_LIMIT) {
    clearChildren(listEl);
    const newest = newlyAddedChronological.slice(-YT_SIDE_PANEL_DISPLAY_LIMIT).reverse();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < newest.length; i += 1) {
      frag.appendChild(createChatItemElement(newest[i], lane));
    }
    listEl.appendChild(frag);
    return;
  }

  // 新しい順（降順）で先頭に insertBefore
  const frag = document.createDocumentFragment();
  for (let i = newlyAddedChronological.length - 1; i >= 0; i -= 1) {
    frag.appendChild(createChatItemElement(newlyAddedChronological[i], lane));
  }
  listEl.insertBefore(frag, listEl.firstChild);

  // 上限 150 件を超えた古い末尾ノードだけを除去
  while (listEl.children.length > YT_SIDE_PANEL_DISPLAY_LIMIT) {
    if (listEl.lastElementChild) {
      listEl.removeChild(listEl.lastElementChild);
    } else {
      break;
    }
  }
}

/**
 * 通貨別の応援者ランキングを描画する（通貨換算はしない）。
 * @param {any} ranking
 */
function renderSupportRanking(ranking) {
  const summaryEl = document.getElementById('yt-support-summary');
  const containerEl = document.getElementById('yt-currency-ranking-container');

  const paidTotalCount = ranking.counts.superchat + ranking.counts.sticker;
  const memberTotalCount = ranking.counts.membership + ranking.counts.membershipGift;
  if (summaryEl) {
    summaryEl.textContent = `スパチャ・ステッカー ${paidTotalCount}件 / メンバー・ギフト ${memberTotalCount}件`;
  }
  if (!containerEl) return;

  clearChildren(containerEl);

  const currencies = Object.keys(ranking.byCurrency);
  if (currencies.length === 0 && ranking.supporters.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'スーパーチャット・ステッカー・メンバー加入が届くと通貨ごとに集計されます。';
    containerEl.appendChild(hint);
    return;
  }

  const kontaFallback = LANE_CONFIG.konta.fallbackIcon;

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

    const rows = ranking.byCurrency[currency].slice(0, 10);
    for (const row of rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'nl-top-support-rank__line supporter-row';
      rowEl.setAttribute('role', 'listitem');

      const rankSpan = document.createElement('span');
      rankSpan.className = 'nl-top-support-rank__place rank-badge';
      rankSpan.textContent = `${row.rank}位`;
      rowEl.appendChild(rankSpan);

      rowEl.appendChild(
        createAuthorHeaderFragment(
          {
            name: row.name,
            channelId: row.channelId,
            iconUrl: row.iconUrl,
          },
          kontaFallback,
        ),
      );

      const amountSpan = document.createElement('span');
      amountSpan.className = 'nl-top-support-rank__count amount-pill';
      amountSpan.style.marginLeft = 'auto';
      amountSpan.textContent = `${row.formattedAmount} (${row.count}回)`;
      rowEl.appendChild(amountSpan);

      listWrap.appendChild(rowEl);
    }

    box.appendChild(listWrap);
    containerEl.appendChild(box);
  }

  const memberSupporters = ranking.supporters.filter(
    (/** @type {any} */ s) => s.membershipCount > 0 || s.giftCount > 0,
  );
  if (memberSupporters.length > 0) {
    const box = document.createElement('div');
    box.className = 'currency-box';
    box.dataset.currency = 'MEMBERSHIP';

    const header = document.createElement('div');
    header.className = 'currency-header';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = 'メンバー加入・ギフト応援者';
    const totalSpan = document.createElement('span');
    totalSpan.textContent = `加入 ${ranking.counts.membership} / ギフト ${ranking.counts.membershipGift}`;
    header.appendChild(titleSpan);
    header.appendChild(totalSpan);
    box.appendChild(header);

    const listWrap = document.createElement('div');
    listWrap.className = 'nl-top-support-rank__list';
    listWrap.setAttribute('role', 'list');

    for (const sup of memberSupporters.slice(0, 10)) {
      const rowEl = document.createElement('div');
      rowEl.className = 'nl-top-support-rank__line supporter-row';
      rowEl.setAttribute('role', 'listitem');
      rowEl.appendChild(
        createAuthorHeaderFragment(
          {
            name: sup.name,
            channelId: sup.channelId,
            iconUrl: sup.iconUrl,
          },
          kontaFallback,
        ),
      );
      const badge = document.createElement('span');
      badge.className = 'member-pill';
      badge.style.marginLeft = 'auto';
      badge.textContent =
        sup.giftCount > 0 ? `ギフト ${sup.giftCount}回` : `メンバー加入 ${sup.membershipCount}回`;
      rowEl.appendChild(badge);
      listWrap.appendChild(rowEl);
    }

    box.appendChild(listWrap);
    containerEl.appendChild(box);
  }
}

/**
 * 読み上げ設定・VOICEVOX接続状態・待機キュー表示だけを更新する（IndexedDB アクセスなし）。
 * 音声合成・再生自体は `offscreen.html` が行うため、サイドパネルは設定と表示のみを担う。
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
 * ヘッダーの配信セレクタ・要約テキスト・チャット表示フィルタバッジを更新する。
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
        opt.textContent = `${labelTitle} (${Number(s.itemCount || 0)}件)`;
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
      summaryEl.textContent = `記録中: ${currentSummary.title || currentSummary.videoId}${bName}（合計 ${totalItemsCount}件・全件 IndexedDB 保存）`;
    } else {
      summaryEl.textContent = 'YouTube Live の視聴ページを開くと自動でチャットを記録します';
    }
  }

  const filterBadge = document.getElementById('yt-detected-filter-badge');
  const noticeBanner = document.getElementById('yt-all-chat-notice');
  const filterLabel = String(currentSummary?.chatFilterLabel || '').trim();
  if (filterBadge && noticeBanner) {
    if (!filterLabel) {
      filterBadge.textContent = '現在のチャット表示: 検出待ち（「すべてのチャット」を選択してください）';
      noticeBanner.classList.remove('is-warning');
    } else if (/トップチャット|top chat/i.test(filterLabel)) {
      filterBadge.textContent = `現在「${filterLabel}」表示です — 「すべてのチャット」へ切り替えると全件取得できます`;
      noticeBanner.classList.add('is-warning');
      const detailsEl = /** @type {HTMLDetailsElement | null} */ (
        document.getElementById('yt-settings-details')
      );
      if (detailsEl && !detailsEl.open) {
        detailsEl.open = true;
      }
    } else {
      filterBadge.textContent = `現在のチャット表示: ${filterLabel}`;
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
  await renderVoiceUiFromStorage(data);
  renderSupportRanking(applied.ranking);
  renderLaneFull('rinku', applied.laneDisplay.rinku, applied.laneCounts.rinku);
  renderLaneFull('konta', applied.laneDisplay.konta, applied.laneCounts.konta);
  renderLaneFull('tanunee', applied.laneDisplay.tanunee, applied.laneCounts.tanunee);

  metrics.lastFullLoadDurationMs = Math.round((performance.now() - t0) * 100) / 100;
}

/**
 * `yt_stream_summaries` 変化時に、全件 `getAll` せず `lastRecordedAt` 以降の新着レコードだけを
 * IndexedDB から差分取得し、レーン DOM と応援者ランキングを差分更新する。
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

  // まだ初期状態が無い、または選択配信が変わった場合のみ初回ロードへフォールバック
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
  await renderVoiceUiFromStorage(data);

  if (applied.addedCount > 0) {
    patchLaneIncremental('rinku', applied.addedByLane.rinku, applied.laneCounts.rinku);
    patchLaneIncremental('konta', applied.addedByLane.konta, applied.laneCounts.konta);
    patchLaneIncremental('tanunee', applied.addedByLane.tanunee, applied.laneCounts.tanunee);
  }

  if (applied.rankingChanged) {
    renderSupportRanking(applied.ranking);
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

function bindUiEvents() {
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
  bindUiEvents();
  await runRenderSerialized(() => renderStreamFullLoad());
  requestVoicevoxRecheck();
}

initSidepanel();
