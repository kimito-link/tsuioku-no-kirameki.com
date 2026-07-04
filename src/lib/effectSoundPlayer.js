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

/**
 * v0.1.1059(パチンコ台的バリエーション): 種類ごとに複数バリエーションを持つ場合の候補一覧。
 *   ユーザー要望「1つだけじゃなくパチンコみたいにたくさん欲しい」への対応。同じイベントでも
 *   毎回違う音が鳴るよう、ここに列挙したファイルからランダムに1本を選んで再生する。
 *   ここに載っていない種類(gift/ad/rank_up/rank_down)は従来どおり EFFECT_SOUND_PATHS の
 *   単一ファイルにフォールバックする(後方互換・破壊的変更なし)。
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const EFFECT_SOUND_VARIANT_PATHS = Object.freeze({
  [EFFECT_SOUND_KINDS.MILESTONE_SOFT]: Object.freeze([
    'sound/tiers/milestone-soft-1.mp3',
    'sound/tiers/milestone-soft-2.mp3',
    'sound/tiers/milestone-soft-3.mp3'
  ]),
  [EFFECT_SOUND_KINDS.MILESTONE_HARD]: Object.freeze([
    'sound/tiers/milestone-hard-1.mp3',
    'sound/tiers/milestone-hard-2.mp3',
    'sound/tiers/milestone-hard-3.mp3'
  ]),
  [EFFECT_SOUND_KINDS.MILESTONE_JACKPOT]: Object.freeze([
    'sound/tiers/milestone-jackpot-1.mp3',
    'sound/tiers/milestone-jackpot-2.mp3',
    'sound/tiers/milestone-jackpot-3.mp3'
  ]),
  // v0.1.1059: ギフト金額帯別バリエーション(既存の単一 gift 種別とは別に、point 帯を
  //   意識する呼び出し元が使える追加の種類。giftThrowProjectile.js の tier(small/medium/large/mega)
  //   と対応させる想定・呼び出し元の配線は別実装で行う)。
  gift_small: Object.freeze(['sound/tiers/gift-small-1.mp3', 'sound/tiers/gift-small-2.mp3', 'sound/tiers/gift-small-3.mp3']),
  gift_medium: Object.freeze(['sound/tiers/gift-medium-1.mp3', 'sound/tiers/gift-medium-2.mp3', 'sound/tiers/gift-medium-3.mp3']),
  gift_large: Object.freeze(['sound/tiers/gift-large-1.mp3', 'sound/tiers/gift-large-2.mp3', 'sound/tiers/gift-large-3.mp3']),
  gift_mega: Object.freeze(['sound/tiers/gift-mega-1.mp3', 'sound/tiers/gift-mega-2.mp3', 'sound/tiers/gift-mega-3.mp3']),
  reach: Object.freeze(['sound/tiers/reach-1.mp3', 'sound/tiers/reach-2.mp3'])
});

/**
 * v0.1.1059: ギフトの金額帯(giftThrowProjectile.js の tier)を、対応する効果音バリエーション
 *   カテゴリのキーに変換する純関数。tier が不明/未対応なら既定の 'gift'(単一ファイル)を返す。
 * @param {string|undefined|null} tier 'small'|'medium'|'large'|'mega'
 * @returns {string}
 */
export function effectSoundKindForGiftTier(tier) {
  switch (tier) {
    case 'small': return 'gift_small';
    case 'medium': return 'gift_medium';
    case 'large': return 'gift_large';
    case 'mega': return 'gift_mega';
    default: return EFFECT_SOUND_KINDS.GIFT;
  }
}

/**
 * 種類に対応するバリエーション一覧からランダムに1本のパスを選ぶ純関数(テスト用に rng を注入可能)。
 * バリエーションが無い種類は EFFECT_SOUND_PATHS の単一パスにフォールバックする。
 * @param {string} kind
 * @param {{ variantPaths?: Readonly<Record<string, ReadonlyArray<string>>>, paths?: Record<string, string>, rng?: () => number }} [deps]
 * @returns {string|undefined}
 */
export function resolveEffectSoundPath(kind, deps = {}) {
  const variantPaths = /** @type {Record<string, ReadonlyArray<string>>} */ (deps.variantPaths || EFFECT_SOUND_VARIANT_PATHS);
  const variants = variantPaths[String(kind)];
  if (Array.isArray(variants) && variants.length > 0) {
    const rng = typeof deps.rng === 'function' ? deps.rng : Math.random;
    const idx = Math.floor(rng() * variants.length) % variants.length;
    return variants[idx];
  }
  const paths = /** @type {Record<string, string>} */ (deps.paths || EFFECT_SOUND_PATHS);
  return paths[String(kind)];
}

