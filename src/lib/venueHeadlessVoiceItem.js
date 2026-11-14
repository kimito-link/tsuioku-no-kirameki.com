/**
 * 【層】L0 判定層(ブラウザI/Oは呼び出し側へ委譲)
 * 【この箱に入るもの】閉じた会場で音声へ渡すコメントの正規化
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* の直接操作
 * 【書けるstorageキー】なし
 * 【正本宣言】閉じた会場で音声へ渡すコメントの正規化 の判断根拠はこのファイルのみ
 */
import { toEpochMs } from './timeAuthority.js';

/** 閉会場の音声経路へ渡す1件。描画状態と無関係に broadcaster context を保持する。 */
/**
 * @param {Record<string, any>} speech
 * @param {{ receivedAt?: number, liveId?: string, broadcasterUid?: string }} context
 */
export function buildVenueHeadlessVoiceItem(speech, context) {
  return {
    kind: 'comment',
    userId: speech?.userId,
    nickname: speech?.name,
    key: speech?.key,
    text: speech?.text,
    receivedAt: toEpochMs(speech?.capturedAt) || toEpochMs(context?.receivedAt) || Date.now(),
    liveId: String(context?.liveId || ''),
    broadcasterUid: String(context?.broadcasterUid || '')
  };
}
