/**
 * whatsNewNoticeUi.js — ポップアップ／横の欄に「この版で変わったこと」を出す。
 *
 * 新しい監視・タイマー・通信は増やさない。開いたときに storage を一度読み、
 * 閉じる（または更新履歴を開く）ときに今の版を覚えるだけ。
 */

import { getLatestChangelogEntry } from '../lib/changelog.js';
import {
  WHATS_NEW_SEEN_STORAGE_KEY,
  resolveWhatsNewState,
  shouldSuppressWhatsNewSurface
} from '../lib/whatsNewNotice.js';

/**
 * @param {string} text
 * @returns {string}
 */
function asText(text) {
  return String(text || '');
}

/**
 * @param {{
 *   document?: Document,
 *   storage?: { get: Function, set: Function },
 *   surfaceFlags?: { embedWatch?: boolean, embedLiveView?: boolean, passive?: boolean }
 * }} opts
 */
export async function wireWhatsNewNotice(opts = {}) {
  const root = opts.document || (typeof document !== 'undefined' ? document : null);
  if (!root) return;
  const entry = getLatestChangelogEntry();
  const currentVersion = entry && entry.version ? String(entry.version) : '';
  const latestLabel = root.getElementById('changelogLatestLabel');
  if (latestLabel && currentVersion) {
    const summary = asText(entry.summary);
    latestLabel.textContent = summary
      ? `v${currentVersion} ${summary}`
      : `v${currentVersion}`;
  }

  const notice = root.getElementById('whatsNewNotice');
  const storage =
    opts.storage ||
    (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
      ? chrome.storage.local
      : null);

  /** @param {string} version */
  const persistSeen = async (version) => {
    if (!storage || !version) return;
    try {
      await storage.set({ [WHATS_NEW_SEEN_STORAGE_KEY]: version });
    } catch {
      /* 拡張の画面が閉じたあとなど */
    }
  };

  const hideNotice = () => {
    if (!notice) return;
    notice.hidden = true;
    notice.setAttribute('hidden', '');
  };

  if (shouldSuppressWhatsNewSurface(opts.surfaceFlags || {})) {
    // 視聴埋め込みでは出さない。更新後なら、横の欄やポップアップでまだ出るよう、
    // 「見た」とは書かない（初回の版覚えだけはする）。
    if (!storage) return;
    try {
      const bag = await storage.get(WHATS_NEW_SEEN_STORAGE_KEY);
      const state = resolveWhatsNewState({
        currentVersion,
        seenVersion: bag && bag[WHATS_NEW_SEEN_STORAGE_KEY]
      });
      if (state.persistSeenOnLoad) await persistSeen(state.persistVersion);
    } catch {
      /* ignore */
    }
    hideNotice();
    return;
  }

  if (!notice || !currentVersion) return;

  /** @type {unknown} */
  let seenVersion;
  if (storage) {
    try {
      const bag = await storage.get(WHATS_NEW_SEEN_STORAGE_KEY);
      seenVersion = bag && bag[WHATS_NEW_SEEN_STORAGE_KEY];
    } catch {
      return;
    }
  }
  const state = resolveWhatsNewState({ currentVersion, seenVersion });
  if (state.persistSeenOnLoad) {
    await persistSeen(state.persistVersion);
    hideNotice();
    return;
  }
  if (!state.show) {
    hideNotice();
    return;
  }

  const versionEl = root.getElementById('whatsNewNoticeVersion');
  const summaryEl = root.getElementById('whatsNewNoticeSummary');
  const itemsEl = root.getElementById('whatsNewNoticeItems');
  if (versionEl) {
    const date = asText(entry.date);
    versionEl.textContent = date ? `v${currentVersion}（${date}）` : `v${currentVersion}`;
  }
  if (summaryEl) summaryEl.textContent = asText(entry.summary);
  if (itemsEl) {
    while (itemsEl.firstChild) itemsEl.removeChild(itemsEl.firstChild);
    for (const item of entry.items || []) {
      const li = root.createElement('li');
      li.textContent = asText(item);
      itemsEl.appendChild(li);
    }
  }

  const dismiss = async () => {
    await persistSeen(currentVersion);
    hideNotice();
  };

  const closeBtn = root.getElementById('whatsNewNoticeClose');
  if (closeBtn && !closeBtn.dataset.nlWhatsNewWired) {
    closeBtn.dataset.nlWhatsNewWired = '1';
    closeBtn.addEventListener('click', () => {
      void dismiss();
    });
  }

  const openBtn = root.getElementById('whatsNewNoticeOpenLog');
  const details = /** @type {HTMLDetailsElement|null} */ (
    root.getElementById('changelogDetails')
  );
  const changelogSection = details && details.closest
    ? details.closest('.nl-changelog-section')
    : null;
  const changelogVisible =
    !!details &&
    (!changelogSection ||
      (typeof window !== 'undefined' &&
        window.getComputedStyle &&
        window.getComputedStyle(changelogSection).display !== 'none'));
  if (openBtn) {
    if (!changelogVisible) {
      openBtn.hidden = true;
    } else if (!openBtn.dataset.nlWhatsNewWired) {
      openBtn.dataset.nlWhatsNewWired = '1';
      openBtn.addEventListener('click', () => {
        details.open = true;
        try {
          details.scrollIntoView({ block: 'nearest' });
        } catch {
          /* ignore */
        }
        void dismiss();
      });
    }
  }

  notice.hidden = false;
  notice.removeAttribute('hidden');
}
