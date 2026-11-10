/**
 * 会場の吹き出しを「声が始まる時」に出すかどうか(v0.1.1979・2026-11-10 りんく決定「声と一緒に出す」)。
 *
 * ★経緯: 吹き出しはコメントが届いた瞬間に出し、声は VOICEVOX が作り終えてから鳴る。遅い PC(CPU で声を作る)では
 *   声が約6秒遅れ、吹き出しと声が別のコメントを指していた(りんく実機・YouTube・0.1.1978)。
 *   → 読むコメントの吹き出しは、声が鳴り始めた時に出す。VENUE_BUBBLE_VOICE_HOLD_MS(3秒)待っても始まらなければ、
 *     まだ声づくりを頼んでいない件は読まずに吹き出しだけ出す(声づくりの途中の件は、吹き出しを先に出して声を待つ)。
 *
 * ★吹き出しを声に頼らせない決まり(v0.1.757)は守る: 声が最近ちゃんと鳴った実績があるときだけ待つ。
 *   VOICEVOX が無い・止まっている・しばらく鳴っていないときは、今までどおりコメントが届いた瞬間に出す。
 */

/** 声を待つ上限(ms) */
export const VENUE_BUBBLE_VOICE_HOLD_MS = 3000;
/** 「声が最近鳴った」とみなす長さ(ms) */
export const VENUE_BUBBLE_VOICE_RECENT_MS = 60000;

/**
 * @param {{ voiceEnabled?: boolean, lastAudioStartAt?: number, now?: number, primeBurst?: boolean }} s
 *   lastAudioStartAt = 会場で声が最後に鳴り始めた時刻(0 = まだ鳴っていない) / primeBurst = 開いた直後のまとめ届き
 * @returns {boolean} true = 吹き出しを声が始まるまで待たせる
 */
export function shouldHoldBubbleForVoice(s) {
  if (s?.voiceEnabled !== true || s?.primeBurst === true) return false;
  const last = Number(s?.lastAudioStartAt) || 0;
  const now = Number(s?.now) || 0;
  if (last <= 0 || now < last) return false;
  return now - last < VENUE_BUBBLE_VOICE_RECENT_MS;
}
