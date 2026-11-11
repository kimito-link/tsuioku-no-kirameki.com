/**
 * 読み上げの計算モード。拡張が保存するのは利用者の希望だけ。
 *
 * VOICEVOX 0.26 の HTTP API は、起動中のプロセスを CPU と GPU で切り替えられない。
 * モードは起動時の --use_gpu か環境変数 VV_USE_GPU で決まり、/supported_devices は
 * 「その版が使えるか」だけを返す。/version・/engine_manifest・/setting にも今のモードは無い。
 * だからここでの CPU / GPU は希望で、エンジン自体のモードは VOICEVOX の設定で変わる。
 */

/** @param {unknown} value */
export function normalizeVoiceEnginePref(value) {
  if (value === 'gpu') return 'gpu';
  if (value === 'cpu') return 'cpu';
  return null;
}

/** 未保存のときの既定。画面でははじめから CPU が選ばれている。
 * @param {unknown} value
 */
export function voiceEnginePrefOrDefault(value) {
  return normalizeVoiceEnginePref(value) || 'cpu';
}

/**
 * 接続中の一行。actual が null のときは未接続なので空（つながっていない文言は呼び出し側）。
 * 希望と実際が違うと分かるときだけ、VOICEVOX 側で変わることを添える。勧めは書かない。
 * cpuOnly は、版が GPU を使えないと /supported_devices で分かったときだけ true。
 * @param {{ pref?: unknown, actual?: 'cpu'|'gpu'|'unknown'|null, cpuOnly?: boolean }} input
 * @returns {{ status: string, note: string }}
 */
export function voiceEngineConnectionLines(input) {
  const choice = voiceEnginePrefOrDefault(input?.pref);
  const actual = input?.actual;
  if (actual !== 'cpu' && actual !== 'gpu' && actual !== 'unknown') return { status: '', note: '' };
  if (actual === 'unknown') {
    const word = choice === 'gpu' ? 'GPU' : 'CPU';
    return { status: `VOICEVOX：${word}を選択中（今のモードは不明）`, note: '' };
  }
  if (actual === choice) {
    return { status: actual === 'gpu' ? 'VOICEVOX：GPUで接続中' : 'VOICEVOX：CPUで接続中', note: '' };
  }
  const status = actual === 'gpu'
    ? 'VOICEVOX：GPUで接続中（選択はCPU）'
    : 'VOICEVOX：CPUで接続中（選択はGPU）';
  const note = input?.cpuOnly === true
    ? 'このエンジンはGPUを使えません。計算モードはVOICEVOXの「設定」→「オプション」→「エンジンモード」で決まります'
    : '計算モードはVOICEVOXの「設定」→「オプション」→「エンジンモード」で変わります';
  return { status, note };
}

/** 状態欄に出す一文。注記があるときだけ後ろに続ける。
 * @param {{ pref?: unknown, actual?: 'cpu'|'gpu'|'unknown'|null, cpuOnly?: boolean }} input
 */
export function voiceEngineConnectionText(input) {
  const lines = voiceEngineConnectionLines(input);
  if (!lines.status) return '';
  return lines.note ? `${lines.status} ${lines.note}` : lines.status;
}
