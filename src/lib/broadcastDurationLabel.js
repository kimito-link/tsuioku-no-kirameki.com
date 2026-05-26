/**
 * HTML レポートの「配信時間」表示ラベルを純粋に整形する。
 *
 * 背景（C-7: buildHtmlReportDocument の分割・pure refactor）:
 *   popup-entry.js#buildHtmlReportDocument 内に `durationLabel` という IIFE で
 *   インラインに書かれていた整形ロジックを、挙動を 1bit も変えずに純関数として
 *   切り出したもの。`summarizeBroadcastTiming` の戻り値（durationMinutes /
 *   durationMs）を「H時間M分S秒」形式の人間可読文字列にする。
 *
 *   元のインライン実装（popup-entry.js v0.1.397 時点）と完全に同じ分岐:
 *     - durationMinutes が無い / 0 以下 → '-'
 *     - それ以外は durationMs を秒に四捨五入し、時/分/秒に分解:
 *         h > 0 → `${h}時間${m}分${s}秒`
 *         m > 0 → `${m}分${s}秒`
 *         上記以外 → `${s}秒`
 *
 *   モジュール状態・DOM・Date.now 等の非決定値・エスケープには一切依存しない
 *   （入力の数値だけで出力が決まる）ので、固定ケースでユニットテストできる。
 */

/**
 * @param {{ durationMinutes?: number|null, durationMs?: number|null } | null | undefined} timing
 * @returns {string} 「H時間M分S秒」/「M分S秒」/「S秒」/「-」のいずれか
 */
export function formatBroadcastDurationLabel(timing) {
  const min = timing?.durationMinutes;
  if (!min || min <= 0) return '-';
  const ms = timing?.durationMs;
  const totalSeconds = Math.round((typeof ms === 'number' ? ms : 0) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}時間${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}
