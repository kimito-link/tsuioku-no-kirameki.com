/**
 * 読み上げの合成失敗を分類する純関数(v0.1.1213)。
 *
 * 2026-08-01 実配信(lv351072048・4時間8分・記録1万件)で読み上げが破綻した:
 *   需要52.2/分 vs 供給4.8/分 / 合成待ち8599ms / 直近voiced率3%
 * ところが計器の帳尻が合わなかった。1分に約52件届いて、読めた約6件+間引き12件=18件しか
 * 説明できず、**約34件がどの計器にも乗っていなかった**。
 *
 * 真犯人は voicePlayer の `if (!wav ...) { ...; continue; }` 分岐。
 * voicevoxClient は synthesis を 8000ms でタイムアウトさせ catch で null を返すが(:325)、
 * 受け側が spokenTotal も drop も増やさず捨てるため、失敗が丸ごと観測から消えていた。
 * 「なぜ読まれないのか」を原理的に答えられない状態だった。
 *
 * ★合成待ちEMAが 8599ms とタイムアウト上限 8000ms を超えている点は、タイムアウト多発を
 *   強く示唆する。ただし「遅い成功」の混在でも同じ値になりうるので、断定せずに数える。
 *   near-timeout を別枠で数えるのはその区別のため。
 *
 * @module voiceSynthFailure
 */

/** VOICEVOX synthesis の既定タイムアウト(voicevoxClient.js の positiveTimeout 既定と揃える)。 */
export const VOICE_SYNTH_TIMEOUT_MS = 8000;

/** タイムアウト境界とみなす下限比(この割合以上ならタイムアウト由来を疑う)。 */
export const VOICE_SYNTH_NEAR_TIMEOUT_RATIO = 0.9;

/**
 * 合成が null で返った1件を分類する。
 *
 * @param {{ synthMs?: unknown, timeoutMs?: unknown }} [ev]
 *   synthMs: その1件の合成待ち実測(ms) / timeoutMs: 判定に使う上限(既定8000)
 * @returns {{ nearTimeout: boolean, ratio: number }}
 *   nearTimeout: タイムアウト上限に十分近い=時間切れ由来を疑う
 */
export function classifyVoiceSynthNull(ev) {
  const timeoutMs = Number(ev?.timeoutMs);
  const limit = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : VOICE_SYNTH_TIMEOUT_MS;
  const ms = Number(ev?.synthMs);
  if (!Number.isFinite(ms) || ms < 0) return { nearTimeout: false, ratio: -1 };
  const ratio = ms / limit;
  return { nearTimeout: ratio >= VOICE_SYNTH_NEAR_TIMEOUT_RATIO, ratio };
}

/**
 * 状態速報の1行を組み立てる。0件なら空文字(静かな計器)。
 *
 * @param {{ synthNullTotal?: unknown, synthNullNearTimeout?: unknown }} [diag]
 * @returns {string}
 */
export function formatVoiceSynthFailureLine(diag) {
  const total = Math.max(0, Math.floor(Number(diag?.synthNullTotal) || 0));
  if (total <= 0) return '';
  const near = Math.max(0, Math.floor(Number(diag?.synthNullNearTimeout) || 0));
  const other = Math.max(0, total - near);
  // 「読まれなかった件」がどの計器にも乗らない穴を塞ぐのが目的なので、必ず内訳まで出す。
  return `合成失敗${total}件(時間切れ${near}/その他${other})=読み上げに届かず消えた件数`;
}