/** 同じ種類の効果音を連打しないための多重再生ガード間隔(ms)。 */
export const EFFECT_SOUND_GUARD_MS = 600;

/** 既定の再生音量。 */
export const EFFECT_SOUND_DEFAULT_VOLUME = 0.7;

/**
 * v0.1.1061: 種類ごとの既定音量。ギフト系は実試聴で「しょぼすぎてよくわからない」
 *   (配信音声の下に埋もれる)ため 1.0。その他は従来どおり 0.7。
 * @param {string} kind
 * @returns {number}
 */
export function defaultVolumeForEffectSoundKind(kind) {
  return String(kind || '').startsWith('gift') ? 1.0 : EFFECT_SOUND_DEFAULT_VOLUME;
}

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
 * v0.1.1061: 実環境用の Audio 要素キャッシュ(path→要素)。従来は再生のたびに new Audio を
 *   作り捨てており、ギフトのバースト時にデコードと生成が積み上がって重さ・出音の遅れの一因に
 *   なっていた。同じファイルは1要素を使い回す(再生中に再要求されたら頭出し=置換思想)。
 *   テストで audioFactory を注入した場合はキャッシュを通らない(テスト間の状態漏れ防止)。
 */
const _audioCache = new Map();
const AUDIO_CACHE_MAX = 48; // 全効果音ファイル数(現在30前後)より十分大きい安全弁

/** @param {string} url @returns {HTMLAudioElement} */
function cachedAudioFactory(url) {
  const cached = _audioCache.get(url);
  if (cached) {
    try { cached.currentTime = 0; } catch { /* 未ロード時などは無視 */ }
    return cached;
  }
  const audio = new Audio(url);
  if (_audioCache.size < AUDIO_CACHE_MAX) _audioCache.set(url, audio);
  return audio;
}

/**
 * 効果音を1つ再生する。存在しない種類・ガード未通過・再生失敗は全て静かに no-op。
 * @param {string} kind EFFECT_SOUND_KINDS のいずれか(またはEFFECT_SOUND_VARIANT_PATHSのキー)
 * @param {{
 *   nowMs?: number,
 *   volume?: number,
 *   audioFactory?: (url: string) => HTMLAudioElement,
 *   getUrl?: (path: string) => string,
 *   guardMs?: number,
 *   paths?: Record<string, string>,
 *   variantPaths?: Record<string, string[]>,
 *   rng?: () => number
 * }} [deps] テスト用に時刻・Audio 生成・URL 解決・ファイルパス・乱数を差し替え可能(既定は実環境)。
 * @returns {'played'|'guarded'|'no-path'|'error'} 実際に鳴らしたか(v0.1.1061: 呼び出し元が
 *   「試みた」でなく「鳴らした」を数えられるように=診断が嘘をつかないための戻り値)。
 */
export function playEffectSound(kind, deps = {}) {
  try {
    // v0.1.1059: バリエーションがある種類はランダムに1本選ぶ(パチンコ台的に毎回違う音)。
    //   無い種類は従来どおり EFFECT_SOUND_PATHS の単一パス(後方互換)。
    const path = resolveEffectSoundPath(kind, deps);
    if (!path) return 'no-path';

    const nowMs = typeof deps.nowMs === 'number' ? deps.nowMs : Date.now();
    const guardMs = typeof deps.guardMs === 'number' ? deps.guardMs : EFFECT_SOUND_GUARD_MS;
    if (!shouldPlayEffectSound(_lastPlayedAt[kind] || 0, nowMs, guardMs)) return 'guarded';
    _lastPlayedAt[kind] = nowMs;

    const getUrl =
      deps.getUrl ||
      ((p) =>
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL(p)
          : p);
    // v0.1.1061: 実環境は Audio をキャッシュして使い回す(作り捨てによる重さ/遅れの解消)。
    const audioFactory = deps.audioFactory || cachedAudioFactory;
    const volume =
      typeof deps.volume === 'number'
        ? Math.max(0, Math.min(1, deps.volume))
        : defaultVolumeForEffectSoundKind(kind);

    const audio = audioFactory(getUrl(path));
    if (audio && typeof audio.volume === 'number') audio.volume = volume;
    const p = audio.play && audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* 再生失敗は静かに諦める */ });
    return 'played';
  } catch {
    /* 音は出なくても本来の機能(ギフト演出/ランキング表示)には一切影響させない */
    return 'error';
  }
}

/** テスト用: 多重再生ガードの内部状態をリセットする。 */
export function _resetEffectSoundGuardForTest() {
  for (const k of Object.keys(_lastPlayedAt)) delete _lastPlayedAt[k];
}
