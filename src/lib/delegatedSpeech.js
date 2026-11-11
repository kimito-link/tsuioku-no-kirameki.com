/**
 * delegatedSpeech.js — WAV を返さない読み上げ（棒読みちゃん・ゆかコネ・PCの声）の印。
 *
 * 合成の段階では話さない。再生の段で speak する（先読みと同時に声が重ならないようにする）。
 *
 * @module delegatedSpeech
 */

/**
 * @param {{ speak: (hooks?: { onStart?: () => void }) => Promise<boolean>, cancel?: () => void }} spec
 */
export function delegatedSpeech(spec) {
  return {
    delegated: true,
    speak: spec.speak,
    cancel: typeof spec.cancel === 'function' ? spec.cancel : () => {}
  };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDelegatedSpeech(value) {
  return !!value
    && typeof value === 'object'
    && /** @type {{ delegated?: boolean }} */ (value).delegated === true
    && typeof /** @type {{ speak?: unknown }} */ (value).speak === 'function';
}

/**
 * 外部アプリは「受け付けた」時点で HTTP が返る。鳴り終わるまで待たないと次のコメントが重なる。
 * 速く読みすぎないよう、文字数からの見積もりで間隔を空ける（実測の再生完了ではない）。
 * @param {unknown} text
 * @param {number} [speedPercent]
 * @returns {number}
 */
export function estimateSpeechHoldMs(text, speedPercent = 100) {
  const chars = String(text || '').length;
  const speed = Number(speedPercent);
  const scale = Number.isFinite(speed) && speed > 0 ? speed / 100 : 1;
  const ms = Math.round((700 + chars * 140) / scale);
  return Math.min(20000, Math.max(400, ms));
}

/**
 * @param {number} ms
 * @param {() => boolean} isAborted
 * @returns {Promise<void>}
 */
export function waitSpeechHold(ms, isAborted) {
  const step = 200;
  let left = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => {
    const tick = () => {
      if (isAborted()) { resolve(); return; }
      if (left <= 0) { resolve(); return; }
      const slice = Math.min(step, left);
      left -= slice;
      setTimeout(tick, slice);
    };
    tick();
  });
}
