/**
 * 「応援プレビュー(②)を開いている間は診断更新が重い」を状態速報で名指しする純関数(v0.1.1020)。
 *
 * 背景(ユーザー実機 2026-07-01「応援プレビュー出すとめちゃ重くなる。これも診断に入れて」):
 *   ②応援プレビューは popup.html を iframe で丸ごと起動する重い作りで、同じ拡張の単一 storage を①と奪い合う。
 *   ②が前面にある間は診断(status)の更新所要が跳ね上がる(実機 16ms→25086ms)。だが従来の refreshPerf 行は
 *   「更新 Nms(重い順…)」を出すだけで、【②を開いているのが原因】とは名指しできず、ユーザーが体感で気づく
 *   しかなかった。②の描画 ack(previewRenderAck)が新鮮=②が開いている、を更新所要の重さと突合して自動で出す。
 *
 * 原則: 観測のみ(既存の refreshPerf と previewRenderAck を突合するだけ・新規取得ゼロ)。
 *   ②が開いていないのに重い場合は②のせいにしない(多配信/初期ロード等・別原因)。原因の誤指名を避ける。
 *
 * @module previewHeavyHint
 */

/** これを超える更新所要(ms)を「重い」とみなす閾値。通常は数ms〜数百ms。 */
export const PREVIEW_HEAVY_TOTAL_MS = 1500;
/** ②の描画 ack がこの新しさ以内なら「②が今開いている」とみなす(ms)。 */
export const PREVIEW_ACK_FRESH_MS = 90_000;

/**
 * @param {{ totalMs?: number|null }|null|undefined} refreshPerf 更新所要(formatRefreshPerfLine と同じ材料)
 * @param {{ ready?: boolean, ts?: number, liveId?: string }|null|undefined} previewAck ②の描画 ack
 * @param {number} nowMs
 * @param {{ heavyMs?: number, ackFreshMs?: number }} [opts]
 * @returns {{ heavy: boolean, previewOpen: boolean, totalMs: number|null, line: string }}
 *   line: 状態速報に出す1行(空文字なら出さない)
 */
export function buildPreviewHeavyHint(refreshPerf, previewAck, nowMs, opts = {}) {
  const heavyMs = Number(opts?.heavyMs) > 0 ? Number(opts.heavyMs) : PREVIEW_HEAVY_TOTAL_MS;
  const ackFreshMs = Number(opts?.ackFreshMs) > 0 ? Number(opts.ackFreshMs) : PREVIEW_ACK_FRESH_MS;
  const now = Number(nowMs) || 0;

  const p = refreshPerf && typeof refreshPerf === 'object' ? refreshPerf : null;
  const totalMs = p && Number.isFinite(Number(p.totalMs)) ? Number(p.totalMs) : null;
  const heavy = totalMs != null && totalMs >= heavyMs;

  const ack = previewAck && typeof previewAck === 'object' ? previewAck : null;
  const ackTs = ack ? Number(ack.ts) || 0 : 0;
  const previewOpen = ack != null && ack.ready === true && ackTs > 0 && now > 0 && now - ackTs <= ackFreshMs;

  let line = '';
  if (heavy && previewOpen) {
    const sec = Math.round((totalMs || 0) / 100) / 10; // 0.1秒単位
    line =
      `⚠ 応援プレビューを開いている間は診断の更新が重くなります(更新 ${sec}秒)。` +
      `応援プレビューは本体ポップアップを丸ごと埋め込むため、記録の心臓部(storage)を奪い合います。` +
      `重いと感じたら応援プレビューのタブを閉じると軽くなります(記録・取得は止まりません)。`;
  } else if (heavy) {
    // ②は開いていない=別原因(多配信/初期ロード/スクロール)。②のせいにしない。
    const sec = Math.round((totalMs || 0) / 100) / 10;
    line = `⚠ 診断の更新が重いです(更新 ${sec}秒)。応援プレビューは開いていないので、多配信の同時視聴や初期ロード側の可能性があります。`;
  }
  return { heavy, previewOpen, totalMs, line };
}
