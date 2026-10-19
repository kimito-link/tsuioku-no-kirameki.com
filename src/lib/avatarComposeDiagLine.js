/**
 * 匿名の顔の合成の状況(Worker・永続キャッシュ・フォールバック)を状態速報に出す1行を作る純関数(v0.1.1682)。
 *
 * ■ なぜ要るか(2026-10-19)
 *   v1681 で顔の合成を専用 Worker へ移したが、popup の診断は開いて約0.5秒後に1回だけ書かれるため、
 *   顔が実際に要求された後の Worker の状態(ready/dead/unused)が実機では読めなかった。
 *   「動いているつもり」を検証不能にしないため、popup が要求の後に書いた統計を、サイドパネルの自己診断が読んで1行にする。
 *
 * 原因は断定しない(事実の数値だけ)。
 * @module avatarComposeDiagLine
 */

/** popup(合成を呼ぶ文書)が書く chrome.storage.session のキー。sidepanel が読む。 */
export const KEY_AVATAR_COMPOSE_DIAG = 'nls_avatar_compose_diag_v1';

/** @param {unknown} v */
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * @param {{ at?: number, stats?: any } | null | undefined} rec
 * @param {number} nowMs
 * @returns {string} 記録が無ければ ''
 */
export function formatAvatarComposeDiagLine(rec, nowMs) {
  if (!rec || typeof rec !== 'object' || !rec.stats || typeof rec.stats !== 'object') return '';
  const s = rec.stats;
  const w = s.worker && typeof s.worker === 'object' ? s.worker : { state: 'unused' };
  const ago = typeof rec.at === 'number' ? `${Math.max(0, Math.round((nowMs - rec.at) / 1000))}秒前` : '時刻不明';
  const parts = [
    `顔の合成(${ago}の記録): 要求${n(s.requested)}`,
    `メモリ${n(s.cacheHit)}`,
    `永続キャッシュ${n(s.persistedHit)}`,
    `先読み${n(s.hydrated)}`,
    `Worker成功${n(s.workerComposed)}`,
    `Worker失敗→従来合成${n(s.workerFallback)}`,
    `Worker=${String(w.state || 'unused')}`
  ];
  if (w.state && w.state !== 'unused') {
    parts.push(`起動${n(w.started)}・成功${n(w.rendered)}・失敗${n(w.failed)}・時間切れ${n(w.timedOut)}`);
  }
  if (w.lastError) parts.push(`最後のエラー: ${String(w.lastError).slice(0, 80)}`);
  return parts.join(' / ');
}
