/**
 * パネルの「読み上げ」を会場と同じ ON/OFF にする。
 * popup-entry の行数を増やさないため、ボタンの見た目と保存だけをここへ出す。
 */
import { KEY_VOICE_READING_ENABLED } from '../../lib/voiceKeys.js';

/**
 * @param {(id: string) => HTMLElement|null} $
 */
export function wirePanelVoiceReadingButton($) {
  /** @param {boolean} on */
  const paint = (on) => {
    const btn = $('openComeviewVoiceBtn');
    if (!btn) return;
    const word = btn.querySelector('.nl-compose-qbtn__word');
    if (word) word.textContent = on ? '読み上げON' : '読み上げOFF';
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const label = on ? '読み上げを止めます' : '読み上げを始めます。VOICEVOX が必要です。';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  };
  /** @param {(on: boolean) => void} cb */
  const read = (cb) => {
    try {
      chrome.storage.local.get(KEY_VOICE_READING_ENABLED, (bag) => {
        try { void chrome.runtime.lastError; } catch { /* no-op */ }
        cb(bag && bag[KEY_VOICE_READING_ENABLED] === true);
      });
    } catch { /* 拡張の外では何もしない */ }
  };
  $('openComeviewVoiceBtn')?.addEventListener('click', () => {
    read((/** @type {boolean} */ on) => {
      const next = !on;
      try {
        chrome.storage.local.set({ [KEY_VOICE_READING_ENABLED]: next }, () => {
          try { void chrome.runtime.lastError; } catch { /* no-op */ }
          paint(next);
        });
      } catch { /* no-op */ }
    });
  });
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area && area !== 'local') return;
      const c = changes && changes[KEY_VOICE_READING_ENABLED];
      if (c) paint(c.newValue === true);
    });
  } catch { /* no-op */ }
  read(paint);
}
