// sidepanel-entry.js — サイドパネルの自己診断だけを担う極小エントリ。
//
// ★役割は1つ: 「いま自分が黒く見える状態か」を storage に書く。
//   ユーザーに DevTools を開いてもらわなくても、いつもの【状態速報コピー】に出る。
//   背景: サイドパネルの黒画面は開発環境で再現せず、実機だけで起きていた(2026-08-08)。
//   推測で修正を重ねるより、実機の値を1行で取り出せるようにする方が速い。
//
// ★描画には一切関与しない(読むだけ・best-effort)。失敗してもパネルは普通に動く。

import { judgeSidepanelBlack } from '../lib/sidepanelSelfDiag.js';
import { KEY_SIDEPANEL_SELF_DIAG } from '../lib/sidepanelSelfDiagKey.js';

/** @param {Element|null} el */
function sampleLayer(el) {
  if (!el) return null;
  try {
    const cs = getComputedStyle(/** @type {HTMLElement} */ (el));
    return {
      bgColor: cs.backgroundColor,
      bgImage: cs.backgroundImage === 'none' ? 'none' : 'grad',
      colorScheme: cs.colorScheme,
      styleAttr: el.getAttribute('style') ? 'yes' : 'no'
    };
  } catch {
    return null;
  }
}

function collectAndPublish() {
  try {
    const ifr = document.querySelector('iframe');
    const rect = ifr ? ifr.getBoundingClientRect() : null;
    /** @type {Document|null} */
    let innerDoc = null;
    let canRead = false;
    try {
      innerDoc = ifr ? ifr.contentDocument : null;
      canRead = Boolean(innerDoc && innerDoc.documentElement);
    } catch {
      canRead = false;
    }

    const innerLayer = canRead && innerDoc ? sampleLayer(innerDoc.documentElement) : null;
    const sample = {
      version: (() => {
        try {
          return chrome.runtime.getManifest().version;
        } catch {
          return '';
        }
      })(),
      panelW: window.innerWidth,
      panelH: window.innerHeight,
      outer: sampleLayer(document.documentElement),
      iframe: ifr
        ? {
            ...(sampleLayer(ifr) || {}),
            w: rect ? Math.round(rect.width) : 0,
            h: rect ? Math.round(rect.height) : 0,
            canRead,
            ready: canRead && innerDoc ? innerDoc.readyState : ''
          }
        : null,
      inner: innerLayer
        ? {
            ...innerLayer,
            bodyKids: innerDoc && innerDoc.body ? innerDoc.body.children.length : 0,
            cloak:
              innerDoc && innerDoc.documentElement
                ? innerDoc.documentElement.getAttribute('data-nl-popup-primary-cloak') || ''
                : ''
          }
        : null
    };

    const verdict = judgeSidepanelBlack(sample);
    void chrome?.storage?.local?.set({
      [KEY_SIDEPANEL_SELF_DIAG]: {
        at: Date.now(),
        ok: verdict.ok,
        cause: verdict.cause,
        line: verdict.line,
        sample
      }
    });
  } catch {
    /* best-effort: 診断の失敗はパネルを止めない */
  }
}

// ★2回測る: 描画前(早い瞬間)と、落ち着いた後。
//   「一瞬だけ黒い」と「ずっと黒い」を言い分けるため
//   ([[settled-state-hides-flash-bugs-2026-08-07]]=落ち着いた後だけ見ると症状が消える)。
try {
  const ifr = document.querySelector('iframe');
  if (ifr) ifr.addEventListener('load', () => setTimeout(collectAndPublish, 50), { once: true });
} catch {
  /* no-op */
}
setTimeout(collectAndPublish, 2500);
