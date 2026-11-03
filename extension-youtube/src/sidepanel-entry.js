// sidepanel-entry.js — YouTube Live 3レーン・通貨別応援者ランキング・読み上げ設定の表示 UI
/* global chrome, document, Blob, URL, Audio, setTimeout, setInterval */

import { safeHttpUrl } from '../../src/lib/htmlText.js';
import {
  VOICEVOX_BASE_URL,
  probeVoicevoxAlive,
  listVoicevoxStyleIds,
  synthesizeVoice,
} from '../../src/lib/voicevoxClient.js';
import { groupYtCommentsByLane } from '../../src/lib/youtube/ytLaneAssign.js';
import {
  aggregateYtSupportRanking,
  formatYtCurrencyAmount,
  buildYtChannelUrl,
} from '../../src/lib/youtube/ytSupportRanking.js';
import { YT_VOICE_MODES, YT_DEFAULT_STYLE_IDS } from '../../src/lib/youtube/ytVoiceQueue.js';
import {
  YT_SIDE_PANEL_DISPLAY_LIMIT,
  selectYtNewestCommentsForDisplay,
} from '../../src/lib/youtube/ytStreamStorePolicy.js';
import { getYtStreamCommentsByVideoId } from './ytIdbStore.js';

const STORAGE_KEYS = Object.freeze({
  STREAM_SUMMARIES: 'yt_stream_summaries',
  ACTIVE_VIDEO_ID: 'yt_active_video_id',
  VOICE_SETTINGS: 'yt_voice_settings',
  VOICE_ASSIGNMENTS: 'yt_voice_assignments',
  VOICE_QUEUE: 'yt_voice_queue',
  VOICE_STATE: 'yt_voice_state',
});

let selectedVideoId = '';
let isVoicevoxOnline = false;
let isDrainingQueue = false;
let lastSpokenSummary = '';

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
 * アイコン画像要素を生成する。CDN 404 等の読み込み失敗時は自動でフォールバックバッジに差し替える（AGENTS.md §3.6）。
 * @param {string} iconUrl
 * @param {string} name
 * @returns {HTMLElement}
 */
function createAvatarNode(iconUrl, name) {
  const safeUrl = safeHttpUrl(iconUrl || '');
  const initial = String(name || '?')
    .replace(/^@/, '')
    .trim()
    .slice(0, 1)
    .toUpperCase() || '?';

  const makeFallback = () => {
    const span = document.createElement('span');
    span.className = 'avatar-fallback';
    span.textContent = initial;
    return span;
  };

  if (!safeUrl) {
    return makeFallback();
  }

  const img = document.createElement('img');
  img.className = 'avatar-img';
  img.src = safeUrl;
  img.alt = name || 'icon';
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    const fallback = makeFallback();
    if (img.parentNode) {
      img.parentNode.replaceChild(fallback, img);
    }
  });
  return img;
}

/**
 * 人物表示ノード（サムネ・ハンドルネーム・チャンネルID・リンク）を組み立てる（AGENTS.md §3.5）。
 * @param {{ name?: string, channelId?: string, iconUrl?: string, voiceStyleId?: number }} user
 * @returns {DocumentFragment}
 */
