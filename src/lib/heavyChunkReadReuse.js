// @ts-nocheck — 純データ判定(chrome/DOM 非依存)
/**
 * heavy 全件コメント read の再利用判定純関数
 *   (HANDOFF-heavyrace-backfill-IMPL.md B・heavyRace再発の根治)。
 *
 * 真因: 既存の canReuseHeavyChunkRead は「キャッシュが【現】total の80%以上をカバー」で再利用可否を決める。
 *   大配信+過去ログ遡り中(backfill)は total が秒単位で増え続けるため、一度全件読めても次 poll で
 *   80% を割り、毎 poll 全件 re-read→3秒 poll に追い越されて race 固着(たぬ姉段でサムネ無しに退化)。
 *   v1035 の自己修復(一度読めた全件を次に活かす)は total 固定前提で、動的 total 増加では機能しない。
 *
 * 根治: 既存の coverage 条件に加え、「**前回の読了時点では total をほぼ読み切っていた完全 read が
 *   直近 N 秒以内にある**」なら、現 total に対する coverage が割れていても再利用する(fresh-read)。
 *   不足分は tail concat と次回 read が埋める。これで backfill 中の全件 re-read が最頻でも N 秒に1回に落ち、
 *   read が settle する時間が生まれる=race が消える。
 *
 * ★純データ判定: 配列本体は渡さず arrLength/chunkTotal/readAtMs の縮約だけ受ける(軽い・テスト容易)。
 *
 * @module heavyChunkReadReuse
 */

/** fresh-read 再利用を許す「読了からの経過」上限[ms]。robust-arch Phase1 の min-gap はしごと同じ思想
 *  (計器 fresh-read reuse を実配信で読んで調整する前提の定数)。 */
export const HEAVY_FULL_REREAD_MIN_GAP_MS = 12_000;

/**
 * @param {object} args
 * @param {string} args.lv 現在の配信 liveId
 * @param {{ lv?: string, arrLength?: number, chunkTotal?: number|null, readAtMs?: number }|null|undefined} args.cached
 *   watchMetaCache.lastCommentsArr の縮約(配列本体は渡さない)
 * @param {number|null|undefined} args.currentChunkTotal 現在のチャンク総数(null/0=非チャンク=coverage 常に成立)
 * @param {number} args.nowMs Date.now()(注入=テスト容易)
 * @param {number} [args.minGapMs] fresh-read の経過上限(既定 HEAVY_FULL_REREAD_MIN_GAP_MS)
 * @returns {{ reuse: boolean, reason: 'coverage'|'fresh-read'|'' }}
 */
export function decideHeavyChunkReadReuse(args) {
  const a = args && typeof args === 'object' ? args : {};
  const lv = String(a.lv || '').trim().toLowerCase();
  const cached = a.cached && typeof a.cached === 'object' ? a.cached : null;
  const currentChunkTotal = a.currentChunkTotal;
  const nowMs = Number(a.nowMs) || 0;
  const minGapMs = Number.isFinite(Number(a.minGapMs)) && Number(a.minGapMs) > 0
    ? Number(a.minGapMs)
    : HEAVY_FULL_REREAD_MIN_GAP_MS;

  if (!cached) return { reuse: false, reason: '' };
  const cachedLv = String(cached.lv || '').trim().toLowerCase();
  const arrLength = Math.max(0, Math.floor(Number(cached.arrLength) || 0));
  if (!cachedLv || cachedLv !== lv || arrLength <= 0) return { reuse: false, reason: '' };

  // 条件1(現行そのまま=coverage): 現 total の80%以上を持つ。非チャンク(null/0)は常に成立。
  const curTotal = currentChunkTotal;
  const coverageOk =
    curTotal == null ||
    curTotal === 0 ||
    arrLength >= Math.floor(Number(curTotal) * 0.8);
  if (coverageOk) return { reuse: true, reason: 'coverage' };

  // 条件2(新設=fresh-read): 読了時点では完全(own chunkTotal の80%以上) かつ 読了が新しい(minGap 未満)。
  //   readAtMs 欠落(旧形式キャッシュ)は条件2不成立=現行と同一挙動(後方互換)。
  const ownTotal = cached.chunkTotal;
  const wasCompleteAtRead =
    ownTotal != null &&
    Number(ownTotal) > 0 &&
    arrLength >= Math.floor(Number(ownTotal) * 0.8);
  const readAtMs = Number(cached.readAtMs);
  const readFresh = Number.isFinite(readAtMs) && readAtMs > 0 && nowMs - readAtMs < minGapMs;
  if (wasCompleteAtRead && readFresh) return { reuse: true, reason: 'fresh-read' };

  return { reuse: false, reason: '' };
}
