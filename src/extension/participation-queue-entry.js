/**
 * OBS に重ねる参加の順番。文字だけを出す。画像も定期読み直しも無い。
 */

import '../lib/extDocBusyCensusBoot.js';
import {
  formatParticipationObsText,
  normalizeParticipationQueue,
  participationQueueDemoState,
  participationQueueStorageKey
} from '../lib/participationQueue.js';

const pre = document.getElementById('pqText');

/** @param {string} text */
function paint(text) {
  if (!pre || pre.textContent === text) return;
  pre.textContent = text;
}

function demoRequested() {
  try {
    return /(?:\?|&)demo=1(?:&|$)/.test(String(location.search || ''));
  } catch {
    return false;
  }
}

function liveIdFromUrl() {
  try {
    return new URLSearchParams(location.search).get('lv') || '';
  } catch {
    return '';
  }
}

function start() {
  if (demoRequested()) {
    paint(formatParticipationObsText(participationQueueDemoState()));
    return;
  }
  const key = participationQueueStorageKey(liveIdFromUrl());
  const store = (() => {
    try {
      return globalThis.chrome?.storage?.local || null;
    } catch {
      return null;
    }
  })();
  if (!key || !store) {
    paint('');
    return;
  }
  const draw = (raw) => {
    const state = normalizeParticipationQueue(raw);
    paint(state.opaque ? '' : formatParticipationObsText(state));
  };
  store.get(key).then((bag) => draw(bag && bag[key]), () => paint(''));
  try {
    const onChanged = globalThis.chrome?.storage?.onChanged;
    if (onChanged && typeof onChanged.addListener === 'function') {
      onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[key]) return;
        draw(changes[key].newValue);
      });
    }
  } catch { /* 読めなくても空のまま透過 */ }
}

start();
