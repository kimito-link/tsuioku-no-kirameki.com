/**
 * スマホの開始画面(/phone・iPhone アプリが最初に開くページ)。
 *   PC の拡張の「📱 スマホへ送信」で出たリンクを貼ると、この端末で覚えて次から自動で開く。
 *   PC が無くても「デモを見る」で中身を試せる(/live-view?v=demo・作り物の配信)。
 *   v0.1.1764: PC が無くても「いま配信中の応援ランキング」(/live・app/live.html)を見られる。
 *
 * @module phone-start
 */
import { PHONE_START_LINK_KEY, parseViewerLink, savedViewerPath, viewerPathFor } from '../src/lib/phoneStartLink.js';

/** 覚えたリンクを自動で開くまでの待ち(ms)。その間に「リンクを変える」を押せる。 */
const AUTO_OPEN_MS = 1_500;

function readSaved() {
  try { return savedViewerPath(localStorage.getItem(PHONE_START_LINK_KEY)); } catch { return ''; }
}
/** @param {string} path */
function writeSaved(path) {
  try {
    if (path) localStorage.setItem(PHONE_START_LINK_KEY, path);
    else localStorage.removeItem(PHONE_START_LINK_KEY);
  } catch {
    /* 覚えられなくても今回は開ける */
  }
}

function boot() {
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const input = /** @type {HTMLInputElement} */ ($('linkInput'));
  const msg = $('linkMsg');
  const resume = $('resumeCard');
  let autoTimer = 0;

  /** @param {string} path */
  const go = (path) => location.assign(path);
  const openFrom = (/** @type {string} */ raw) => {
    const link = parseViewerLink(raw);
    if (!link) {
      msg.textContent = 'このリンクは開けません。PC の拡張の「📱 スマホへ送信」で出たリンク(app.tsuioku-no-kirameki.com/live-view?v=…)を貼ってください。';
      msg.dataset.kind = 'error';
      return;
    }
    writeSaved(`/live-view?v=${encodeURIComponent(link.token)}`);
    go(viewerPathFor(link));
  };

  $('openBtn').addEventListener('click', () => openFrom(input.value));
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') openFrom(input.value); });
  $('pasteBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      input.value = text.trim();
      openFrom(input.value);
    } catch {
      msg.textContent = '貼り付けできませんでした。入力欄を長押しして「ペースト」を選んでください。';
      msg.dataset.kind = 'error';
    }
  });
  $('demoBtn').addEventListener('click', () => go('/live-view?v=demo'));
  $('rankingBtn').addEventListener('click', () => go('/live'));

  const saved = readSaved();
  if (saved && !new URLSearchParams(location.search).has('change')) {
    resume.hidden = false;
    autoTimer = window.setTimeout(() => go(saved), AUTO_OPEN_MS);
    $('resumeChange').addEventListener('click', () => {
      clearTimeout(autoTimer);
      resume.hidden = true;
      writeSaved('');
      input.focus();
    });
    $('resumeOpen').addEventListener('click', () => { clearTimeout(autoTimer); go(saved); });
    $('resumeRanking').addEventListener('click', () => { clearTimeout(autoTimer); go('/live'); });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
