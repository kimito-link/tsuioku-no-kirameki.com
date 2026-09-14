/**
 * liveRecentHoverCard.js — `/live/` の「コメントで応援した人」にホバーしたとき出す
 *   小さなカードの中身(HTML 文字列)を作る純関数(v0.1.1514)。
 *
 * ★DOM も fetch も持たない。状態(state)を渡すと HTML 文字列を返すだけ。
 *   画面側(live-ranking-entry.js)が fetch の進行に合わせて state を切り替え、
 *   ここが返した文字列を 1 個のカード要素に流し込む。テストは HTML 文字列を検査する。
 *
 * ★本文は必ず escapeHtml を通す(取得した発言をそのまま innerHTML に流さない)。
 *
 * ■ 6 状態(設計 §機能B)
 *   loading   取得中
 *   ok        成功(発言が 1 件以上)
 *   empty     0 件(取れたが直近区画に無い)
 *   error     失敗(取得できなかった)
 *   unsupported  未対応(サーバが 501=WebSocket が無い環境)
 *   blank     空(uid が集計対象に無い等・出すものが無い)
 *
 * @module liveRecentHoverCard
 */

import { escapeHtml } from './htmlText.js';

/**
 * @typedef {'loading'|'ok'|'empty'|'error'|'unsupported'|'blank'} RecentHoverPhase
 * @typedef {{ phase: RecentHoverPhase, texts?: ReadonlyArray<string>, partial?: boolean }} RecentHoverState
 */

/** 各状態の短いメッセージ(星野ロミ式=無言にしない・理由を添える)。 */
const MESSAGES = Object.freeze({
  loading: '発言を取得中…',
  empty: '直近の区画には見当たりませんでした',
  error: 'いまは取得できませんでした',
  unsupported: 'この環境では発言を表示できません',
  blank: ''
});

/**
 * ホバーカードの中身(HTML 文字列)を組み立てる。
 *
 * @param {RecentHoverState} state
 * @returns {string} カードの innerHTML(呼び出し側が用意した要素に入れる)
 */
export function buildRecentCardHtml(state) {
  const phase = state && typeof state === 'object' ? state.phase : 'blank';
  if (phase === 'ok') {
    const texts = Array.isArray(state.texts) ? state.texts.filter((t) => typeof t === 'string' && t) : [];
    if (!texts.length) {
      // ok と言われても中身が無ければ empty と同じ扱い(嘘のカードを出さない)。
      return `<p class="st">${escapeHtml(MESSAGES.empty)}</p>`;
    }
    const items = texts.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
    const note = state.partial ? '<p class="st">（直近ぶんだけ）</p>' : '';
    return `<ul>${items}</ul>${note}`;
  }
  const msg = /** @type {Record<string, string>} */ (MESSAGES)[String(phase)] ?? '';
  if (!msg) return '';
  return `<p class="st">${escapeHtml(msg)}</p>`;
}
