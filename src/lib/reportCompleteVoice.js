// reportCompleteVoice.js
// v0.1.806: レポート(HTML/マーケ/メディアキット)の保存が【成功した直後】に、完了の合図として
//   音声を「voice-complete → voice-watch」の順で連続再生する(『完成しました』→『ゆっくりみていってね』)。
//   別プロジェクト(dns-osint-pro)で実証済みの _playVoiceSequence パターンを移植。
//
// - 前の音声が ended してから次を再生(重ならない)。失敗(error/play reject)は静かに次へ。
// - 多重再生ガード: 直近 GUARD_MS 以内の再呼び出しは無視(複数レポートの finally が重なっても二重に鳴らさない)。
// - chrome.runtime.getURL で web_accessible_resources の mp3 を解決。失敗は静かに諦める(体感を壊さない)。
//
// DOM(Audio)に依存するため再生本体は実環境でのみ動くが、ガード判定は純関数として切り出してテスト可能にする。

/** 完了音声ファイル(再生順)。manifest の web_accessible_resources と sound/ 配下に一致させること。 */
export const REPORT_COMPLETE_VOICE_PATHS = Object.freeze([
  'sound/voice-complete.mp3',
  'sound/voice-watch.mp3'
]);

/** 多重再生ガードの間隔(ms)。複数レポートを短時間に保存しても二重に鳴らさない。 */
export const REPORT_COMPLETE_VOICE_GUARD_MS = 8000;

/**
 * 多重再生ガード判定(純関数・テスト可能)。
 * @param {number} lastAtMs 直近に鳴らした時刻(ms)。未再生は 0。
 * @param {number} nowMs 現在時刻(ms)。
 * @param {number} [guardMs] ガード間隔(ms)。
 * @returns {boolean} 今回鳴らしてよいなら true(=ガードを通過)。
 */
export function shouldPlayReportCompleteVoice(lastAtMs, nowMs, guardMs = REPORT_COMPLETE_VOICE_GUARD_MS) {
  const last = Number(lastAtMs) || 0;
  const now = Number(nowMs) || 0;
  return now - last >= guardMs;
}

let _reportCompleteVoiceLastAt = 0;

/**
 * 完了音声を「voice-complete → voice-watch」の順で連続再生する。
 * 音が出なくてもレポート保存の成否には一切影響させない(全例外を握りつぶす)。
 * @param {{ nowMs?: number, audioFactory?: (url: string) => HTMLAudioElement, getUrl?: (path: string) => string }} [deps]
 *   テスト用に時刻・Audio 生成・URL 解決を差し替え可能(既定は実環境)。
 * @returns {void}
 */
export function playReportCompleteVoiceSequence(deps = {}) {
  try {
    const nowMs =
      typeof deps.nowMs === 'number' ? deps.nowMs : Date.now();
    if (!shouldPlayReportCompleteVoice(_reportCompleteVoiceLastAt, nowMs)) return;
    _reportCompleteVoiceLastAt = nowMs;

    const getUrl =
      deps.getUrl ||
      ((path) =>
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL(path)
          : path);
    const audioFactory =
      deps.audioFactory || ((url) => new Audio(url));

    /** @param {string[]} rest */
    const playNext = (rest) => {
      if (!rest.length) return;
      try {
        const audio = audioFactory(getUrl(rest[0]));
        if (audio && typeof audio.volume === 'number') audio.volume = 0.85;
        const next = () => playNext(rest.slice(1));
        audio.addEventListener('ended', next, { once: true });
        audio.addEventListener('error', next, { once: true });
        const p = audio.play && audio.play();
        if (p && typeof p.catch === 'function') p.catch(next);
      } catch {
        playNext(rest.slice(1));
      }
    };
    playNext([...REPORT_COMPLETE_VOICE_PATHS]);
  } catch {
    /* 音は出なくてもレポート保存の成否には影響させない */
  }
}

/** テスト用: 多重再生ガードの内部状態をリセットする。 */
export function _resetReportCompleteVoiceGuardForTest() {
  _reportCompleteVoiceLastAt = 0;
}
