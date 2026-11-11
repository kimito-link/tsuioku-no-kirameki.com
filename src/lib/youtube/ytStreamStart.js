// ytStreamStart.js — 配信ページの「いつ始まったか」を時刻にする純粋関数。

const UNIT_MS = {
  分: 60_000,
  時間: 3_600_000,
  日: 86_400_000,
  週間: 7 * 86_400_000,
  か月: 30 * 86_400_000,
  ヶ月: 30 * 86_400_000,
  年: 365 * 86_400_000,
  minute: 60_000,
  minutes: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  day: 86_400_000,
  days: 86_400_000,
  week: 7 * 86_400_000,
  weeks: 7 * 86_400_000,
  month: 30 * 86_400_000,
  months: 30 * 86_400_000,
  year: 365 * 86_400_000,
  years: 365 * 86_400_000,
};

/**
 * 「5 日前にライブ配信開始」や "Started streaming 3 hours ago" を、分単位の時刻にする。
 * 取れなければ null。
 * @param {string} text
 * @param {number} nowMs
 * @returns {number | null}
 */
export function relativeStreamStartedAtMs(text, nowMs) {
  const flat = String(text || '').replace(/\s+/g, ' ');
  let m = flat.match(/(\d+)\s*(週間|か月|ヶ月|時間|分|日|年)前にライブ配信開始/);
  if (!m) m = flat.match(/Started streaming (\d+) (minutes|hours|days|weeks|months|years|minute|hour|day|week|month|year) ago/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = UNIT_MS[/** @type {keyof typeof UNIT_MS} */ (m[2].toLowerCase())] || 0;
  if (!Number.isFinite(n) || n < 0 || n > 10000 || !unit) return null;
  if (!(nowMs > 0)) return null;
  return Math.floor((nowMs - n * unit) / 60_000) * 60_000;
}

/**
 * ページに埋まった "startTimestamp":"..." をミリ秒にする。未来や壊れた値は null。
 * @param {string} raw
 * @param {number} nowMs
 * @returns {number | null}
 */
export function startMsFromTimestampBlob(raw, nowMs) {
  const m = String(raw || '').match(/"startTimestamp":"([^"]+)"/);
  if (!m) return null;
  const ms = Date.parse(m[1]);
  if (!Number.isFinite(ms) || ms <= 0 || !(nowMs > 0) || ms > nowMs) return null;
  return ms;
}
