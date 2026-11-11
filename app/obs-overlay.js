/**
 * OBSのブラウザソースに貼る透過ページ（app.tsuioku-no-kirameki.com/obs）。
 * 見た目は URL の s。コメントは、パソコンがオンにした中継（Ably の SSE）だけ。
 * 拡張の storage は読まない。過去のコメントは取りに行かない。
 */

import { createPhoneRealtime } from './live-view-realtime.js';
import { liveRowKey } from '../src/lib/liveEvents.js';
import {
  OBS_PAGE_HEARTBEAT_MS,
  readObsBrowserSourceQuery
} from '../src/lib/obsBrowserSource.js';
import {
  buildObsOverlayCss,
  obsOverlayStyleOrDefault
} from '../src/lib/obsOverlayStyle.js';
import { applyObsRowVisibility } from '../src/extension/obsOverlayApply.js';

const MAX_DOM_ROWS = 60;
/** @type {string[]} */
const seenOrder = [];
/** @type {Set<string>} */
const seen = new Set();

/** @param {string} text */
function showWait(text) {
  const el = document.getElementById('obsWait');
  if (!el) return;
  el.hidden = !text;
  el.textContent = text;
}

/** @param {import('../src/lib/obsOverlayStyle.js').ObsOverlayStyle} style */
function mountStyle(style) {
  document.body.classList.add('is-obs');
  document.body.classList.toggle('obs-hide-icons', style.showIcons === false);
  document.body.classList.toggle('obs-hide-names', style.showNames === false);
  document.body.classList.toggle('obs-animate', style.animate === true);
  let tag = document.querySelector('style[data-obs-overlay-style]');
  if (!(tag instanceof HTMLStyleElement)) {
    tag = document.createElement('style');
    tag.dataset.obsOverlayStyle = '1';
    document.head.appendChild(tag);
  }
  tag.textContent = buildObsOverlayCss(style, 'body.is-obs');
}

/**
 * @param {any} row
 * @param {HTMLElement} list
 */
function remember(key) {
  if (!key || seen.has(key)) return false;
  seen.add(key);
  seenOrder.push(key);
  if (seenOrder.length > MAX_DOM_ROWS * 4) seen.delete(/** @type {string} */ (seenOrder.shift()));
  return true;
}

function appendRow(row, list) {
  const key = liveRowKey(row);
  if (key && !remember(key)) return;
  const gift = row.kind === 'gift' || row.type === 'gift';
  const line = document.createElement('div');
  line.className = gift ? 'nl-tl-gift cv-row-in' : 'nl-tl-row cv-row-in';
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.className = gift ? 'nl-tl-gift__avatar' : 'nl-tl-row__avatar';
  img.referrerPolicy = 'no-referrer';
  if (typeof row.avatarUrl === 'string' && row.avatarUrl.startsWith('https://')) img.src = row.avatarUrl;
  img.addEventListener('error', () => { img.remove(); });
  const name = document.createElement('span');
  name.className = gift ? 'nl-tl-gift__name' : 'nl-tl-row__name';
  name.textContent = String(row.name || '');
  const text = document.createElement('span');
  text.className = gift ? 'nl-tl-gift__item' : 'nl-tl-row__text';
  text.textContent = String(row.text || '');
  if (gift) {
    const wrap = document.createElement('span');
    wrap.className = 'nl-tl-gift__avatar-wrap';
    const badge = document.createElement('span');
    badge.className = 'nl-tl-gift__badge';
    badge.textContent = '🎁';
    wrap.append(img, badge);
    line.append(wrap, name, text);
  } else if (img.src) {
    line.append(img, name, text);
  } else {
    line.append(name, text);
  }
  list.appendChild(line);
  while (list.childElementCount > MAX_DOM_ROWS) list.firstElementChild?.remove();
}

function main() {
  const q = readObsBrowserSourceQuery(location.search);
  const style = obsOverlayStyleOrDefault(q.style);
  mountStyle(style);
  const list = document.getElementById('obsList');
  if (!(list instanceof HTMLElement)) return;
  applyObsRowVisibility(list, style.maxLines);
  if (!q.token) {
    showWait('URLが違います');
    return;
  }
  showWait('待っています');
  const beat = () => {
    void fetch(`/api/status?v=${encodeURIComponent(q.token)}`, { cache: 'no-store' }).catch(() => {});
  };
  beat();
  window.setInterval(beat, OBS_PAGE_HEARTBEAT_MS);
  const rt = createPhoneRealtime({
    token: q.token,
    isHidden: () => false,
    onRows(_liveId, rows) {
      for (const row of rows) appendRow(row, list);
      applyObsRowVisibility(list, style.maxLines);
      if (list.childElementCount) showWait('');
    },
    onLiveChanged() {
      list.replaceChildren();
      seen.clear();
      seenOrder.length = 0;
      showWait('配信が変わりました');
    }
  });
  rt.start();
  window.setTimeout(() => {
    if (list.childElementCount) return;
    const state = rt.stats().state;
    if (state === 'off') showWait('中継が止まっています');
  }, 4000);
}

main();
