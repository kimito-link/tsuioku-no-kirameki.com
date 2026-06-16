/**
 * venueBubbleLifecycle.js — 吹き出しの寿命を「読み上げ(TTS)」に連動させる純関数群。
 *
 * 会議(2026-06-16・正本 reference_bubble_hold_until_tts_meeting_2026-06-16.md)の収束案:
 *  「声がまだ喋っているのに対応する吹き出しが先に消える」をゼロにする。ただし速い配信で
 *  画面が埋まらないよう、リアルタイム性と見やすさを両立する。
 *
 * 状態:
 *  - pending:  合成待ち/まだ音声と連動していない。従来の流速寿命で消える(即時性を担保)。
 *  - speaking: 実際に音声再生が始まった(onAudioStart)。再生終了まで【消さない】。
 *  - done:     再生終了(onAudioEnd)。余韻(AFTERGLOW)を置いてから消す。
 *  - unvoiced: 鮮度ゲートで破棄/合成失敗/VOICEVOX 無し/読み上げOFF など「もう/まだ鳴らない」。
 *              従来の流速寿命のまま(=普通に消える・永遠に残さない)。
 * @typedef {'pending'|'speaking'|'done'|'unvoiced'} BubbleVoiceState
 */

/** 再生終了後に吹き出しを残す余韻(ms)。声が切れた瞬間に消えると不自然なので少し残す。 */
export const BUBBLE_VOICE_AFTERGLOW_MS = 500;

/**
 * 読み上げONのとき、pending(合成待ち)の吹き出しを最低これだけは残す床(ms)。
 * 合成→再生開始までの遅れで「声が鳴り始める前に吹き出しが流速寿命で消える」隙間を塞ぐ。
 * voiceAgeGate の通常しきい値(VOICE_STALE_MS_NORMAL)に合わせる: それより遅い音声はそもそも
 *  stale で鳴らない=鳴る音声なら必ずこの床の内側で onAudioStart が来て speaking に切り替わる。
 * v0.1.773: 鮮度ゲート短縮(2500→1800ms)に追従して床も 1800ms へ(鳴らない声を待ち続けない)。
 */
export const BUBBLE_PENDING_VOICE_FLOOR_MS = 1800;

/**
 * 表示直後(pending)の寿命を返す純関数。読み上げONなら合成遅れに備えて床を効かせる。
 * @param {number} flowLifetimeMs 流速可変の基準寿命
 * @param {boolean} voiceEnabled  読み上げが有効か
 * @returns {number}
 */
export function resolvePendingLifetimeMs(flowLifetimeMs, voiceEnabled) {
  const flow = typeof flowLifetimeMs === 'number' && flowLifetimeMs > 0 ? flowLifetimeMs : 0;
  if (!voiceEnabled) return flow;
  return Math.max(flow, BUBBLE_PENDING_VOICE_FLOOR_MS);
}

/**
 * 声に連動した吹き出しが枠を占有し続けないための安全上限(ms)。
 * 極端に長い読み上げ(長文/連結)が speaking のまま居座って新着を締め出すのを防ぐ。
 * これを超えたら speaking でも done 同様に畳んでよい(会議の滞留対策D)。
 */
export const BUBBLE_VOICE_SPEAKING_CAP_MS = 12_000;

/**
 * 音声イベントを受けたときの次の状態を返す純関数。
 * 不正遷移は現状維持(冪等)。done/unvoiced は終端で、後から start が来ても巻き戻さない
 *  (再生が終わった/見送られた吹き出しを音声イベントの取りこぼしで蘇らせない)。
 *
 * @param {string} current  現在の BubbleVoiceState
 * @param {'audioStart'|'audioEnd'|'resolved'} event
 *   audioStart: 実際に audio.play() が走った / audioEnd: 再生が終わった(ended/error/stop) /
 *   resolved:   再生されずに item が消費された(stale/合成失敗/OFF 等)=「鳴らなかった」
 * @returns {BubbleVoiceState}
 */
