/**
 * AI共有・診断バンドル向けの URL / 文字列のサニタイズ（純粋関数）。
 * 秘密情報・長文・循環 JSON を落とす。
 */

/** @param {string} s */
function stripRepeatedNoise(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/**
 * query/hash を除去し、origin+pathname のみ返す（最大 maxLen）。
 * @param {string} raw
 * @param {number} [maxLen]
 * @returns {string}
 */
export function sanitizeUrlForDiagnostic(raw, maxLen = 500) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    let out = `${u.origin}${u.pathname}`;
    if (/^\/\/+/.test(u.pathname) === false && out.length > maxLen) {
      out = out.slice(0, maxLen);
    }
    return out.slice(0, maxLen);
  } catch {
    return stripRepeatedNoise(s.split('?')[0].split('#')[0]).slice(0, maxLen);
  }
}

const REDACT_PATTERNS = [
  { re: /\baccess_token\s*=\s*[^\s&#'"]+/gi, rep: 'access_token=[redacted]' },
  { re: /\brefresh_token\s*=\s*[^\s&#'"]+/gi, rep: 'refresh_token=[redacted]' },
  { re: /\bid_token\s*=\s*[^\s&#'"]+/gi, rep: 'id_token=[redacted]' },
  { re: /\btoken\s*[:=]\s*[^\s,}\]'"]+/gi, rep: 'token:[redacted]' },
  { re: /\bAuthorization\s*:\s*Bearer\s+[^\s]+/gi, rep: 'Authorization: Bearer [redacted]' },
  { re: /\bapi[_-]?key\s*[:=]\s*[^\s,}\]'"]+/gi, rep: 'api_key:[redacted]' },
  { re: /\bsession[_-]?id\s*[:=]\s*[^\s,}\]'"]+/gi, rep: 'session_id:[redacted]' },
  {
    re: /\bsession\s*=\s*[^\s&#'"]+/gi,
    rep: 'session=[redacted]'
  },
  {
    re: /\bcsrftoken\s*[:=]\s*[^\s,}\]'"]+/gi,
    rep: 'csrftoken:[redacted]'
  }
];

/**
 * 診断用文字列からトークンっぽい断片をマスクする。
 * @param {string} raw
 * @param {number} [maxLen]
 * @returns {string}
 */
export function redactDiagnosticString(raw, maxLen = 1000) {
  let s = String(raw ?? '');
  for (const { re, rep } of REDACT_PATTERNS) {
    s = s.replace(re, rep);
  }
  s = s.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '[email]');
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…[truncated]`;
  return s;
}

/**
 * @param {unknown} err
 * @returns {{ name: string, message: string }}
 */
export function summarizeError(err) {
  const name =
    err !== null &&
    typeof err === 'object' &&
    'name' in err &&
    typeof /** @type {{ name?: unknown }} */ (err).name === 'string'
      ? String(/** @type {{ name: string }} */ (err).name)
      : 'Error';
  let message = '';
  if (
    err !== null &&
    typeof err === 'object' &&
    'message' in err &&
    typeof /** @type {{ message?: unknown }} */ (err).message === 'string'
  ) {
    message = String(/** @type {{ message: string }} */ (err).message);
  } else if (typeof err === 'string') {
    message = err;
  } else {
    message = String(err ?? '');
  }
  return {
    name,
    message: redactDiagnosticString(message, 800)
  };
}

/**
 * JSON.stringify 風に安全に縮小（深度・長さ・循環対策）。
 * @param {unknown} value
 * @param {number} maxDepth
 * @param {number} maxLength
 * @returns {string}
 */
export function safeJsonForDiagnostic(value, maxDepth = 6, maxLength = 24_000) {
  const seen = new WeakSet();

  /** @param {unknown} v @param {number} d @returns {string} */
  function walk(v, d) {
    if (d > maxDepth) return '[maxDepth]';
    if (v === null || v === undefined) return JSON.stringify(v);
    const t = typeof v;
    if (t === 'string') {
      return JSON.stringify(redactDiagnosticString(/** @type {string} */ (v), Math.min(maxLength, 4000)));
    }
    if (t === 'number' || t === 'boolean') return JSON.stringify(v);
    if (t === 'bigint') return `"BigInt:${String(v).slice(0, 40)}"`;
    if (t !== 'object') return `"${redactDiagnosticString(String(v), 200)}"`;
    if (seen.has(/** @type {object} */ (v))) return '"[Circular]"';
    if (Array.isArray(v)) {
      seen.add(/** @type {object} */ (v));
      const parts = v.slice(0, 200).map((x) => walk(x, d + 1));
      seen.delete(/** @type {object} */ (v));
      return `[${parts.join(',')}${v.length > 200 ? ',…' : ''}]`;
    }
    seen.add(/** @type {object} */ (v));
    const o = /** @type {Record<string, unknown>} */ (v);
    const keys = Object.keys(o).slice(0, 120);
    const pairs = keys.map((k) => {
      const key = /^[\w$]+$/.test(k) ? k : JSON.stringify(k);
      return `${key}:${walk(o[k], d + 1)}`;
    });
    seen.delete(/** @type {object} */ (v));
    return `{${pairs.join(',')}${Object.keys(o).length > 120 ? ',…' : ''}}`;
  }

  try {
    let out = walk(value, 0);
    if (out.length > maxLength) out = `${out.slice(0, maxLength)}…[truncated]`;
    return out;
  } catch {
    return '"[safeJson error]"';
  }
}

/**
 * User-Agent を粗くする（major Chrome / OS のみ）。
 * @param {string} ua
 * @returns {{ chromeMajor: number|null, os: string }}
 */
export function coarseUserAgent(ua) {
  const s = String(ua || '');
  let chromeMajor = null;
  const cm = /Chrome\/(\d+)/i.exec(s);
  if (cm) chromeMajor = Number(cm[1]) || null;
  let os = 'unknown';
  if (/Windows/i.test(s)) os = 'Windows';
  else if (/Mac OS X/i.test(s)) os = 'macOS';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/Linux/i.test(s)) os = 'Linux';
  return { chromeMajor, os };
}
