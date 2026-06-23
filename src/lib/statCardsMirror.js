/**
 * 数字カード鏡のスナップショット純関数。popup 上部の数字カード(記録N件・推定同時接続・来場者数)と
 * 公式統計チップを、status が同じ値で描けるように最小データで保存する。応援レーンの鏡(laneMirror.js)と
 * 同思想・同構造。会場には一切関係しない=popup と status だけ。
 *
 * ★公式チップは status 側で再計算せず、ここで buildOfficialNicoStatsStripDigest を呼んで【確定格納】する
 *   =popup の paint と完全に同じ値・似せて自作を回避・status を軽く保つ。
 *
 * @typedef {{ text: string, isPlaceholder: boolean }} StatChip
 * @typedef {{
 *   liveId: string,
 *   capturedAt: number,
 *   recordsText: string,
 *   recordsIsPlaceholder: boolean,
 *   recordsOfficialLine: string,
 *   recordsBreakdownLine: string,
 *   recordsIngestLine: string,
 *   concurrent: { estText: string, estIsPlaceholder: boolean, subText: string },
 *   visitor: { text: string, isPlaceholder: boolean },
 *   official: null | {
 *     summaryText: string,
 *     viewers: StatChip, comments: StatChip, streamAge: StatChip,
 *     adPts: StatChip, giftPts: StatChip, eventGiftPts: StatChip,
 *     eventRank: StatChip, eventTitle: StatChip
 *   }
 * }} StatCardsMirrorSnapshot
 */
import { buildOfficialNicoStatsStripDigest } from './officialNicoStatsStripDigest.js';

/** @param {unknown} v @returns {StatChip} */
function chip(v) {
  const c = /** @type {{ text?: unknown, isPlaceholder?: unknown }} */ (
    v && typeof v === 'object' ? v : {}
  );
  return { text: String(c.text || ''), isPlaceholder: c.isPlaceholder === true };
}

/**
 * @param {{
 *   liveId?: unknown,
 *   recordsText?: unknown, recordsIsPlaceholder?: unknown,
 *   recordsOfficialLine?: unknown, recordsBreakdownLine?: unknown, recordsIngestLine?: unknown,
 *   concurrent?: { estText?: unknown, estIsPlaceholder?: unknown, subText?: unknown },
 *   visitor?: { text?: unknown, isPlaceholder?: unknown },
 *   snapshotForOfficial?: unknown
 * }} input
 * @param {{ nowMs?: number }} [opts]
 * @returns {StatCardsMirrorSnapshot}
 */
export function buildStatCardsMirrorSnapshot(input, opts = {}) {
  const liveId = String(input?.liveId || '');
  const nowMs = Number.isFinite(Number(opts?.nowMs)) ? Number(opts.nowMs) : 0;
  const conc = input?.concurrent && typeof input.concurrent === 'object' ? input.concurrent : {};
  const vis = input?.visitor && typeof input.visitor === 'object' ? input.visitor : {};

  // 公式チップ: ここで digest を確定格納(status は再計算しない=齟齬ゼロ・似せて自作回避)。
  let official = null;
  const digest = buildOfficialNicoStatsStripDigest(input?.snapshotForOfficial);
  if (digest) {
    official = {
      summaryText: String(digest.summaryText || ''),
      viewers: chip(digest.viewers),
      comments: chip(digest.comments),
      streamAge: chip(digest.streamAge),
      adPts: chip(digest.adPts),
      giftPts: chip(digest.giftPts),
      eventGiftPts: chip(digest.eventGiftPts),
      eventRank: chip(digest.eventRank),
      eventTitle: chip(digest.eventTitle)
    };
  }

  return {
    liveId,
    capturedAt: nowMs,
    recordsText: String(input?.recordsText || ''),
    recordsIsPlaceholder: input?.recordsIsPlaceholder === true,
    recordsOfficialLine: String(input?.recordsOfficialLine || ''),
    recordsBreakdownLine: String(input?.recordsBreakdownLine || ''),
    recordsIngestLine: String(input?.recordsIngestLine || ''),
    concurrent: {
      estText: String(conc.estText || ''),
      estIsPlaceholder: conc.estIsPlaceholder === true,
      subText: String(conc.subText || '')
    },
    visitor: {
      text: String(vis.text || ''),
      isPlaceholder: vis.isPlaceholder === true
    },
    official
  };
}

/**
 * status の再描画 signature(変化時のみ paint=チラつき/重さ防止)。
 * @param {Partial<StatCardsMirrorSnapshot>|null|undefined} snap
 * @returns {string}
 */
export function buildStatCardsMirrorSignature(snap) {
  if (!snap || typeof snap !== 'object') return '';
  const o = /** @type {StatCardsMirrorSnapshot} */ (snap);
  const off = o.official;
  return [
    o.liveId || '',
    o.capturedAt || 0,
    o.recordsText || '',
    o.concurrent?.estText || '',
    o.visitor?.text || '',
    off ? [off.viewers.text, off.comments.text, off.streamAge.text, off.adPts.text, off.giftPts.text].join(',') : 'no-official'
  ].join('|');
}
