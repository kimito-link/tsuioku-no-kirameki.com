// sidepanel-iframe-boot-entry.js — サイドパネルの iframe(中の popup)を「親の最初の描画のあと」に読み込ませるだけの【極小エントリ】。v0.1.1693
//
// ★役割は1つ: iframe の src(lv 付き)を、親の最初の描画のあと(上限 IFRAME_START_MAX_WAIT_MS)に付ける。
//   描画・状態・storage には一切触れない。重い本体(sidepanel.js)より【前】に読ませる=本体が壊れても動く。
//
// ■ 単一障害点にしない(v0.1.1419 の教訓): 何があっても IFRAME_FAILSAFE_MS で必ず読み込ませる。
//   このファイルが読めなかった場合に備え、出荷物にこのファイルが入っていることを stage-submission が必須にしている。
//   詳細と理由は src/lib/sidepanelIframeLoader.js。
// ■ 拡張の CSP は script-src 'self' なので、インラインには書けない(だから別ファイル)。

import { createSidepanelIframeLoader, IFRAME_START_MAX_WAIT_MS } from '../lib/sidepanelIframeLoader.js';
import { buildSidePanelIframeSrc, readSidePanelLv } from '../lib/sidepanelIframeSrc.js';
import { SIDE_PANEL_WATCH_TAB_QUERY, pickLvFromTabs } from '../lib/sidePanelLvFromTabs.js';

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
    createSidepanelIframeLoader({
      iframe: ifr,
      base,
      target: buildSidePanelIframeSrc(base, search) || base,
      needsPick: !hasLv,
      // lv が無い(ツールバーから開いた)ときは、パネル自身が watch タブを探す(v0.1.1435・曖昧なら ''=素の src)。
      pickSrc: async () => {
        const tabs = await chrome.tabs.query(SIDE_PANEL_WATCH_TAB_QUERY);
        const picked = pickLvFromTabs(tabs);
        return picked.lv ? buildSidePanelIframeSrc(base, `?lv=${picked.lv}`) : '';
      },
      gatePromise: firstPaintOrTimeout(),
      setTimer: (fn, ms) => setTimeout(fn, ms)
    }).run();
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