export function nextBubbleVoiceState(current, event) {
  const state = current === 'speaking' || current === 'done' || current === 'unvoiced' ? current : 'pending';
  if (event === 'audioStart') {
    // pending からのみ speaking へ。done/unvoiced は終端で蘇らせない。
    return state === 'pending' ? 'speaking' : state;
  }
  if (event === 'audioEnd') {
    // 鳴っていたものが終わった → done。pending のまま end が来た(start 取りこぼし)場合も done 扱い
    //   (声は鳴り終わっている=もう待つ必要がない)。unvoiced/done は維持。
    if (state === 'speaking' || state === 'pending') return 'done';
    return state;
  }
  if (event === 'resolved') {
    // 鳴らずに消費された。speaking 中(=実際は鳴っていた)なら end 待ちを壊さないため維持。
    //   pending のままなら「鳴らなかった」= unvoiced(従来の流速寿命で普通に消す)。
    return state === 'pending' ? 'unvoiced' : state;
  }
  return state;
}

/**
 * 状態に応じて吹き出しを「今この瞬間に時間切れで消してよいか」を判定する純関数。
 * speaking は原則 false(消さない)。ただし SPEAKING_CAP を超えたら true(滞留対策)。
 *
 * @param {string} state            BubbleVoiceState
 * @param {number} ageMs            吹き出し表示からの経過(ms)
 * @param {number} flowLifetimeMs   従来の流速可変寿命(ms)
 * @param {number} [speakingAgeMs]  speaking になってからの経過(ms)。speaking 判定に使う
 * @returns {boolean} true=時間切れで消してよい
 */
export function isBubbleExpiredByVoice(state, ageMs, flowLifetimeMs, speakingAgeMs = 0) {
  const age = typeof ageMs === 'number' && ageMs >= 0 ? ageMs : 0;
  const flow = typeof flowLifetimeMs === 'number' && flowLifetimeMs > 0 ? flowLifetimeMs : 0;
  if (state === 'speaking') {
    // 鳴っている間は消さない。ただし安全上限を超えたら畳む(極端に長い読み上げの枠占有防止)。
    const spk = typeof speakingAgeMs === 'number' && speakingAgeMs >= 0 ? speakingAgeMs : 0;
    return spk >= BUBBLE_VOICE_SPEAKING_CAP_MS;
  }
  if (state === 'done') {
    // 再生終了 + 余韻ぶんだけ残す。
    return age >= flow + BUBBLE_VOICE_AFTERGLOW_MS;
  }
  // pending / unvoiced は従来の流速寿命のまま。
  return age >= flow;
}

/**
 * 同時表示が上限を超えたとき、どの吹き出しから消すかの優先度スコア。
 * 小さいほど先に消す。会議の優先順位: unvoiced/pending(古い順) → done → speaking(発言が古い順)。
 * 「鳴っている吹き出しは最後まで残す」を構造化する。
 *
 * @param {{ voiceState?: string, createdAt?: number }} bubble
 * @param {number} now
 * @returns {number} 削除候補スコア(昇順=先に消す)
 */
export function bubbleEvictionScore(bubble, now) {
  const state = bubble && typeof bubble.voiceState === 'string' ? bubble.voiceState : 'pending';
  const createdAt = bubble && typeof bubble.createdAt === 'number' ? bubble.createdAt : now;
  const age = Math.max(0, now - createdAt); // 古いほど age 大
  // 状態のランク(残したい順=大きいほど残す): speaking > done > pending > unvoiced
  let rank;
  if (state === 'speaking') rank = 3;
  else if (state === 'done') rank = 2;
  else if (state === 'pending') rank = 1;
  else rank = 0; // unvoiced
  // スコア = rank を主キーに、同ランクでは「古いものを先に消す」= age が大きいほど小さいスコア。
  //   rank を大きく離して桁衝突を防ぐ。age は十分大きい配信でも 1e9 未満想定だが clamp する。
  const ageComponent = Math.min(age, 1e9);
  return rank * 1e10 - ageComponent;
}

/**
 * 上限超過時に消すべき吹き出しを、消す順(先頭=最初に消す)に並べて返す純関数。
 * @template {{ voiceState?: string, createdAt?: number }} T
 * @param {T[]} bubbles
 * @param {number} max  同時表示上限(BUBBLE_MAX)
 * @param {number} now
 * @returns {T[]} 消す対象(超過ぶん)
 */
export function selectBubblesToEvict(bubbles, max, now) {
  const list = Array.isArray(bubbles) ? bubbles.slice() : [];
  const limit = typeof max === 'number' && max > 0 ? max : 0;
  if (list.length <= limit) return [];
  const sorted = list
    .map((b) => ({ b, score: bubbleEvictionScore(b, now) }))
    .sort((a, b) => a.score - b.score); // 昇順=先に消す
  const evictCount = list.length - limit;
  return sorted.slice(0, evictCount).map((x) => x.b);
}
