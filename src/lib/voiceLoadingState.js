/**
 * voiceLoadingState.js — VOICEVOX 起動待ちのローディング表示を決める純関数群。
 *
 * 会議(2026-06-16・正本 reference_voice_loading_delight_meeting_2026-06-16.md)の収束案:
 *  - 一瞬成功(<約150ms)のときは演出を出さない(遅延ガード)=チラつき防止。
 *  - 会場(venue)とコメビュ(comeview)で別文言だが、出し分けロジックは共通。
 *  - 失敗時は楽しさを引っ込めて起動案内に切り替える。
 *
 * 実体: 読み上げONで isVoicevoxAlive() を叩く。生きてれば即(<100ms)成功・空に。
 *   起動直後/MV3 SW コールド時は数秒かかる or タイムアウト。終了時刻は予測不能なので
 *   「何%」は出せない=期待感の演出と遅延ガードで対応する。
 */

/** この時間(ms)より早く ready になったら演出を一切描かない(チラつき防止)。 */
export const VOICE_LOADING_FLICKER_GUARD_MS = 180;

/**
 * ローディングの状態。
 *  - checking:   生存確認の1回目(まだ一瞬で終わるかもしれない=遅延ガード対象)
 *  - connecting: 1回目が空振りし再試行中(もう一瞬では終わらない=即演出してよい)
 *  - ready:      成功。演出を消して空にする
 *  - notfound:   見つからない。楽しさを引っ込め起動案内に切り替える
 *  - idle:       何もしていない(初期/OFF)
 * @typedef {'idle'|'checking'|'connecting'|'ready'|'notfound'} VoiceLoadingState
 */

/**
 * 今この瞬間、ローディング演出を画面に描くべきか。
 *
 * - checking は遅延ガード: 経過時間が FLICKER_GUARD_MS 未満なら描かない(一瞬成功でチラつかせない)。
 * - connecting は再試行中=もう一瞬では終わらないので、経過時間に関わらず即描く。
 * - ready / idle / notfound は「楽しい演出」は描かない(notfound は別途エラー表示)。
 *
 * @param {string} state  VoiceLoadingState のいずれか
 * @param {number} elapsedMs  そのローディングを開始してからの経過ミリ秒
 * @returns {boolean}
 */
export function shouldRenderLoading(state, elapsedMs) {
  if (state === 'connecting') return true;
  if (state !== 'checking') return false;
  const e = typeof elapsedMs === 'number' && elapsedMs >= 0 ? elapsedMs : 0;
  return e >= VOICE_LOADING_FLICKER_GUARD_MS;
}

/**
 * 状態と画面種別から、表示すべき文言と種別(演出 or エラー or 空)を返す。
 * 文言だけを返し、アニメーション/CSS は呼び出し側(DOM)が class で当てる。
 *
 * @param {string} state  VoiceLoadingState のいずれか
 * @param {'venue'|'comeview'} surface
 * @returns {{ kind: 'hidden'|'loading'|'error', text: string }}
 *   kind=hidden: 何も出さない(空) / loading: 楽しい演出 / error: 起動案内
 */
export function resolveVoiceLoadingView(state, surface) {
  if (state === 'ready' || state === 'idle') return { kind: 'hidden', text: '' };

  if (state === 'notfound') {
    // 失敗は両画面共通で行動喚起(楽しさは引っ込める)。
    return {
      kind: 'error',
      text: 'VOICEVOXが見つかりません(起動して読み上げを押し直してください)'
    };
  }

  // checking / connecting = ローディング演出。connecting は「数秒かかる」兆候を添える。
  const connecting = state === 'connecting';
  if (surface === 'venue') {
    return {
      kind: 'loading',
      text: connecting ? '🎤 ステージ準備中…(起動直後は数秒かかります)' : '🎤 まもなく開演…声の準備中'
    };
  }
  // comeview = 実況の準備(マイクチェック)。
  return {
    kind: 'loading',
    text: connecting ? '🎤 接続中…(起動直後は数秒かかります)' : '🎤 マイクチェック中…'
  };
}
