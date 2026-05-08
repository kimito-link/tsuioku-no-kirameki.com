/**
 * v0.1.205 Phase D: 既存の診断データ（consoleErrors / networkErrors / diagWarnings）から
 * Built-in AI 用のプロンプトを組み立てる純関数。
 *
 * AI 呼び出しは含まない（呼び出し側で geminiNanoBridge.runBuiltinAiPrompt を使う）。
 *
 * 用途: kimito さんが「拡張が動かない」と感じた時、popup の「AI 診断」ボタンで
 * 既存 consoleErrorBuffer / networkErrorProbe / diagWarnings を Gemini Nano に投げて
 * 主因 + 対処方法を 3 行で表示する自己診断機能。
 *
 * 副作用なし。
 */

/**
 * @typedef {{ ts: number, message: string, stack?: string, source?: string }} ConsoleErrorEntry
 *
 * @typedef {{ url: string, status?: number, ts: number, reason?: string }} NetworkErrorEntry
 *
 * @typedef {{ severity: 'low'|'medium'|'high', code: string, message: string }} DiagWarningEntry
 *
 * @typedef {{
 *   consoleErrors?: ConsoleErrorEntry[],
 *   networkErrors?: NetworkErrorEntry[],
 *   diagWarnings?: DiagWarningEntry[],
 *   contextNote?: string,
 *   maxConsoleErrors?: number,
 *   maxNetworkErrors?: number,
 *   maxDiagWarnings?: number
 * }} ErrorDiagnosisInput
 *
 * @typedef {{ system: string, user: string }} ErrorDiagnosisPrompt
 */

const DEFAULT_MAX_CONSOLE = 8;
const DEFAULT_MAX_NETWORK = 6;
const DEFAULT_MAX_WARNING = 6;

const SYSTEM_PROMPT = [
  'あなたは Chrome 拡張のデバッグ支援アシスタントです。',
  '与えられたエラーログから「主因の推定」と「対処方法」を簡潔な日本語で答えてください。',
  '出力は次の 3 行構成:',
  '主因: <1 行で>',
  '対処: <1〜2 行、具体的に>',
  '備考: <あれば 1 行、なければ「なし」>',
  '推測の根拠が薄い場合は「推測の根拠が薄い」と明記してください。'
].join('\n');

/**
 * @param {ErrorDiagnosisInput} input
 * @returns {ErrorDiagnosisPrompt}
 */
export function buildErrorDiagnosisPrompt(input) {
  const consoleErrors = Array.isArray(input?.consoleErrors)
    ? input.consoleErrors
    : [];
  const networkErrors = Array.isArray(input?.networkErrors)
    ? input.networkErrors
    : [];
  const diagWarnings = Array.isArray(input?.diagWarnings)
    ? input.diagWarnings
    : [];

  const maxC = positiveIntOr(input?.maxConsoleErrors, DEFAULT_MAX_CONSOLE);
  const maxN = positiveIntOr(input?.maxNetworkErrors, DEFAULT_MAX_NETWORK);
  const maxW = positiveIntOr(input?.maxDiagWarnings, DEFAULT_MAX_WARNING);

  const sortedConsole = [...consoleErrors]
    .sort((a, b) => (b?.ts || 0) - (a?.ts || 0))
    .slice(0, maxC);
  const sortedNetwork = [...networkErrors]
    .sort((a, b) => (b?.ts || 0) - (a?.ts || 0))
    .slice(0, maxN);
  const trimmedWarnings = [...diagWarnings].slice(0, maxW);

  /** @type {string[]} */
  const lines = [];
  const contextNote = String(input?.contextNote ?? '').trim();
  if (contextNote) {
    lines.push('## 追加情報');
    lines.push(contextNote);
    lines.push('');
  }

  if (sortedConsole.length) {
    lines.push('## Console errors（新しい順）');
    for (const e of sortedConsole) {
      const m = String(e?.message ?? '').trim() || '(empty)';
      const src = String(e?.source ?? '').trim();
      const tag = src ? ` [${src}]` : '';
      lines.push(`- ${m}${tag}`);
    }
    lines.push('');
  }

  if (sortedNetwork.length) {
    lines.push('## Network errors（新しい順）');
    for (const n of sortedNetwork) {
      const url = String(n?.url ?? '').trim() || '(no url)';
      const st = typeof n?.status === 'number' ? ` [${n.status}]` : '';
      const reason = String(n?.reason ?? '').trim();
      lines.push(`- ${url}${st}${reason ? ` — ${reason}` : ''}`);
    }
    lines.push('');
  }

  if (trimmedWarnings.length) {
    lines.push('## 診断警告');
    for (const w of trimmedWarnings) {
      const sev = String(w?.severity ?? 'low');
      const code = String(w?.code ?? '');
      const msg = String(w?.message ?? '');
      lines.push(`- [${sev}] ${code}: ${msg}`);
    }
    lines.push('');
  }

  if (
    !sortedConsole.length &&
    !sortedNetwork.length &&
    !trimmedWarnings.length
  ) {
    lines.push('（観測されたエラー・警告は無し）');
  }

  return {
    system: SYSTEM_PROMPT,
    user: lines.join('\n').trim()
  };
}

/**
 * @param {unknown} v
 * @param {number} fallback
 * @returns {number}
 */
function positiveIntOr(v, fallback) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return Math.floor(v);
  }
  return fallback;
}
