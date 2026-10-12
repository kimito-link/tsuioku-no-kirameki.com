/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】同じ配信の鏡を複数のパネルが書くときの「譲る」判定
 * 【この箱に入らないもの】storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】鏡の書き手どうしの衝突回避(小さい方が譲る)の判定はこのファイルのみ
 *
 * laneMirrorWriterYield.js — 鏡の書き手が2つ以上あるとき、小さい鏡が大きい鏡を上書きしないようにする。
 *
 * ■ 実測(2026-10-12・scripts/perf-ab/parity.mjs --writes 1・lv351531643)
 *   視聴ページには自動表示が切れていてもパネル(popup.html?inline=1)が常駐する。サイドパネルも開けば
 *   同じ配信の鏡を【2つのパネル】が書く。片方は全員(1096人)、片方は途中(283人)のまま止まり、
 *   後から書いた方が勝つため、鏡が 1096 → 283 → 1096 と往復した(鏡≠POP・会場が追従して食い違う)。
 * ■ 方針
 *   書く直前に、保存されている鏡を読み(呼び手が Web Locks で直列化した中で)、
 *   【他のパネルが直近 windowMs 以内に書いた、より大きい鏡】なら自分は書かずに譲る。
 *   - 通知(onChanged)の到着待ちに頼らない: 重いページは通知の処理が遅れ、判定が間に合わなかった(実測)。
 *   - 大きい方が閉じる/止まる → windowMs 後に自分が書き始める(誰も書かない谷を作らない)。
 *   - 同数は譲らない(同じ大きさなら内容もほぼ同じ)。writerId の無い鏡(旧版)も譲らない=従来どおり。
 */

import { CANONICAL_TIME_FIELD } from './timeAuthority.js';

/**
 * 他のパネルの書き込みを「生きている」とみなす時間[ms]。
 *   鏡の書き込み床(同内容でも60秒に1回)より十分長く取る。実測(重いPC・2026-10-12)で、大きい側の書き込み間隔が
 *   最大114秒まで開き、120秒の窓では小さい側に上書きされた。大きい側が本当に閉じたなら、5分後に自分が書き始める。
 *   会場が古い鏡を使い続ける上限(HARD 15分)より小さく保つ。
 */
export const LANE_MIRROR_YIELD_WINDOW_MS = 300_000;

/**
 * @param {{ writerId?: unknown, pickedLength?: unknown }|null|undefined} stored 保存されている鏡(時点は CANONICAL_TIME_FIELD)
 * @param {{ pickedLength?: unknown }} mine 自分が書こうとしている鏡
 * @param {string} myId 自分の書き手ID
 * @param {number} nowMs
 * @param {number} [windowMs]
 * @returns {boolean} true=書かずに譲る
 */
export function shouldYieldToStoredMirror(stored, mine, myId, nowMs, windowMs = LANE_MIRROR_YIELD_WINDOW_MS) {
  if (!stored || typeof stored !== 'object') return false;
  const wid = String(stored.writerId || '');
  if (!wid || wid === String(myId || '')) return false; // 旧版の鏡・自分の鏡には譲らない
  const at = Number(/** @type {Record<string, unknown>} */ (stored)[CANONICAL_TIME_FIELD]); // 時点フィールド名は時刻の正本(timeAuthority)に委ねる
  if (!Number.isFinite(at) || at <= 0 || nowMs < at || nowMs - at > windowMs) return false;
  const theirs = Math.max(0, Math.floor(Number(stored.pickedLength) || 0));
  const my = Math.max(0, Math.floor(Number(mine?.pickedLength) || 0));
  return theirs > my;
}
