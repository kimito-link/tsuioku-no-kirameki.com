/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】YouTube の会場の読み上げで「同じコメントをもう一度読んだ」「古いコメントを読んだ」を数える計器
 * 【この箱に入らないもの】storage / DOM / chrome.*(書き込みは呼び出し側 venue-inline-entry.js)
 * 【書けるstorageキー】なし(呼び出し側が yt_diag_voice_reads に書く)
 *
 * 2026-11-12 りんく「youtubeが最新の読み上げをどんどんよまず過去の発言を何回も読んでいます」。
 *   一時プロファイル(偽の VOICEVOX)では本物の YouTube でも再現しなかったので、普段の状態で起きた瞬間を残す。
 *   挙動は変えない(観測のみ)。
 */

/** 同じ文をもう一度読んだとみなす間隔 */
export const YT_VOICE_SAME_TEXT_WINDOW_MS = 10 * 60 * 1000;
/** 受け取ってからこれ以上たってから列に入ったコメントは「古い」 */
export const YT_VOICE_OLD_MS = 60 * 1000;
const KEEP_KEYS = 3000;
const RING = 40;
const EXAMPLES = 15;

/**
 * @param {{ now?: () => number }} [deps]
 */
export function createYtVoiceReadLog(deps = {}) {
  const now = deps.now || (() => Date.now());
  /** @type {Map<string, number>} キー → 列に入った回数 */
  const queuedKeys = new Map();
  /** @type {Map<string, number>} キー → 鳴った回数 */
  const playedKeys = new Map();
  /** @type {Map<string, { at: number, key: string }>} 文 → 最後に鳴った時刻とキー */
  const playedText = new Map();
  const c = { queued: 0, skipped: 0, played: 0, playedLight: 0, sameKeyQueued: 0, sameKeyPlayed: 0, sameTextPlayed: 0, oldQueued: 0, oldPlayed: 0, maxAgeMs: 0 };
  /** @type {any[]} */
  let recent = [];
  /** @type {any[]} */
  let examples = [];
  const trim = (/** @type {Map<string, any>} */ m) => {
    if (m.size <= KEEP_KEYS) return;
    const drop = m.size - KEEP_KEYS;
    let i = 0;
    for (const k of m.keys()) {
      if (i++ >= drop) break;
      m.delete(k);
    }
  };
  const short = (/** @type {unknown} */ t) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  /** @param {any} ev */
  const push = (ev) => {
    recent = [...recent, ev].slice(-RING);
    if (ev.flags.length) examples = [...examples, ev].slice(-EXAMPLES);
  };
  return {
    /**
     * 読み上げの列に来た1件(混雑で読まずに外した件も)。
     * @param {{ key?: unknown, text?: unknown, receivedAt?: unknown, skipped?: boolean, path?: unknown }} it
     */
    noteQueued(it) {
      const at = now();
      const key = String(it?.key ?? '');
      const rec = Number(it?.receivedAt) > 0 ? Number(it.receivedAt) : 0;
      const ageMs = rec > 0 ? Math.max(0, at - rec) : -1;
      /** @type {string[]} */
      const flags = [];
      if (key) {
        const n = queuedKeys.get(key) || 0;
        if (n > 0) { c.sameKeyQueued += 1; flags.push('sameKey'); }
        queuedKeys.delete(key);
        queuedKeys.set(key, n + 1);
        trim(queuedKeys);
      }
      if (ageMs >= YT_VOICE_OLD_MS) { c.oldQueued += 1; flags.push('old'); }
      if (ageMs > c.maxAgeMs) c.maxAgeMs = ageMs;
      if (it?.skipped) c.skipped += 1;
      else c.queued += 1;
      push({ at, ev: it?.skipped ? 'skip' : 'queue', key, text: short(it?.text), ageMs, path: String(it?.path ?? ''), flags });
      return flags;
    },
    /**
     * 声が実際に鳴り始めた1件。
     * @param {{ key?: unknown, text?: unknown, receivedAt?: unknown, voice?: unknown }} it
     *   voice: 'voicevox' か 'light'(PC の声)。
     */
    notePlayed(it) {
      const at = now();
      const key = String(it?.key ?? '');
      const text = short(it?.text);
      const rec = Number(it?.receivedAt) > 0 ? Number(it.receivedAt) : 0;
      const ageMs = rec > 0 ? Math.max(0, at - rec) : -1;
      /** @type {string[]} */
      const flags = [];
      c.played += 1;
      const voice = String(it?.voice ?? '');
      if (voice === 'light') c.playedLight += 1;
      if (key) {
        const n = playedKeys.get(key) || 0;
        if (n > 0) { c.sameKeyPlayed += 1; flags.push('sameKey'); }
        playedKeys.delete(key);
        playedKeys.set(key, n + 1);
        trim(playedKeys);
      }
      if (text) {
        const prev = playedText.get(text);
        if (prev && at - prev.at <= YT_VOICE_SAME_TEXT_WINDOW_MS) {
          c.sameTextPlayed += 1;
          flags.push(prev.key === key ? 'sameText' : 'sameTextOtherKey');
        }
        playedText.delete(text);
        playedText.set(text, { at, key });
        trim(playedText);
      }
      if (ageMs >= YT_VOICE_OLD_MS) { c.oldPlayed += 1; flags.push('old'); }
      push({ at, ev: 'play', key, text, ageMs, voice, flags });
      return flags;
    },
    snapshot() {
      return { at: now(), ...c, recent, examples };
    },
  };
}
