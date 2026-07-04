// ②応援プレビュー(INLINE_PASSIVE)が「自分が描画できた」を status へ伝えるための専用 ack キー。
//   ★council/parity-diagnose-SYNTHESIS.md の地雷回避: passive は本物の鏡(KEY_LANE_MIRROR 等)を上書きしない
//     原則がある。なので本物の鏡とは【別キー】に、passive だけが片方向で書く(本物 popup は読まない)。
//   中身: { ready, ts, liveId, laneTiles, supporterRows }。観測のみ=描画/記録は変えない。
//   ★v0.1.1025(嘘の✅根治): 従来 ack は {ready,ts,liveId} だけで「②が同じ配信を最近描いた」しか伝えず、
//     parity は②の【実際に描いた中身】を突合できなかった。②で応援者ランキングが空でも「✅同一」と誤表示していた。
//     そこで②が実際に描いた件数(応援レーンのDOMタイル数 laneTiles・応援者ランキング行数 supporterRows)を載せ、
//     parityVerdict が①(鏡の件数)と突合し、ズレたら🔴にする=②の描画欠落を検知する。
export const KEY_PREVIEW_RENDER_ACK = 'nls_preview_render_ack_v1';

/**
 * ack スナップショットを組む(純関数)。
 *   v0.1.1056(パリティ根本修正 Phase2): gen を追加。②が読んだ鏡バンドルの世代(bundleGen)を
 *   ここに載せることで、parityVerdict が「①が書いた世代」と「②が読んで描いた世代」を突合できる
 *   ようになる(値の食い違いでなく世代のズレで判定=mirrors-written-per-key-per-tick 問題の根治)。
 * @param {{ ready?: boolean, liveId?: string, nowMs?: number, laneTiles?: number, supporterRows?: number, gen?: number }} input
 * @returns {{ ready: boolean, ts: number, liveId: string, laneTiles: number, supporterRows: number, gen: number }}
 */
export function buildPreviewRenderAck(input = {}) {
  const ready = input.ready === true;
  const ts = Number(input.nowMs) > 0 ? Math.floor(Number(input.nowMs)) : 0;
  const liveId = String(input.liveId || '').trim().toLowerCase();
  const laneTiles = Math.max(0, Math.floor(Number(input.laneTiles) || 0));
  const supporterRows = Math.max(0, Math.floor(Number(input.supporterRows) || 0));
  const gen = Math.max(0, Math.floor(Number(input.gen) || 0));
  return { ready, ts, liveId, laneTiles, supporterRows, gen };
}
