/**
 * whatsNewNoticeUi.js — ポップアップ／横の欄に「この版で変わったこと」を出す。
 *
 * 新しい監視・タイマー・通信は増やさない。開いたときに storage を一度読み、
 * 閉じる（または版番号・「詳しく」を押す）ときに今の版を覚えるだけ。
 *
 * 0.1.2229（りんく「LP とか、バージョン番号をクリックしたときに飛ぶようにすべき」）:
 *   中に全部の項目を並べると長くて使いづらいので、「版番号＋一言」だけにした。
 *   版番号と「詳しく」は紹介ページのその版（changelog.html#v<版>）を新しいタブで開く
 *   （ふつうの <a target="_blank">。権限・通信は増やさない）。
 */

import { getLatestChangelogEntry } from '../lib/changelog.js';
import { lpChangelogUrl } from '../lib/lpChangelogLink.js';
import {
  WHATS_NEW_SEEN_STORAGE_KEY,
  resolveWhatsNewState,
  shouldSuppressWhatsNewSurface,
  whatsNewSiteOfLocation,
  whatsNewSummaryForSite
} from '../lib/whatsNewNotice.js';

/**
 * @param {string} text
 * @returns {string}
 */
function asText(text) {
  return String(text || '');
}

/**
 * <a> を紹介ページのその版の説明へ向ける（新しいタブ）。
 * @param {Element|null|undefined} el
 * @param {unknown} version
 */
export function applyLpChangelogLink(el, version) {
  if (!el || typeof el.setAttribute !== 'function') return;
  el.setAttribute('href', lpChangelogUrl(version));
  el.setAttribute('target', '_blank');
  el.setAttribute('rel', 'noopener noreferrer');
  if (!el.getAttribute('title')) {
    el.setAttribute('title', '紹介ページでこの版の説明を開く');
  }
}

/**
 * @param {{
 *   document?: Document,
 *   storage?: { get: Function, set: Function },
 *   surfaceFlags?: { embedWatch?: boolean, embedLiveView?: boolean, passive?: boolean },
 *   site?: string
 * }} opts
 */
export async function wireWhatsNewNotice(opts = {}) {
  const root = opts.document || (typeof document !== 'undefined' ? document : null);
  if (!root) return;
  const entry = getLatestChangelogEntry();
  const currentVersion = entry && entry.version ? String(entry.version) : '';
  // v0.1.2263: 別のサービスだけの一言は、いまの画面ではサービス名を出さない一言に(whatsNewSummaryForSite)
  const site = opts.site != null
    ? String(opts.site)
    : whatsNewSiteOfLocation(typeof location !== 'undefined' ? location : null);
  const summaryText = whatsNewSummaryForSite(entry ? entry.summary : '', site, /** @type {any} */ (entry)?.platforms);
  const latestLabel = root.getElementById('changelogLatestLabel');
  if (latestLabel && currentVersion) {
    const summary = asText(summaryText);
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
  const moreEl = root.getElementById('whatsNewNoticeMore');
  if (versionEl) {
    versionEl.textContent = `v${currentVersion}`;
    applyLpChangelogLink(versionEl, currentVersion);
  }
  if (summaryEl) summaryEl.textContent = asText(summaryText);
  applyLpChangelogLink(moreEl, currentVersion);

  const dismiss = async () => {
    await persistSeen(currentVersion);
    hideNotice();
  };

  const closeBtn = root.getElementById('whatsNewNoticeClose');
  for (const el of [closeBtn, versionEl, moreEl]) {
    if (!el || el.dataset.nlWhatsNewWired) continue;
    el.dataset.nlWhatsNewWired = '1';
    // リンクは既定の動き（新しいタブで開く）を止めない。開いたら「見た」にする。
    el.addEventListener('click', () => {
      void dismiss();
    });
  }

  notice.hidden = false;
  notice.removeAttribute('hidden');
}
