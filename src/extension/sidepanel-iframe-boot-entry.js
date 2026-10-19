// sidepanel-iframe-boot-entry.js — サイドパネルの iframe(中の popup)を「親の最初の描画のあと」に読み込ませ、見せる配信を決める【極小エントリ】。v0.1.1693 / v0.1.1696
//
// ★役割: ① iframe の src(lv 付き)を、親の最初の描画のあと(上限 IFRAME_START_MAX_WAIT_MS)に付ける。
//        ② v0.1.1696: パネルは【グローバル】(タブ専用の path を焼かない=タブを切り替えても隠れない)。どの配信を見せるかは
//          このスクリプトが決める: 現在のウィンドウのアクティブなタブが watch ならその配信・ほかのタブを見ている間は直前の配信を保つ・
//          アクティブなタブが別の watch に変わったら src を付け替える(同じ配信なら何もしない)。判定は src/lib/sidePanelLvFromTabs.js の pickPanelLv。
//   描画・状態・storage には一切触れない。重い本体(sidepanel.js)より【前】に読ませる=本体が壊れても動く。
//
// ■ 単一障害点にしない(v0.1.1419 の教訓): 何があっても IFRAME_FAILSAFE_MS で必ず読み込ませる(詳細は src/lib/sidepanelIframeLoader.js)。
// ■ 拡張の CSP は script-src 'self' なので、インラインには書けない(だから別ファイル)。

import { createSidepanelIframeLoader, IFRAME_START_MAX_WAIT_MS } from '../lib/sidepanelIframeLoader.js';
import { buildSidePanelIframeSrc, readSidePanelLv } from '../lib/sidepanelIframeSrc.js';
import { SIDE_PANEL_WATCH_TAB_QUERY, lvFromWatchUrl, pickPanelLv } from '../lib/sidePanelLvFromTabs.js';

/** 親の最初の描画(first-paint)が出るか、上限の時間が来たら解決する関門。タイマーで見る(rAF は隠れた文書で止まるので使わない)。 */
function firstPaintOrTimeout() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      let painted = false;
      try {
        painted = performance.getEntriesByName('first-paint').length > 0;
      } catch {
        painted = true;
      }
      if (painted || performance.now() - t0 >= IFRAME_START_MAX_WAIT_MS) {
        resolve(undefined);
        return;
      }
      setTimeout(tick, 16);
    };
    tick();
  });
}

try {
  const ifr = document.querySelector('iframe[data-nl-src]');
  if (ifr) {
    const base = ifr.getAttribute('data-nl-src') || '';
    const search = window.location.search;
    const hasLv = readSidePanelLv(search) !== '';
    /** いま見せている配信(src の lv)。付け替えの要否の判断に使う。 */
    const shownLv = () => {
      try {
        return readSidePanelLv(`?${String(ifr.getAttribute('src') || '').split('?')[1] || ''}`);
      } catch {
        return '';
      }
    };
    const loader = createSidepanelIframeLoader({
      iframe: ifr,
      base,
      target: buildSidePanelIframeSrc(base, search) || base,
      needsPick: !hasLv,
      // lv が無い(グローバルのパネル)ときは、パネル自身が決める: アクティブなタブが watch ならそれ・なければ watch タブが1つだけならそれ・曖昧なら ''。
      pickSrc: async () => {
        const [watchTabs, activeTabs] = await Promise.all([
          chrome.tabs.query(SIDE_PANEL_WATCH_TAB_QUERY),
          chrome.tabs.query({ active: true, currentWindow: true }).catch(() => /** @type {chrome.tabs.Tab[]} */ ([]))
        ]);
        const picked = pickPanelLv({ activeUrl: activeTabs && activeTabs[0] && activeTabs[0].url, currentLv: shownLv(), watchTabs });
        return picked.lv ? buildSidePanelIframeSrc(base, `?lv=${picked.lv}`) : '';
      },
      gatePromise: firstPaintOrTimeout(),
      setTimer: (fn, ms) => setTimeout(fn, ms)
    });
    loader.run();

    // v0.1.1696: アクティブなタブが【別の watch】に変わったときだけ、見せる配信を付け替える(watch 以外へ移っても何もしない=隠れず・作り直さず・直前の配信を保つ)。
    try {
      /** @type {number|null} */
      let ownWindowId = null;
      void chrome.windows.getCurrent().then((w) => { ownWindowId = w && w.id != null ? w.id : null; }, () => {});
      /** @param {chrome.tabs.Tab|undefined} tab */
      const follow = (tab) => {
        try {
          if (!tab || !tab.active) return;
          if (ownWindowId != null && tab.windowId !== ownWindowId) return; // このパネルが居るウィンドウのタブだけ
          const lv = lvFromWatchUrl(tab.url);
          if (!lv || lv === shownLv()) return;
          loader.update(buildSidePanelIframeSrc(base, `?lv=${lv}`));
        } catch {
          /* 追従の失敗で、いま見せている配信を壊さない */
        }
      };
      chrome.tabs.onActivated.addListener((info) => {
        void chrome.tabs.get(info.tabId).then(follow, () => {});
      });
      chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
        if (changeInfo && (changeInfo.url || changeInfo.status === 'complete')) follow(tab);
      });
    } catch {
      /* 追従できなくても、最初の配信は見える */
    }
  }
} catch {
  // 何が起きても素の src で読み込ませる(パネルを空のままにしない)。
  try {
    const ifr = document.querySelector('iframe[data-nl-src]');
    if (ifr && !ifr.getAttribute('src')) ifr.setAttribute('src', ifr.getAttribute('data-nl-src') || '');
  } catch {
    /* no-op */
  }
}