function createAuthorHeaderFragment(user) {
  const frag = document.createDocumentFragment();
  const displayName = String(user.name || user.channelId || '匿名リスナー').trim();
  const channelId = String(user.channelId || '').trim();
  const channelUrl = safeHttpUrl(buildYtChannelUrl(channelId));

  frag.appendChild(createAvatarNode(user.iconUrl || '', displayName));

  if (channelUrl) {
    const link = document.createElement('a');
    link.className = 'author-link';
    link.href = channelUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = displayName;
    frag.appendChild(link);
  } else {
    const span = document.createElement('span');
    span.className = 'author-link';
    span.textContent = displayName;
    frag.appendChild(span);
  }

  if (channelId) {
    const idTag = document.createElement('span');
    idTag.className = 'channel-id-tag';
    idTag.textContent = `(${channelId.slice(0, 14)}${channelId.length > 14 ? '…' : ''})`;
    idTag.title = channelId;
    frag.appendChild(idTag);
  }

  if (Number.isFinite(Number(user.voiceStyleId))) {
    const voicePill = document.createElement('span');
    voicePill.className = 'voice-pill';
    voicePill.dataset.voiceStyleId = String(user.voiceStyleId);
    voicePill.textContent = `🔊 声 #${user.voiceStyleId}`;
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
  card.className = `chat-item kind-${kind}`;
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
 * レーン1列を描画する（件数は全件数を表示し、DOM 描画は新しい順に上限件数を描画する）。
 * @param {string} listId
 * @param {string} countId
 * @param {any[]} items
 * @param {string} emptyMessage
 */
function renderLaneColumn(listId, countId, items, emptyMessage) {
  const listEl = document.getElementById(listId);
  const countEl = document.getElementById(countId);
  if (countEl) {
    countEl.textContent = `${items.length}件`;
  }
  if (!listEl) return;

  clearChildren(listEl);
  if (items.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = emptyMessage;
    listEl.appendChild(hint);
    return;
  }

  const newestSlice = selectYtNewestCommentsForDisplay(items, YT_SIDE_PANEL_DISPLAY_LIMIT);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < newestSlice.length; i += 1) {
    frag.appendChild(createChatItemElement(newestSlice[i]));
  }
  listEl.appendChild(frag);
}

/**
 * 通貨別の応援者ランキングを描画する（通貨換算はしない）。
 * @param {ReturnType<typeof aggregateYtSupportRanking>} ranking
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

    const rows = ranking.byCurrency[currency].slice(0, 10);
    for (const row of rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'supporter-row';

      const rankSpan = document.createElement('span');
      rankSpan.className = 'rank-badge';
      rankSpan.textContent = `${row.rank}位`;
      rowEl.appendChild(rankSpan);

      rowEl.appendChild(
        createAuthorHeaderFragment({
          name: row.name,
          channelId: row.channelId,
          iconUrl: row.iconUrl,
        }),
      );

      const amountSpan = document.createElement('span');
      amountSpan.className = 'amount-pill';
      amountSpan.style.marginLeft = 'auto';
      amountSpan.textContent = `${row.formattedAmount} (${row.count}回)`;
      rowEl.appendChild(amountSpan);

      box.appendChild(rowEl);
    }

    containerEl.appendChild(box);
  }

  const memberSupporters = ranking.supporters.filter(
    (s) => s.membershipCount > 0 || s.giftCount > 0,
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

    for (const sup of memberSupporters.slice(0, 10)) {
      const rowEl = document.createElement('div');
      rowEl.className = 'supporter-row';
      rowEl.appendChild(
        createAuthorHeaderFragment({
          name: sup.name,
          channelId: sup.channelId,
          iconUrl: sup.iconUrl,
        }),
      );
      const badge = document.createElement('span');
      badge.className = 'member-pill';
      badge.style.marginLeft = 'auto';
      badge.textContent =
        sup.giftCount > 0 ? `ギフト ${sup.giftCount}回` : `メンバー加入 ${sup.membershipCount}回`;
      rowEl.appendChild(badge);
      box.appendChild(rowEl);
    }

    containerEl.appendChild(box);
  }
}

/**
 * `chrome.storage.local` から配信一覧の要約と設定を読み、
 * 今見ている配信（`selectedVideoId`）のコメントだけを IndexedDB から読んで描画する。
 */
async function renderFromStorage() {
  try {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.STREAM_SUMMARIES,
      STORAGE_KEYS.ACTIVE_VIDEO_ID,
      STORAGE_KEYS.VOICE_SETTINGS,
      STORAGE_KEYS.VOICE_QUEUE,
      STORAGE_KEYS.VOICE_STATE,
    ]);

    const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
    const videoIds = Object.keys(summaries).sort(
      (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0),
    );
    const activeId = String(data[STORAGE_KEYS.ACTIVE_VIDEO_ID] || '');
    if (!selectedVideoId || !summaries[selectedVideoId]) {
      selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || '';
    }

    // 配信セレクタ更新（要約のみ参照）
    const selectEl = /** @type {HTMLSelectElement | null} */ (
      document.getElementById('yt-stream-select')
    );
    if (selectEl) {
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
    // 今見ている配信のコメントだけを IndexedDB から取得する
    const items = selectedVideoId ? await getYtStreamCommentsByVideoId(selectedVideoId) : [];

    // ヘッダー要約
    const summaryEl = document.getElementById('yt-stream-summary');
    if (summaryEl) {
      if (currentSummary) {
        const bName = currentSummary.broadcasterName
          ? ` / 配信者: ${currentSummary.broadcasterName}`
          : '';
        summaryEl.textContent = `記録中: ${currentSummary.title || currentSummary.videoId}${bName}（合計 ${items.length}件・全件 IndexedDB 保存）`;
      } else {
        summaryEl.textContent = 'YouTube Live の視聴ページを開くと自動でチャットを記録します';
      }
    }

    // 「トップチャット」vs「すべてのチャット」検出表示
    const filterBadge = document.getElementById('yt-detected-filter-badge');
    const noticeBanner = document.getElementById('yt-all-chat-notice');
    const filterLabel = String(currentSummary?.chatFilterLabel || '').trim();
    if (filterBadge && noticeBanner) {
      if (!filterLabel) {
        filterBadge.textContent = '現在のチャット表示: 検出待ち（「すべてのチャット」を選択してください）';
        noticeBanner.classList.remove('is-warning');
      } else if (/トップチャット|top chat/i.test(filterLabel)) {
        filterBadge.textContent = `⚠️ 現在「${filterLabel}」表示です — 「すべてのチャット」へ切り替えると全件取得できます`;
        noticeBanner.classList.add('is-warning');
      } else {
        filterBadge.textContent = `✅ 現在のチャット表示: ${filterLabel}`;
        noticeBanner.classList.remove('is-warning');
      }
    }

    // 読み上げ設定の反映
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

    // 応援者ランキング集計（この配信の IndexedDB 全件から算出）
    const ranking = aggregateYtSupportRanking(items);
    renderSupportRanking(ranking);

    // 3レーン振り分け＆描画
    const grouped = groupYtCommentsByLane(items, {
      broadcasterChannelId: currentSummary?.broadcasterChannelId || '',
      supporterChannelIds: ranking.supporterChannelIds,
    });

    renderLaneColumn(
      'lane-rinku-list',
      'lane-rinku-count',
      grouped.rinku,
      '配信者本人・モデレーターのコメントがここに表示されます',
    );
    renderLaneColumn(
      'lane-konta-list',
      'lane-konta-count',
      grouped.konta,
      'スパチャ・ステッカー・メンバー・ギフトの応援がここに表示されます',
    );
    renderLaneColumn(
      'lane-tanunee-list',
      'lane-tanunee-count',
      grouped.tanunee,
      '一般リスナーのコメントがここに表示されます',
    );
  } catch {
    // fail-soft
  }
}

