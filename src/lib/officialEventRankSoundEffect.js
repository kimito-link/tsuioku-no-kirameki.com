// officialEventRankSoundEffect.js
// v0.1.1053: 配信者が参加中のニコニコイベント順位が上下したら効果音(rank_up/rank_down)を鳴らす。
//   liveId ごとに前回rankを持つ(配信切替で誤検知しない)。
//   会場window(venueBar.js)が開いていれば popup 側は鳴らさない(二重再生防止・会場優先)。
// popup-entry.js から src/lib へ切り出し(v0.1.1057・max-lines ラチェット対応)。挙動同値。

import { detectOfficialEventRankChange } from './officialEventRankChange.js';
import { EFFECT_SOUND_KINDS, playEffectSound, shouldSkipEffectSoundForVenuePresence } from './effectSoundPlayer.js';
import { KEY_VENUE_EFFECT_SOUND_PRESENCE } from './storageKeys.js';

/** @type {Map<string, number>} liveId → 直近の eventBanner.rank */
const _lastEventRankByLiveId = new Map();

/**
 * 会場windowが開いている(=効果音を鳴らしている)かを popup 側から見るための判定。
 * @param {{ get(keys: string): Promise<Record<string, unknown>> }} storageLocal chrome.storage.local
 */
async function shouldPopupSkipEffectSoundForVenue(storageLocal) {
  try {
    const bag = await storageLocal.get(KEY_VENUE_EFFECT_SOUND_PRESENCE);
    return shouldSkipEffectSoundForVenuePresence(Number(bag?.[KEY_VENUE_EFFECT_SOUND_PRESENCE]) || 0, Date.now());
  } catch {
    return false; // 判定不能なら鳴らす側に倒す(無音になり続けるより安全)
  }
}

/**
 * 配信者のイベント順位変動を検知し、条件が揃えば効果音を鳴らす(observe-and-play・描画は変えない)。
 * @param {string} liveId
 * @param {import('./officialEventDomBundle.js').OfficialEventDomBundle|null} bundle
 * @param {{
 *   storageLocal: { get(keys: string): Promise<Record<string, unknown>> },
 *   effectSoundEnabled: boolean,
 *   buildEffectSoundDeps?: (kind: string) => Record<string, unknown>
 * }} deps Phase A(2026-07-05): buildEffectSoundDeps を渡すとマイ効果音(カスタム優先variantPaths等)
 *   が反映される。未指定時は従来どおり playEffectSound の既定(合成音)で鳴る(後方互換)。
 */
export async function maybePlayEventRankChangeSound(liveId, bundle, deps) {
  try {
    const lid = String(liveId || '').trim().toLowerCase();
    if (!lid) return;
    const rankRaw = bundle?.eventBanner?.rank;
    const currentRank =
      typeof rankRaw === 'number' && Number.isFinite(rankRaw) && rankRaw > 0 ? Math.floor(rankRaw) : null;
    const prevRank = _lastEventRankByLiveId.has(lid) ? _lastEventRankByLiveId.get(lid) : null;
    if (currentRank != null) _lastEventRankByLiveId.set(lid, currentRank);
    if (!deps.effectSoundEnabled) return;
    const change = detectOfficialEventRankChange(prevRank, currentRank);
    if (change === 'none') return;
    if (await shouldPopupSkipEffectSoundForVenue(deps.storageLocal)) return;
    const kind = change === 'up' ? EFFECT_SOUND_KINDS.RANK_UP : EFFECT_SOUND_KINDS.RANK_DOWN;
    // buildEffectSoundDeps 未指定時は引数1個のまま呼ぶ(既存呼び出し・テストとの互換を保つ)。
    if (typeof deps.buildEffectSoundDeps === 'function') {
      playEffectSound(kind, deps.buildEffectSoundDeps(kind));
    } else {
      playEffectSound(kind);
    }
  } catch {
    /* 効果音は観測専用の付加機能。失敗してもイベント順位表示自体には影響させない */
  }
}
