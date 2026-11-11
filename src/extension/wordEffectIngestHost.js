/**
 * wordEffectIngestHost.js — 届いたコメントを、同じ画面と別窓の演出へ渡す。
 * コメントの一時的な控えには書かない。過去ログの取り込みは lib が捨てる。
 */
import { buildWordEffectIngestMessage } from '../lib/wordEffect.js';

/** @type {Set<(message: Record<string, unknown>) => void>} */
const feeds = new Set();

/**
 * 同じバンドルの中の演出層が受け取る。
 * @param {(message: Record<string, unknown>) => void} fn
 * @returns {() => void}
 */
export function subscribeWordEffectIngest(fn) {
  feeds.add(fn);
  return () => feeds.delete(fn);
}

/**
 * @param {unknown} liveId
 * @param {unknown} rows
 * @param {{ kind?: 'comment'|'gift', source?: string, pageHost?: string }} [opts]
 * @returns {Record<string, unknown>|null}
 */
export function publishWordEffectIngest(liveId, rows, opts = {}) {
  const msg = buildWordEffectIngestMessage(liveId, rows, opts.kind || 'comment', opts.source || '', opts.pageHost || '');
  if (!msg) return null;
  for (const fn of feeds) {
    try { fn(msg); } catch { /* 1つの画面が失敗しても他は出す */ }
  }
  try {
    chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
  } catch { /* 受け手がいない別窓は無視する */ }
  return msg;
}