/**
 * VOICEVOX の起動状態を診断し、起動していない場合は画面に理由を表示する（§6 完了判定）。
 */
async function checkVoicevoxStatus() {
  const statusBox = document.getElementById('yt-voice-status-box');
  const probe = await probeVoicevoxAlive({ baseUrl: VOICEVOX_BASE_URL });

  if (!probe.ok) {
    isVoicevoxOnline = false;
    if (statusBox) {
      statusBox.className = 'voice-status-box is-offline';
      const detail =
        probe.reason === 'timeout'
          ? '応答がタイムアウトしました'
          : 'ローカルの VOICEVOX エンジンへ接続できませんでした';
      statusBox.textContent = `⚠️ VOICEVOX が起動していません（${VOICEVOX_BASE_URL} — ${detail}）。VOICEVOX を起動して「VOICEVOX 再確認」を押すと、チャンネルIDごとに決まった声で読み上げます。`;
    }
    return false;
  }

  isVoicevoxOnline = true;
  const styles = await listVoicevoxStyleIds({ baseUrl: VOICEVOX_BASE_URL });
  const availableStyleIds = styles.length > 0 ? styles : Array.from(YT_DEFAULT_STYLE_IDS);

  if (statusBox) {
    statusBox.className = 'voice-status-box is-online';
    statusBox.textContent = `🟢 VOICEVOX 接続中（${VOICEVOX_BASE_URL} / 利用可能スタイル: ${availableStyleIds.length}種）`;
  }

  chrome.runtime.sendMessage(
    {
      type: 'YT_UPDATE_VOICE_SETTINGS',
      payload: { availableStyleIds },
    },
    () => {
      void chrome.runtime.lastError;
    },
  );
  return true;
}

