/**
 * 会場モード(comeview)の読み上げ発話キュー診断。リアルタイム性(「たまに遅れて出る」)の
 * 真因切り分け用の純観測値を組み立てる純関数群。記録/発話には一切触れない。
 *
 * 背景: voiceReadQueue.js は混雑時の速度ブースト/先読み深さ/stale drop まで実装済みで設計は良好だが、
 * 「たまに遅れる」が起きた瞬間に【キューが詰まっているのか・古い分を捨てているのか・合成が遅いのか】を
 * 観測できないと憶測でパラメータを触ることになる。そこで comeview が保持する _voiceDiag を状態速報へ
 * 集約し、F12 不要で AI 共有できるようにする(popup 診断ブリッジと同思想)。
 *
 * @typedef {{
 *   enabled: boolean,            // 読み上げ ON か
 *   queueNow: number,            // 現在の待機件数
 *   queueMax: number,            // セッション中の最大待機件数(詰まりのピーク)
 *   spokenTotal: number,         // 発話完了数
 *   staleDropTotal: number,      // 鮮度切れで捨てた件数(リアルタイム維持のための間引き)
 *   playbackTimeoutTotal: number,// 再生 watchdog 発火数(ended/error が来ず安全網で打ち切った=異常)
 *   lastSpokenBase: number,      // 最後に発話した時刻(epoch ms・0=未発話)
 *   lastSynthMs: number,         // 直近の合成所要 ms(-1=未計測)
 *   lastDepth: number,           // 直近の先読み深さ
 *   lastSpeedBoost: number       // 直近の速度ブースト
 * }} VoiceDiagState
 */

/** 初期 voice 診断 state。 */
export function makeInitialVoiceDiag() {
  return {
    enabled: false,
    queueNow: 0,
    queueMax: 0,
    spokenTotal: 0,
    staleDropTotal: 0,
    playbackTimeoutTotal: 0,
    lastSpokenBase: 0,
    lastSynthMs: -1,
    lastDepth: 0,
    lastSpeedBoost: 0
  };
}

/**
 * storage 書き込み用の軽量スナップショット(ago は読み手側で算出するため base を渡す)。
 * @param {Partial<VoiceDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {VoiceDiagState & { capturedAt: number }}
 */
export function buildVoiceDiagSnapshot(diag, nowMs) {
  const base = makeInitialVoiceDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return {
    enabled: !!d.enabled,
    queueNow: num(d.queueNow, base.queueNow),
    queueMax: num(d.queueMax, base.queueMax),
    spokenTotal: num(d.spokenTotal, base.spokenTotal),
    staleDropTotal: num(d.staleDropTotal, base.staleDropTotal),
    playbackTimeoutTotal: num(d.playbackTimeoutTotal, base.playbackTimeoutTotal),
    lastSpokenBase: num(d.lastSpokenBase, base.lastSpokenBase),
    lastSynthMs: num(d.lastSynthMs, base.lastSynthMs),
    lastDepth: num(d.lastDepth, base.lastDepth),
    lastSpeedBoost: num(d.lastSpeedBoost, base.lastSpeedBoost),
    capturedAt: now
  };
}

/**
 * 状態速報の概要に出す1行を作る純関数。voice が一度も動いていない(未取得)なら ''。
 * 「たまに遅れる」を一目で掴めるよう、待機ピーク・間引き・最終発話からの経過を出す。
 *
 * @param {(VoiceDiagState & { capturedAt?: number })|null|undefined} snap
 * @param {number} nowMs 現在時刻(最終発話 ago の算出用)
 * @returns {string}
 */
export function buildVoiceDiagLine(snap, nowMs) {
  if (!snap || typeof snap !== 'object') return '';
  const enabled = !!snap.enabled;
  const spoken = Number(snap.spokenTotal) || 0;
  const queueNow = Number(snap.queueNow) || 0;
  const queueMax = Number(snap.queueMax) || 0;
  const drop = Number(snap.staleDropTotal) || 0;
  // 一度も ON にも発話にもなっていない=会場モード未使用=ノイズにしない。
  if (!enabled && spoken === 0 && queueMax === 0) return '';
  const parts = [];
  parts.push(enabled ? '読み上げ:ON' : '読み上げ:OFF');
  parts.push(`待機${queueNow}(最大${queueMax})`);
  if (drop > 0) parts.push(`間引き${drop}件`); // リアルタイム維持で古い分を捨てた回数=遅延の傍証。
  // 再生 watchdog 発火=ended/error が来ず固着しかけた異常。出たら必ず見せる(本物の固着の傍証)。
  const pbTimeout = Number(snap.playbackTimeoutTotal) || 0;
  if (pbTimeout > 0) parts.push(`再生TO${pbTimeout}件`);
  const base = Number(snap.lastSpokenBase) || 0;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  if (base > 0 && now > 0) {
    parts.push(`最終発話${Math.max(0, Math.round((now - base) / 1000))}秒前`);
  }
  const synth = Number(snap.lastSynthMs);
  if (Number.isFinite(synth) && synth >= 0) parts.push(`合成${synth}ms`);
  return `会場読み上げ: ${parts.join(' / ')}`;
}
