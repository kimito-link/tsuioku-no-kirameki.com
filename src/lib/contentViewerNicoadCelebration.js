/**
 * watch ページ（content）上で、自分のニコニ広告を DOM から即検知して演出する。
 * popup の heavy 待ち・ゲートを迂回し、プレイヤー上に直接 shower を出す。
 */

import { parseNicoadCommentText } from './parseGiftComment.js';
import {
  buildSelfAdCelebrationSpec,
  selfAdCelebrationAsPachinkoThrow
} from './selfActionCelebration.js';
import { flyTextLinesForSupportCelebration } from './celebrationFlyText.js';
import { playWatchCelebrationRelay } from './watchCelebrationOverlay.js';
import { senderLooksLikeViewer } from './viewerCelebrationMatch.js';

const MIN_GAP_MS = 2000;
/** @type {Set<string>} */
const dedupeKeys = new Set();
let lastPlayedAt = 0;

/**
 * @param {unknown} text
 * @param {{
 *   liveId?: string,
 *   viewerNickname?: string,
 *   viewerUserId?: string,
 *   resolveImageUrl?: (rel: string) => string
 * }} ctx
 */
export function maybePlayViewerNicoadCelebrationFromDomText(text, ctx = {}) {
  const rawText = String(text || '');
  const parsed = parseNicoadCommentText(rawText);
  if (!parsed) return;
  const lid = String(ctx.liveId || '').trim().toLowerCase();
  if (!lid) return;
  if (
    !senderLooksLikeViewer(parsed.sender, ctx.viewerNickname, ctx.viewerUserId)
  ) {
    return;
  }
  const now = Date.now();
  if (now - lastPlayedAt < MIN_GAP_MS) return;
  const dedupeKey = `${lid}|${parsed.point}|${parsed.sender}|${rawText.slice(0, 48)}`;
  if (dedupeKeys.has(dedupeKey)) return;
  if (dedupeKeys.size > 80) dedupeKeys.clear();
  dedupeKeys.add(dedupeKey);
  lastPlayedAt = now;

  const selfSpec = buildSelfAdCelebrationSpec({
    sender: parsed.sender,
    point: parsed.point,
    sessionDedupeKey: `watch_dom_${now}`,
    sourceDedupeKey: dedupeKey
  });
  const pachi = selfAdCelebrationAsPachinkoThrow(selfSpec);
  const fallbackResolve = /** @type {(rel: string) => string} */ (
    (rel) => String(rel || '')
  );
  const resolve =
    typeof ctx.resolveImageUrl === 'function'
      ? ctx.resolveImageUrl
      : fallbackResolve;

  if (pachi) {
    playWatchCelebrationRelay(
      document,
      {
        variant: 'support',
        spec: pachi,
        flyTextLines: flyTextLinesForSupportCelebration(pachi),
        pikaTier: 'hard'
      },
      resolve
    );
    return;
  }

  playWatchCelebrationRelay(
    document,
    {
      variant: 'self_action',
      spec: selfSpec,
      flyTextLines: [
        { text: selfSpec.message, motion: 'burst', color: '#fff56a', sizePx: 28 },
        { text: 'ドン！', motion: 'burst', color: '#ffb84d', sizePx: 30 },
        { text: 'ジャン！', motion: 'scroll', color: '#ff8ec8', sizePx: 26, lanePct: 48 },
        { text: '888888888', motion: 'scroll', color: '#fff56a', sizePx: 24, lanePct: 62 }
      ],
      pikaTier: 'soft'
    },
    resolve
  );
}