/**
 * WAV ArrayBuffer をブラウザの Audio 要素で再生する。
 * @param {ArrayBuffer} wavBuffer
 * @returns {Promise<void>}
 */
function playWavBuffer(wavBuffer) {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      const cleanup = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.addEventListener('ended', cleanup, { once: true });
      audio.addEventListener('error', cleanup, { once: true });
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(cleanup);
      }
    } catch {
      resolve();
    }
  });
}

/**
 * 読み上げキューから1件ずつ取り出して VOICEVOX で音声合成＆再生する。
 */
async function drainVoiceQueueLoop() {
  if (isDrainingQueue) return;
  isDrainingQueue = true;

  try {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.VOICE_SETTINGS,
      STORAGE_KEYS.VOICE_QUEUE,
    ]);
    const settings = data[STORAGE_KEYS.VOICE_SETTINGS] || { enabled: true };
    const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
      ? data[STORAGE_KEYS.VOICE_QUEUE]
      : [];

    if (!settings.enabled || queue.length === 0) {
      return;
    }

    if (!isVoicevoxOnline) {
      const alive = await checkVoicevoxStatus();
      if (!alive) return;
    }

    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'YT_SHIFT_VOICE_QUEUE' }, (reply) => {
        void chrome.runtime.lastError;
        resolve(reply || { ok: false, entry: null });
      });
    });

    const entry = res?.entry;
    if (!entry) return;

    const lastSpokenEl = document.getElementById('yt-voice-last-spoken');
    lastSpokenSummary = `🔊 読み上げ: ${entry.name || entry.channelId || 'リスナー'} (${entry.userKey} → 声 #${entry.styleId}) 「${entry.text}」`;
    if (lastSpokenEl) {
      lastSpokenEl.textContent = lastSpokenSummary;
    }

    const wav = await synthesizeVoice(
      entry.text,
      {
        styleId: entry.styleId,
        pitchOffset: Number(entry.pitchOffset || 0),
        speedOffset: Number(entry.speedOffset || 0),
      },
      {
        baseUrl: VOICEVOX_BASE_URL,
      },
    );

    if (!wav || !(wav instanceof ArrayBuffer)) {
      await checkVoicevoxStatus();
      return;
    }

    await playWavBuffer(wav);
  } finally {
    isDrainingQueue = false;
  }
}

function bindUiEvents() {
  const selectEl = /** @type {HTMLSelectElement | null} */ (
    document.getElementById('yt-stream-select')
  );
  selectEl?.addEventListener('change', () => {
    selectedVideoId = selectEl.value;
    renderFromStorage();
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
      () => renderFromStorage(),
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
      () => renderFromStorage(),
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
      () => renderFromStorage(),
    );
  });

  const recheckBtn = document.getElementById('yt-voice-recheck-btn');
  recheckBtn?.addEventListener('click', () => {
    checkVoicevoxStatus();
  });

  const clearBtn = document.getElementById('yt-voice-clear-btn');
  clearBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'YT_CLEAR_VOICE_QUEUE' }, () => renderFromStorage());
  });

  chrome.storage.onChanged.addListener(() => {
    renderFromStorage();
    setTimeout(drainVoiceQueueLoop, 50);
  });
}

async function initSidepanel() {
  bindUiEvents();
  await renderFromStorage();
  await checkVoicevoxStatus();
  setInterval(drainVoiceQueueLoop, 700);
  setInterval(checkVoicevoxStatus, 10000);
}

initSidepanel();
