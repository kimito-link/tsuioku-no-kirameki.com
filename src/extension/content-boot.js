// content-boot.js — 記録エンジン(content.js・約1.5MB)を、配信の視聴フレームだけに載せる。
// トップや広告の iframe で解析すると、低スペックの PC で Chrome が固まる。
import { needsNicoEngineFrame, shouldPollNicoEngine } from '../lib/nicoEngineBoot.js';

const root = typeof globalThis !== 'undefined' ? globalThis : window;
if (!root.__NLS_BOOT_ASKED__) {
  const hasPanel = () => {
    try {
      return !!(
        document.querySelector('.ga-ns-comment-panel') ||
        document.querySelector('.comment-panel')
      );
    } catch {
      return false;
    }
  };
  const isTop = () => {
    try {
      return window.self === window.top;
    } catch {
      return true;
    }
  };
  const ask = () => {
    if (root.__NLS_BOOT_ASKED__) return;
    if (!needsNicoEngineFrame(String(location.href || ''), { isTop: isTop(), hasCommentPanel: hasPanel() })) return;
    root.__NLS_BOOT_ASKED__ = true;
    try {
      chrome.runtime.sendMessage({ type: 'NLS_BOOT_ENGINE', file: 'dist/content.js' }, (res) => {
        if (!res || res.ok !== true) root.__NLS_BOOT_ASKED__ = false;
      });
    } catch {
      root.__NLS_BOOT_ASKED__ = false;
    }
  };
  ask();
  if (!root.__NLS_BOOT_ASKED__ && shouldPollNicoEngine(String(location.href || ''), isTop())) {
    const timer = setInterval(() => {
      ask();
      if (root.__NLS_BOOT_ASKED__) clearInterval(timer);
    }, 1000);
    setTimeout(() => clearInterval(timer), 120000);
  }
}
