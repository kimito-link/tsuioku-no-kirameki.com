/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】公式ギフト貢献度(koken)の行を、ギフト列の人物タイルへ変換して記録済みの人に足す純関数
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】ギフト列を公式貢献度で補う規則(重ね方・表示ラベル)はこのファイルのみ
 *
 * giftLaneOfficialFill.js — ギフト列に「公式のギフト貢献者」を補う。
 *
 * ■ なぜ要るか(2026-10-08 実機・ユーザー指摘「会場モードにこん太のギフトが出ていない」)
 *   ギフト列は「記録できたギフトを投げた人(数値ID付き)」だけが材料だった。ところが実配信では、公式のギフト貢献度に
 *   3人(たまご店長・名無し・にちゃい)いても、記録側では投げた人の数値IDが取れず、列が「該当者がいません」で空だった。
 *   隣の広告列は公式の広告ランキングを材料にしているので出ていた。同じ型(公式ランキング→人物タイル)でギフト列も補う。
 *
 * ■ 守ること
 *   1. 記録で取れた人が先(従来どおり)。公式は【足りない分だけ】後ろに足す=記録がある配信の見た目は変えない。
 *   2. 同じ数値IDは重ねない(記録側を優先)。ID無し(匿名・名無し)は公式の順位順にそのまま出す(公開値)。
 *   3. 表示は「ギフト」: ID行は「ギフト」、3行目は giftPt。広告列の変換(adLanePicksFromRooms)を再利用し、ラベルだけ直す。
 */

import { officialDomRankingRowsToStripRooms } from './officialDomRankingRowsToStripRooms.js';
import { adLanePicksFromRooms } from './adLanePicksFromRooms.js';

/**
 * 公式ギフト貢献度の行(koken 正規化後)をギフト列のタイルにする。
 * @param {unknown} rows
 * @param {Parameters<typeof adLanePicksFromRooms>[1]} io adLanePicksFromRooms と同じ(顔の生成・サムネ解決器・limit)
 * @returns {Array<{ displaySrc: string, title: string, meta: { idLine: string, nameLine: string }, entry: { userId: string }, stats?: { commentCount: null, giftPt: number, adPt: null } }>}
 */
export function officialGiftPicksFromRows(rows, io) {
  const list = Array.isArray(rows) ? rows : [];
  const rooms = officialDomRankingRowsToStripRooms(list, { userKeyKind: 'contrib' });
  return adLanePicksFromRooms(rooms, io).map((p) => {
    const { stats, ...rest } = /** @type {any} */ (p);
    const pt = Math.floor(Number(stats && stats.adPt));
    return {
      ...rest,
      meta: { ...p.meta, idLine: p.meta.idLine === '広告' ? 'ギフト' : p.meta.idLine },
      ...(pt > 0 ? { stats: { commentCount: null, giftPt: pt, adPt: null } } : {})
    };
  });
}

/**
 * 記録済みのギフト列の後ろに、公式の貢献者を(同じ数値IDを除いて)足す。
 * @template T
 * @param {ReadonlyArray<T>|null|undefined} recorded
 * @param {ReadonlyArray<{ entry: { userId: string } }>|null|undefined} official
 * @param {number} limit
 * @returns {Array<any>}
 */
export function mergeGiftPicksWithOfficial(recorded, official, limit) {
  const base = Array.isArray(recorded) ? recorded : [];
  const extra = Array.isArray(official) ? official : [];
  const cap = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : base.length + extra.length;
  if (extra.length === 0) return /** @type {any[]} */ (base);
  /** @type {any[]} */
  const out = base.slice(0, cap);
  const seen = new Set(
    out.map((p) => String(/** @type {any} */ (p)?.entry?.userId || '').trim()).filter(Boolean)
  );
  for (const p of extra) {
    if (out.length >= cap) break;
    const uid = String(p?.entry?.userId || '').trim();
    if (uid && seen.has(uid)) continue;
    if (uid) seen.add(uid);
    out.push(p);
  }
  return out;
}
