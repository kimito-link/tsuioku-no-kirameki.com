/** マイク確認でサンプルする時間（ms） */
export const VOICE_MIC_PROBE_MS = 1000;

/** 周波数バンのピークがこれ未満なら「音が検出できません」 */
export const VOICE_MIC_LEVEL_THRESHOLD = 6;

/**
 * @param {string} deviceId 空なら既定マイク
 * @returns {MediaStreamConstraints}
 */
export function audioConstraintsForDevice(deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) {
    return { audio: true };
  }
  return { audio: { deviceId: { ideal: id } } };
}

/**
 * マイクから音が入っているかざっくり検査（ユーザーに短く話してもらう想定）
 * @param {MediaStreamConstraints} constraints
 * @param {number} [sampleMs]
 * @returns {Promise<{ ok: boolean, peak: number, error?: string }>}
 */
export async function probeMicrophoneLevel(constraints, sampleMs = VOICE_MIC_PROBE_MS) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch {
    return {
      ok: false,
      peak: 0,
      error: 'マイクに接続できません。許可・デバイス選択を確認してください。'
    };
  }
  /** @type {AudioContext|null} */
  let ctx = null;
  try {
    const AC =
      window.AudioContext ||
      /** @type {typeof window & { webkitAudioContext?: typeof AudioContext }} */ (window)
        .webkitAudioContext;
    if (typeof AC !== 'function') {
      return { ok: true, peak: 255, error: undefined };
    }
    ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let peak = 0;
    const end = Date.now() + sampleMs;
    while (Date.now() < end) {
      analyser.getByteFrequencyData(buf);
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] > peak) peak = buf[i];
      }
      await new Promise((r) => {
        requestAnimationFrame(r);
      });
    }
    const ok = peak >= VOICE_MIC_LEVEL_THRESHOLD;
    return {
      ok,
      peak,
      error: ok
        ? undefined
        : '音が検出できませんでした。マイク音量を上げるか、別の端末を選んでください。'
    };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    if (ctx) {
      await ctx.close().catch(() => {});
    }
  }
}
