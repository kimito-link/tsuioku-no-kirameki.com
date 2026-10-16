/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】会場のピックアップ枠(BSP風)に出す「直近に届いた発言」の小さなリング(追記・古い順の掃除)
 * 【この箱に入らないもの】どれを選ぶか(pickTickerHighlight.js)・DOM(venuePickupBanner.js)・storage
 * 【書けるstorageキー】なし
 * 【正本宣言】ピックアップ枠の入力(直近の発言の行)の保持規則はこのファイルのみ
 *
 * ★なぜ(2026-10-17・実機+手元の実配信で再現): 会場のピックアップ枠は commitDisplay が受ける表示行から選んでいたが、
 *   表示行は storage 集計/鏡由来(text:'' 固定)で、発言を行へ混ぜた直後の1回の commit にしか本文が乗らない(次の鏡 commit で消える)。
 *   結果、発言(吹き出し・読み上げ)は出ているのに枠は「コメントが流れると、ここに…」の案内文のままだった
 *   (headless で bubbles=1〜3 なのに枠は案内文・実機でも同じ)。
 *   → 枠の入力を表示行から切り離し、発言が届くたびに積む【独立のリング】にする。吹き出し・読み上げと同じ発言(processSpeechRows の結果)を使う。
 * @module venuePickupRing
 */

import { toEpochMs } from './timeAuthority.js'; // 時点の解釈は正本(timeAuthority)へ委譲する

/** リングに残す最大件数(枠が選ぶ候補=直近の窓なので少なくてよい)。 */
export const PICKUP_RING_MAX = 40;
/** これより古い発言はリングから落とす(ms)。枠の遡り窓(約8秒)より十分長く、案内文に戻る前の保険に使う。 */
export const PICKUP_RING_MAX_AGE_MS = 120_000;

/**
 * @typedef {{ userId: string, name: string, text: string, capturedAt: number, kind: string, speaker?: any }} PickupRow
 */

/**
 * 新着の発言をリングへ足した【新しい配列】を返す(入力は破壊しない)。
 *   - 本文が空の発言は足さない / 同じ key(コメント)は二重に足さない / 古い行は落とす / 上限で古い順に切る。
 * @param {ReadonlyArray<PickupRow & { key?: string }>|null|undefined} ring
 * @param {ReadonlyArray<{ key?: unknown, userId?: unknown, name?: unknown, text?: unknown }>|null|undefined} speeches 新着の発言(processSpeechRows の speeches)
 * @param {number} nowMs
 * @param {{ max?: number, maxAgeMs?: number, resolveSpeaker?: (speech: any) => any }} [opts]
 *   resolveSpeaker: 発言者の情報セット(サムネ・ハンドル名・ID・リンク)を作る関数(venuePickupSpeaker.js)。行に speaker として持たせる。
 * @returns {Array<PickupRow & { key?: string }>}
 */
export function appendPickupRows(ring, speeches, nowMs, opts = {}) {
  const max = Math.max(1, Math.floor(Number(opts.max) || PICKUP_RING_MAX));
  const maxAge = Math.max(1000, Number(opts.maxAgeMs) || PICKUP_RING_MAX_AGE_MS);
  const now = Number(nowMs);
  const base = Array.isArray(ring) ? ring.slice() : [];
  const seen = new Set(base.map((r) => String(r.key || '')).filter(Boolean));
  for (const s of Array.isArray(speeches) ? speeches : []) {
    const text = String(s?.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = String(s?.key ?? '').trim();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    /** @type {any} */
    let speaker = null;
    try { speaker = typeof opts.resolveSpeaker === 'function' ? opts.resolveSpeaker(s) : null; } catch { speaker = null; }
    base.push({ key, userId: String(s?.userId ?? '').trim(), name: String(s?.name ?? '').trim(), text, capturedAt: Number.isFinite(now) && now > 0 ? now : 0, kind: 'comment', speaker });
  }
  const fresh = Number.isFinite(now) && now > 0 ? base.filter((r) => now - toEpochMs(r.capturedAt) <= maxAge) : base;
  return fresh.length > max ? fresh.slice(fresh.length - max) : fresh;
}
