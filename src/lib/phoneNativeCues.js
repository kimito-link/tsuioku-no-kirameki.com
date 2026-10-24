/**
 * iPhone アプリ(mobile/)だけの「ギフトが届いたら通知・振動」の判定(純関数)。
 *   効果音(phoneSoundCues.js)と同じく、コメント鏡のギフト行の【増えた分】だけを見る。
 *   ★最初に見た分は知らせない(開いた瞬間に過去のギフトがまとめて通知されないように)。
 *   ★1回の更新で何件増えても通知は1つにまとめる(通知が積み上がって邪魔にならないように)。
 *
 * @module phoneNativeCues
 */
import { giftRowSoundKey } from './phoneSoundCues.js';

const SEEN_CAP = 400;

/** @param {unknown} v */
function s(v) {
  return String(v == null ? '' : v).trim();
}

/**
 * @param {{ rows: any[], seen: Set<string>|null }} a seen が null = まだ一度も見ていない
 * @returns {{ gifts: { name: string, itemName: string, point: number }[], seen: Set<string> }}
 */
export function pickNewGiftsForNotice(a) {
  const rows = Array.isArray(a && a.rows) ? a.rows : [];
  const first = !(a && a.seen instanceof Set);
  const seen = first ? new Set() : new Set(a.seen);
  /** @type {{ name: string, itemName: string, point: number }[]} */
  const gifts = [];
  for (const row of rows) {
    if (!row || row.kind !== 'gift') continue;
    const key = giftRowSoundKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    if (first) continue;
    gifts.push({ name: s(row.name), itemName: s(row.itemName || row.text), point: Math.max(0, Math.floor(Number(row.point) || 0)) });
  }
  while (seen.size > SEEN_CAP) seen.delete(/** @type {string} */ (seen.values().next().value));
  return { gifts, seen };
}

/**
 * 通知の文面。1件なら誰から何が、複数なら件数と合計 pt。
 * @param {{ name: string, itemName: string, point: number }[]} gifts
 * @returns {{ title: string, body: string }|null}
 */
export function giftNoticeText(gifts) {
  if (!Array.isArray(gifts) || gifts.length === 0) return null;
  if (gifts.length === 1) {
    const g = gifts[0];
    const who = g.name ? `${g.name} さん` : 'だれか';
    const what = g.itemName || 'ギフト';
    return { title: '🎁 ギフトが届きました', body: `${who}から ${what}${g.point ? `(${g.point}pt)` : ''}` };
  }
  const total = gifts.reduce((n, g) => n + (g.point || 0), 0);
  return { title: `🎁 ギフトが ${gifts.length} 件届きました`, body: total ? `合計 ${total}pt` : 'アプリを開いて確かめてください' };
}
