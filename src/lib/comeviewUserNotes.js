// comeviewUserNotes.js
// v0.1.667: コメビュのユーザー詳細(わんコメ式 ニックネーム/ラベル/メモ)の純ロジック。
//
// 設計(ユーザー要望 2026-06-10 わんコメのユーザー詳細パネルのスクショ):
//   配信者が視聴者ごとに「ニックネーム(表示名の上書き)・ラベル(コメント横のバッジ)・
//   メモ(自由記述)」を残せる。配信を跨いで永続(常連さんの情報が積み上がる)。
//   さらに匿名ユーザー(userId が 'a:' 始まり)は わんコメ同様「匿名938」のような
//   安定した番号で識別できるようにする(同じ人は同じ番号=追いやすい)。
//
// このファイルは判定・整形の核ロジックだけ(DOM/storage/chrome.* 非依存・テスト可能)。

import { isGenericComeviewName } from './comeviewRows.js';

/** ユーザーノートの storage キー(配信を跨いで効く)。 */
export const COMEVIEW_USER_NOTES_KEY = 'nls_comeview_usernotes_v1';

/** ノートの上限(古い更新から捨てる。無限に増やさない)。 */
export const COMEVIEW_USER_NOTES_MAX = 500;

/**
 * storage から読んだ生値を { userKey: {nickname,label,memo,at} } の素朴な map に正規化する。
 * @param {unknown} raw
 * @returns {Record<string, { nickname: string, label: string, memo: string, at: number }>}
 */
export function normalizeComeviewUserNotes(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  /** @type {Record<string, { nickname: string, label: string, memo: string, at: number }>} */
  const out = {};
  for (const [key, v] of Object.entries(raw)) {
    const k = String(key || '').trim();
    if (!k || !v || typeof v !== 'object') continue;
    const e = /** @type {any} */ (v);
    const nickname = String(e.nickname || '').trim();
    const label = String(e.label || '').trim();
    const memo = String(e.memo || '').trim();
    if (!nickname && !label && !memo) continue;
    out[k] = { nickname, label, memo, at: Number(e.at) || 0 };
  }
  return out;
}

/**
 * ノートを upsert した新しい map を返す。全フィールド空になったらエントリ削除。
 * 上限超過は at(最終更新)が古い順に捨てる。
 *
 * @param {Record<string, { nickname: string, label: string, memo: string, at: number }>} map
 * @param {string} userKey comeviewUserKeyForRow の形式('u:…'/'n:…')
 * @param {{ nickname?: string, label?: string, memo?: string }} patch
 * @param {number} [nowMs]
 * @returns {Record<string, { nickname: string, label: string, memo: string, at: number }>}
 */
export function upsertComeviewUserNote(map, userKey, patch, nowMs = 0) {
  const base = map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  const key = String(userKey || '').trim();
  if (!key) return { ...base };
  const cur = base[key] || { nickname: '', label: '', memo: '', at: 0 };
  const next = {
    nickname:
      patch && patch.nickname !== undefined
        ? String(patch.nickname || '').trim()
        : cur.nickname,
    label:
      patch && patch.label !== undefined ? String(patch.label || '').trim() : cur.label,
    memo:
      patch && patch.memo !== undefined ? String(patch.memo || '').trim() : cur.memo,
    at: Number(nowMs) || 0
  };
  /** @type {Record<string, { nickname: string, label: string, memo: string, at: number }>} */
  const out = { ...base };
  if (!next.nickname && !next.label && !next.memo) {
    delete out[key];
    return out;
  }
  out[key] = next;
  const keys = Object.keys(out);
  if (keys.length > COMEVIEW_USER_NOTES_MAX) {
    keys
      .sort((a, b) => (out[a].at || 0) - (out[b].at || 0))
      .slice(0, keys.length - COMEVIEW_USER_NOTES_MAX)
      .forEach((k) => delete out[k]);
  }
  return out;
}

/**
 * 匿名ユーザー(userId が 'a:' 始まり)の安定表示名「匿名NNN」を返す。
 * 同じ userId は常に同じ番号=配信者が匿名さんを追いやすい(わんコメの 匿名938 と同型)。
 * 匿名形式でない userId には付けない(空文字)。
 * @param {string} userId
 * @returns {string}
 */
export function comeviewAnonLabel(userId) {
  const s = String(userId || '').trim();
  if (!s.startsWith('a:')) return '';
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `匿名${h % 1000}`;
}

/**
 * 行の表示名を解決する: ニックネーム(配信者の上書き) > 本来の名前 > 匿名NNN > ''。
 * @param {{ userId?: string, name?: string }|null|undefined} row
 * @param {Record<string, { nickname?: string }>|null|undefined} notes userKey→ノート
 * @param {string} [userKey] 既に計算済みの userKey(無ければ表示名解決に notes を使わない)
 * @returns {string}
 */
export function resolveComeviewDisplayName(row, notes, userKey) {
  if (!row || typeof row !== 'object') return '';
  const key = String(userKey || '').trim();
  if (key && notes && typeof notes === 'object') {
    const nick = String(notes[key]?.nickname || '').trim();
    if (nick) return nick;
  }
  const name = String(row.name || '').trim();
  // v0.1.671: 「匿名」等の汎用名は個人名でないので、匿名番号(同じ人=同じ番号)を優先する。
  if (name && !isGenericComeviewName(name)) return name;
  const anon = comeviewAnonLabel(String(row.userId || ''));
  if (anon) return anon;
  return name;
}

/**
 * コメント時刻(capturedAt ms)を「HH:MM:SS」に整形する。無効値は空文字。
 * @param {number|null|undefined} ms
 * @returns {string}
 */
export function formatComeviewTime(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  const p = (/** @type {number} */ x) => String(x).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
