/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】日本時間の日付・分・公式更新表記の解釈
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】紅白の「今日」は日本時間(通年 UTC+9)だけで数える
 *
 * time.js — 夏時間の無い日本時間。
 */

/** 日本の標準時は通年 UTC+9。法改正で変わったらこの定数だけを更新する。 */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * @typedef {{
 *   year: number,
 *   month: number,
 *   day: number,
 *   hour: number,
 *   minute: number,
 *   second: number
 * }} JstParts
 */

/**
 * @param {number} value
 * @returns {string}
 */
export function pad(value) {
  return String(value).padStart(2, '0');
}

/**
 * @param {Date} date
 * @returns {JstParts}
 */
export function jstParts(date) {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds()
  };
}

/**
 * @param {Date} date
 * @returns {string}
 */
export function jstDateString(date) {
  const parts = jstParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/**
 * @param {Date} date
 * @returns {number}
 */
export function jstMinutesOfDay(date) {
  const parts = jstParts(date);
  return parts.hour * 60 + parts.minute;
}

/**
 * @param {string} iso
 * @returns {string}
 */
export function formatJstDateTime(iso) {
  const parts = jstParts(new Date(iso));
  return `${parts.year}年${parts.month}月${parts.day}日 ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * 「11月21日（土）15時55分頃更新分」を、取得時刻の年を補って JST の ISO にする。
 * 年は本文に無い。取得日の年を使い、年をまたぐときだけ±1する。
 * @param {string} label
 * @param {Date} fetchedAt
 * @returns {string|null}
 */
export function parseOfficialUpdateAt(label, fetchedAt) {
  const match = String(label || '').match(/(\d{1,2})月(\d{1,2})日（[月火水木金土日]）(\d{1,2})時(\d{1,2})分/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const fetched = jstParts(fetchedAt);
  let year = fetched.year;
  if (month === 12 && fetched.month === 1) year -= 1;
  if (month === 1 && fetched.month === 12) year += 1;

  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+09:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = jstParts(parsed);
  if (parts.year !== year || parts.month !== month || parts.day !== day || parts.hour !== hour || parts.minute !== minute) {
    return null;
  }
  return iso;
}
