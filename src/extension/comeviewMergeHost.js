// @ts-nocheck — chrome のタブと storage を触る橋。判定は mergedComeview.js。
// comeviewMergeHost.js — コメビュで、開いている配信タブを選んで1本の時系列にする。
//   判定は src/lib/mergedComeview.js。ここはタブ一覧・保存・末尾の読み・描画と読み上げへの橋だけ。
//   開いていない配信の記録は読まない。全件の IndexedDB も読まない。

import { tailStorageKey } from '../lib/commentTailBuffer.js';
import {
  COMEVIEW_MERGE_STORAGE_KEY,
  MERGED_RECENT_COMMENTS_MESSAGE,
  MERGE_MAX_STREAMS,
  MERGE_PER_STREAM_CAP,
  buildMergedTimeline,
  describeOpenStreams,
  leaseIdForStream,
  resolveMergeTargets,
  takeMergedVoiceItems,
  takeRecentComments
} from '../lib/mergedComeview.js';

/**
 * @param {{
 *   render: (timeline: readonly Record<string, unknown>[]) => void,
 *   enqueueVoice: (items: readonly Record<string, unknown>[]) => void,
 *   setMeta: (text: string) => void,
 *   setCount: (n: number) => void,
 *   isPaused: () => boolean,
 *   voiceOn: () => boolean,
 *   primaryLiveId: () => string,
 *   onActiveChange: (active: boolean) => void,
 *   lease: { hold?: (ids: readonly string[]) => unknown, releaseLives?: (ids: readonly string[]) => void } | null
 * }} api
 */
