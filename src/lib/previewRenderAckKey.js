// ②応援プレビュー(INLINE_PASSIVE)が「自分が描画できた」を status へ伝えるための専用 ack キー。
//   ★council/parity-diagnose-SYNTHESIS.md の地雷回避: passive は本物の鏡(KEY_LANE_MIRROR 等)を上書きしない
//     原則がある。なので本物の鏡とは【別キー】に、passive だけが片方向で書く(本物 popup は読まない)。
//   中身は最小: { ready:boolean, ts:number(epoch ms), liveId:string }。観測のみ=描画/記録は変えない。
export const KEY_PREVIEW_RENDER_ACK = 'nls_preview_render_ack_v1';

/**
 * ack スナップショットを組む(純関数)。
 * @param {{ ready?: boolean, liveId?: string, nowMs?: number }} input
 * @returns {{ ready: boolean, ts: number, liveId: string }}
 */
export function buildPreviewRenderAck(input = {}) {
  const ready = input.ready === true;
  const ts = Number(input.nowMs) > 0 ? Math.floor(Number(input.nowMs)) : 0;
  const liveId = String(input.liveId || '').trim().toLowerCase();
  return { ready, ts, liveId };
}
