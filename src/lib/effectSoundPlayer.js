// effectSoundPlayer.js
// ギフト/広告/応援者ランキング順位変動に鳴らす短い効果音の再生ロジック(純関数+再生本体)。
//   reportCompleteVoice.js(完了音声の連続再生)と同じ設計を踏襲: chrome.runtime.getURL で
//   web_accessible_resources の mp3 を解決し、new Audio で再生。失敗は静かに諦める(体感を壊さない)。
//
// ★会場window(venueBar.js)とpopup(popup-entry.js)は別プロセスで同じギフト/広告イベントを検知しうるため、
//   両方で音が鳴ると二重再生になる。会場を優先し、popup側は会場のプレゼンス(KEY_VENUE_EFFECT_SOUND_PRESENCE)
//   が新鮮なら鳴らさない(shouldSkipEffectSoundForVenuePresence)。

/** @typedef {'gift'|'ad'|'rank_up'|'rank_down'|'milestone_soft'|'milestone_hard'|'milestone_jackpot'} EffectSoundKind */

/** 効果音の種類(ファイル名は呼び出し側がユーザー用意のmp3を extension/sound/ に置いて渡す)。 */
export const EFFECT_SOUND_KINDS = Object.freeze({
  GIFT: 'gift',
  AD: 'ad',
  RANK_UP: 'rank_up',
  RANK_DOWN: 'rank_down',
  // v0.1.1054: コメント数マイルストーン(パチンコ演出)。節目の大きさで3段階(Fable設計)。
  MILESTONE_SOFT: 'milestone_soft', // 100/200件
  MILESTONE_HARD: 'milestone_hard', // 500件
  MILESTONE_JACKPOT: 'milestone_jackpot' // 1000件以上(大当たり)
});

/** 種類ごとの既定ファイルパス(manifest の web_accessible_resources に一致させること)。 */
export const EFFECT_SOUND_PATHS = Object.freeze({
  [EFFECT_SOUND_KINDS.GIFT]: 'sound/effect-gift.mp3',
  [EFFECT_SOUND_KINDS.AD]: 'sound/effect-ad.mp3',
  [EFFECT_SOUND_KINDS.RANK_UP]: 'sound/effect-rank-up.mp3',
  [EFFECT_SOUND_KINDS.RANK_DOWN]: 'sound/effect-rank-down.mp3',
  [EFFECT_SOUND_KINDS.MILESTONE_SOFT]: 'sound/effect-milestone-soft.mp3',
  [EFFECT_SOUND_KINDS.MILESTONE_HARD]: 'sound/effect-milestone-hard.mp3',
  [EFFECT_SOUND_KINDS.MILESTONE_JACKPOT]: 'sound/effect-milestone-jackpot.mp3'
});

/** 同じ種類の効果音を連打しないための多重再生ガード間隔(ms)。 */
export const EFFECT_SOUND_GUARD_MS = 600;

/**
 * 多重再生ガード判定(純関数・テスト可能)。reportCompleteVoice.js と同じ形。
 * @param {number} lastAtMs 直近にこの種類を鳴らした時刻(ms)。未再生は 0。
 * @param {number} nowMs 現在時刻(ms)。
 * @param {number} [guardMs]
 * @returns {boolean} 今回鳴らしてよいなら true。
 */
export function shouldPlayEffectSound(lastAtMs, nowMs, guardMs = EFFECT_SOUND_GUARD_MS) {
  const last = Number(lastAtMs) || 0;
  const now = Number(nowMs) || 0;
  return now - last >= guardMs;
}

/**
 * 会場window優先の二重再生ガード(純関数)。会場のプレゼンスが十分新しければ popup 側は鳴らさない。
 * @param {number} venuePresenceAtMs 会場が最後にプレゼンスを書いた時刻(epoch ms)。0/未取得=会場は開いていない扱い。
 * @param {number} nowMs 現在時刻(ms)。
 * @param {number} [freshMs] 開いているとみなす新鮮さの窓(ms)。会場は3秒間隔で書くため、取りこぼしに余裕を持たせる。
 * @returns {boolean} true=popup側はスキップすべき(会場が鳴らす)。
 */
export function shouldSkipEffectSoundForVenuePresence(venuePresenceAtMs, nowMs, freshMs = 8000) {
  const at = Number(venuePresenceAtMs) || 0;
  if (at <= 0) return false;
  const now = Number(nowMs) || 0;
  return now - at < freshMs;
}

/** 種類ごとの最終再生時刻(モジュールスコープ・呼び出し元1個につき1インスタンスの前提)。 */
const _lastPlayedAt = Object.create(null);

/**
 * 効果音を1つ再生する。存在しない種類・ガード未通過・再生失敗は全て静かに no-op。
 * @param {string} kind EFFECT_SOUND_KINDS のいずれか
 * @param {{
 *   nowMs?: number,
 *   volume?: number,
 *   audioFactory?: (url: string) => HTMLAudioElement,
 *   getUrl?: (path: string) => string,
 *   guardMs?: number,
 *   paths?: Record<string, string>
 * }} [deps] テスト用に時刻・Audio 生成・URL 解決・ファイルパスを差し替え可能(既定は実環境)。
 * @returns {void}
 */
export function playEffectSound(kind, deps = {}) {
  try {
    const paths = /** @type {Record<string, string>} */ (deps.paths || EFFECT_SOUND_PATHS);
    const path = paths[String(kind)];
    if (!path) return;

    const nowMs = typeof deps.nowMs === 'number' ? deps.nowMs : Date.now();
    const guardMs = typeof deps.guardMs === 'number' ? deps.guardMs : EFFECT_SOUND_GUARD_MS;
    if (!shouldPlayEffectSound(_lastPlayedAt[kind] || 0, nowMs, guardMs)) return;
    _lastPlayedAt[kind] = nowMs;

    const getUrl =
      deps.getUrl ||
      ((p) =>
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL(p)
          : p);
    const audioFactory = deps.audioFactory || ((url) => new Audio(url));
    const volume = typeof deps.volume === 'number' ? Math.max(0, Math.min(1, deps.volume)) : 0.7;

    const audio = audioFactory(getUrl(path));
    if (audio && typeof audio.volume === 'number') audio.volume = volume;
    const p = audio.play && audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* 再生失敗は静かに諦める */ });
  } catch {
    /* 音は出なくても本来の機能(ギフト演出/ランキング表示)には一切影響させない */
  }
}

/** テスト用: 多重再生ガードの内部状態をリセットする。 */
export function _resetEffectSoundGuardForTest() {
  for (const k of Object.keys(_lastPlayedAt)) delete _lastPlayedAt[k];
}