export function startComeviewMerge(api) {
  /** @type {string[]} */
  let savedIds = [];
  /** @type {import('../lib/mergedComeview.js').MergedStream[]} */
  let open = [];
  /** @type {import('../lib/mergedComeview.js').MergedStream[]} */
  let chosen = [];
  let active = false;
  let pickerOpen = false;
  let seeded = false;
  let refreshing = false;
  let refreshAgain = false;
  let lastPaintAt = 0;
  let pickerSig = '';
  /** @type {Map<string, unknown[]>} */
  const buffers = new Map();
  const heard = new Set();
  /** @type {string[]} */
  let held = [];
  /** @type {ReturnType<typeof setInterval> | null} */
  let ytTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let tabTimer = null;

  const button = document.getElementById('cvBtnMerge');
  const panel = document.getElementById('cvMerge');

  function targets() {
    return resolveMergeTargets(open, savedIds);
  }

  function setActive(next) {
    if (next === active) return;
    active = next;
    if (button) button.classList.toggle('is-on', active);
    if (!active) {
      buffers.clear();
      seeded = false;
      dropLease();
      stopYtTimer();
      api.onActiveChange(false);
      return;
    }
    api.setMeta(chosen.length ? `まとめて ${chosen.length}` : 'まとめて');
    ensureYtTimer();
    void refresh(true);
  }

  function applySelection() {
    const next = targets();
    chosen = next.chosen;
    const was = active;
    if (next.active !== active) setActive(next.active);
    else if (active) {
      api.setMeta(`まとめて ${chosen.length}`);
      ensureYtTimer();
      void refresh(true);
    }
    if (was === active) renderPicker();
  }

  function persist() {
    try {
      void chrome.storage.local.set({ [COMEVIEW_MERGE_STORAGE_KEY]: { ids: savedIds.slice(0, MERGE_MAX_STREAMS) } });
    } catch { /* 覚えられなくても、今開いている間は選択のまま */ }
  }

  function renderPicker() {
    if (!(panel instanceof HTMLElement)) return;
    const sig = open.map((s) => `${s.id}|${s.badge}|${s.active ? 1 : 0}|${savedIds.includes(s.id) ? 1 : 0}`).join('\n') + `|${active ? 1 : 0}`;
    if (sig === pickerSig) return;
    pickerSig = sig;
    panel.textContent = '';
    const note = document.createElement('p');
    note.className = 'cv-merge-note';
    note.textContent = open.length
      ? '今開いているタブだけをまとめます。開いていない配信は取りにいきません。'
      : '開いている配信タブがありません。見ているタブだけが対象です。';
    panel.appendChild(note);
    for (const stream of open) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = savedIds.includes(stream.id);
      input.addEventListener('change', () => {
        if (input.checked) {
          if (!savedIds.includes(stream.id)) savedIds = [...savedIds, stream.id].slice(0, MERGE_MAX_STREAMS);
          if (!savedIds.includes(stream.id)) input.checked = false;
        } else {
          savedIds = savedIds.filter((id) => id !== stream.id);
        }
        if (input.checked && savedIds.length >= MERGE_MAX_STREAMS && !savedIds.includes(stream.id)) {
          input.checked = false;
        }
        persist();
        pickerSig = '';
        applySelection();
      });
      const name = document.createElement('span');
      name.className = 'cv-merge-name';
      name.textContent = stream.badgeTitle || stream.badge;
      label.appendChild(input);
      label.appendChild(name);
      panel.appendChild(label);
    }
  }

  function paint(fromRefresh) {
    if (!active) return;
    const groups = chosen.map((stream) => ({
      stream,
      rows: buffers.get(stream.id) || []
    }));
    const timeline = buildMergedTimeline(groups);
    api.render(timeline);
    api.setCount(timeline.length);
    const now = Date.now();
    const speak = takeMergedVoiceItems(timeline, heard, {
      seeded,
      now,
      lastAt: lastPaintAt,
      maxSpeak: 3,
      gapMs: 15000
    });
    if (fromRefresh) seeded = true;
    lastPaintAt = now;
    if (speak.length && api.voiceOn()) {
      api.enqueueVoice(speak.map((item) => ({
        kind: 'comment',
        text: item.text,
        nickname: item.nickname,
        userId: item.userId,
        at: item.at,
        commentNo: item.voiceId,
        key: item.key,
        voiceLiveId: item.voiceLiveId
      })));
    }
    if (api.voiceOn()) void syncLease();
  }

  async function syncLease() {
    if (!api.lease || typeof api.lease.hold !== 'function' || !api.voiceOn() || !active) {
      dropLease();
      return;
    }
    const ids = chosen.map(leaseIdForStream).filter(Boolean);
    try {
      await api.lease.hold(ids);
      held = ids;
    } catch { /* 名乗りに失敗しても表示は続ける */ }
  }

  function dropLease() {
    if (!held.length || !api.lease || typeof api.lease.releaseLives !== 'function') {
      held = [];
      return;
    }
    const primary = String(api.primaryLiveId() || '').trim().toLowerCase();
    const drop = held.filter((id) => id !== primary);
    held = [];
    if (drop.length) api.lease.releaseLives(drop);
  }

  function storageGet(keys) {
    return Promise.race([
      chrome.storage.local.get(keys),
      new Promise((resolve) => { setTimeout(() => resolve({}), 2000); })
    ]);
  }

  async function refresh(fromUser) {
    if (!active) return;
    if (api.isPaused()) return;
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    try {
      if (fromUser) await reloadTabs();
      const nico = chosen.filter((s) => s.read.kind === 'nico');
      if (nico.length) {
        const keys = nico.map((s) => tailStorageKey(s.read.liveId));
        const bag = /** @type {Record<string, unknown>} */ (await storageGet(keys));
        for (const stream of nico) {
          const key = tailStorageKey(stream.read.liveId);
          buffers.set(stream.id, takeRecentComments(bag[key], MERGE_PER_STREAM_CAP));
        }
      }
      const yt = chosen.filter((s) => s.read.kind === 'yt');
      if (yt.length) {
        let res = null;
        try {
          res = await chrome.runtime.sendMessage({
            type: MERGED_RECENT_COMMENTS_MESSAGE,
            videoIds: yt.map((s) => s.read.videoId),
            limit: MERGE_PER_STREAM_CAP
          });
        } catch {
          res = null;
        }
        const by = res && typeof res === 'object' ? /** @type {any} */ (res).byVideoId : null;
        if (by && typeof by === 'object') {
          for (const stream of yt) {
            const rows = Array.isArray(by[stream.read.videoId]) ? by[stream.read.videoId] : [];
            buffers.set(stream.id, takeRecentComments(rows, MERGE_PER_STREAM_CAP));
          }
        }
      }
      for (const id of [...buffers.keys()]) {
        if (!chosen.some((s) => s.id === id)) buffers.delete(id);
      }
      paint(true);
    } catch {
      /* 次の変化で取り直す */
    } finally {
      refreshing = false;
      if (refreshAgain) {
        refreshAgain = false;
        void refresh(false);
      }
    }
  }

  function ensureYtTimer() {
    const needs = active && chosen.some((s) => s.read.kind === 'yt');
    if (!needs) {
      stopYtTimer();
      return;
    }
    if (ytTimer != null) return;
    ytTimer = setInterval(() => {
      if (!active || api.isPaused()) return;
      void refresh(false);
    }, 4000);
  }

  function stopYtTimer() {
    if (ytTimer != null) clearInterval(ytTimer);
    ytTimer = null;
  }

  async function reloadTabs() {
    let rows = [];
    try {
      rows = await chrome.tabs.query({});
    } catch {
      rows = [];
    }
    let summaries = {};
    try {
      const bag = /** @type {Record<string, any>} */ (await storageGet('yt_stream_summaries'));
      summaries = bag.yt_stream_summaries || {};
    } catch {
      summaries = {};
    }
    open = describeOpenStreams(rows, summaries);
    const next = targets();
    chosen = next.chosen;
    renderPicker();
    if (next.active !== active) setActive(next.active);
    else if (active) api.setMeta(`まとめて ${chosen.length}`);
  }

  function scheduleTabs() {
    if (tabTimer != null) clearTimeout(tabTimer);
    tabTimer = setTimeout(() => {
      tabTimer = null;
      if (!pickerOpen && !active) return;
      void reloadTabs().then(() => { if (active) void refresh(false); });
    }, 500);
  }

  /**
   * ニコ生の近道(live push)で届いた行。まとめて表示中のその配信だけ足す。
   * @param {unknown} liveId
   * @param {unknown} rows
   */
  function ingestNico(liveId, rows) {
    if (!active || api.isPaused()) return;
    const lv = String(liveId || '').trim().toLowerCase();
    const stream = chosen.find((s) => s.read.kind === 'nico' && s.read.liveId === lv);
    if (!stream || !Array.isArray(rows) || !rows.length) return;
    const prev = buffers.get(stream.id) || [];
    buffers.set(stream.id, takeRecentComments(prev.concat(rows), MERGE_PER_STREAM_CAP));
    paint(false);
  }

  if (button) {
    button.addEventListener('click', () => {
      pickerOpen = !pickerOpen;
      button.setAttribute('aria-expanded', pickerOpen ? 'true' : 'false');
      if (panel) panel.hidden = !pickerOpen;
      if (pickerOpen) void reloadTabs();
    });
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !active) return;
      const hit = chosen.some((s) => s.read.kind === 'nico' && changes[tailStorageKey(s.read.liveId)]);
      if (hit) void refresh(false);
    });
  } catch { /* storage が無ければ末尾の定期読みに任せる */ }

  try {
    if (chrome.tabs && chrome.tabs.onUpdated) chrome.tabs.onUpdated.addListener(() => scheduleTabs());
    if (chrome.tabs && chrome.tabs.onRemoved) chrome.tabs.onRemoved.addListener(() => scheduleTabs());
  } catch { /* タブの変化が取れなくても、開いたときに一覧は取り直す */ }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopYtTimer();
      return;
    }
    if (active) {
      ensureYtTimer();
      void refresh(true);
    }
  });

  setInterval(() => {
    if (active && api.voiceOn() && !api.isPaused()) void syncLease();
    else if (held.length) dropLease();
  }, 2000);

  void (async () => {
    try {
      const bag = /** @type {Record<string, any>} */ (await storageGet(COMEVIEW_MERGE_STORAGE_KEY));
      const ids = bag[COMEVIEW_MERGE_STORAGE_KEY] && bag[COMEVIEW_MERGE_STORAGE_KEY].ids;
      savedIds = Array.isArray(ids) ? ids.map((id) => String(id || '')).filter(Boolean).slice(0, MERGE_MAX_STREAMS) : [];
    } catch {
      savedIds = [];
    }
    await reloadTabs();
    applySelection();
  })();

  return {
    isActive: () => active,
    ingestNico,
    nudge: () => { if (active) void refresh(true); }
  };
}
