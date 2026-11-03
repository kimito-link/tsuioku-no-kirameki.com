/**
 * ytPostedAt.js — YouTube のチャット1件の「本当に書かれた時刻」を、チャット欄の時刻表示(#timestamp)から求める。
 *
 * 記録の recordedAt は「拡張が受け取った時刻」なので、パネルを開いたときにチャット欄に残っていた分は
 * 全部同じ時刻になる(スパチャの投げ一覧の時刻がそろってしまう)。#timestamp は分までの時計の表示
 * (例 "12:25 AM" / "午前0:25" / "0:25")なので、受け取った時刻の直前で、その時計に合う時刻を選ぶ。
 */

/**
 * @param {string} ts チャット欄の時刻表示
 * @returns {{ h: number, m: number } | null} 0〜23 時・0〜59 分
 */
export function parseYtChatClock(ts) {
  const s = String(ts || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (!(h >= 0 && h <= 23 && min >= 0 && min <= 59)) return null;
  const pm = /PM|午後/i.test(s);
  const am = /AM|午前/i.test(s);
  if (pm || am) {
    if (h > 12) return null;
    if (h === 12) h = 0;
    if (pm) h += 12;
  }
  return { h, m: min };
}

/**
 * 受け取った時刻(recordedAt)より前で、時計の表示に合ういちばん近い時刻を返す。
 * 表示の時刻は分単位なので、受け取りとの差が 90 秒以内なら受け取った時刻(より細かい)をそのまま使う。
 * @param {string} ts
 * @param {number} recordedAt ms
 * @returns {number} ms(求められなければ recordedAt)
 */
export function ytPostedAtFromClock(ts, recordedAt) {
  const rec = Number(recordedAt);
  if (!Number.isFinite(rec) || rec <= 0) return rec;
  const c = parseYtChatClock(ts);
  if (!c) return rec;
  const d = new Date(rec);
  d.setHours(c.h, c.m, 0, 0);
  let t = d.getTime();
  // 表示の分は受け取りより後にはならない(1分の余裕)。後なら前の日。
  if (t > rec + 60_000) t -= 24 * 3600_000;
  if (rec - t <= 90_000) return rec;
  // 半日以上前になるのは時計の読み違い(12時間表記の取り違え等)とみなして使わない
  if (rec - t > 12 * 3600_000) return rec;
  return t;
}
