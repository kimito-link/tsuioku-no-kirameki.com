// comeviewRows.js
// v0.1.652: 独自コメビュ「KIRAMEKI Comment View」の表示行ロジック(純関数)。
//
// 設計(会議 wf_66d21f13-078 + ユーザー指摘): わんコメの「飲みやすさ=普段ずっと開いていられる
//   落ち着いた読みやすさ」をまず土台にする(弾幕/キャラ演出はその上に後から乗せる)。
//   切り離し可能な独立ウィンドウで、アイコン+名前+コメントが1行ずつゆったり流れる。
//
// このファイルは表示の核ロジックだけ(DOM/storage/chrome.* 非依存・テスト可能・Web/OBS版で共用):
//   - 生コメント行(IDBサマリ recent / tail の生フィールド)を表示用に正規化
//   - 前回表示済みとの「差分(新着)」だけを抽出(全消し再構築しない=軽さの心臓)
//   - 表示は最新 N 件に cap(普段使いで延々開いても重くならない)

/** コメビュに保持・表示する最大件数(普段使いで延々開いても軽い)。 */
export const COMEVIEW_MAX_ROWS = 50;

/**
 * 生コメント行(IDBサマリ recent / tail / PopupCommentEntry いずれの形でも可)から
 * 表示に使う最小フィールドへ正規化する純関数。
 *
 * @param {Record<string, unknown>} raw
 * @returns {{ id: string, no: number|null, name: string, text: string, userId: string, avatar: string, selfPosted: boolean, capturedAt: number|null }|null}
 */
export function normalizeComeviewRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const text = String(r.text ?? '').trim();
  if (!text) return null;
  const noRaw = r.commentNo ?? r.no;
  const no = Number.isFinite(Number(noRaw)) ? Number(noRaw) : null;
  const capRaw = r.capturedAt;
  const capturedAt = Number.isFinite(Number(capRaw)) ? Number(capRaw) : null;
  // 一意キー: commentNo 優先、無ければ id、無ければ userId+text+capturedAt の合成。
  const id =
    no != null
      ? `no:${no}`
      : r.id
        ? `id:${String(r.id)}`
        : `c:${String(r.userId ?? '')}:${text}:${capturedAt ?? ''}`;
  return {
    id,
    no,
    name: String(r.name ?? r.nickname ?? '').trim(),
    text,
    userId: String(r.userId ?? '').trim(),
    avatar: String(r.avatar ?? r.avatarUrl ?? '').trim(),
    selfPosted: !!r.selfPosted,
    capturedAt
  };
}

/**
 * 生コメント配列を表示行へ正規化し、無効行を除き、最新 max 件に cap する。
 * 入力は時系列昇順(古い→新しい)想定。返りも昇順(コメビュは下に新着が来る)。
 *
 * @param {unknown} rows
 * @param {number} [max]
 * @returns {ReturnType<typeof normalizeComeviewRow>[]}
 */
export function buildComeviewRows(rows, max = COMEVIEW_MAX_ROWS) {
  if (!Array.isArray(rows)) return [];
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : COMEVIEW_MAX_ROWS;
  const out = [];
  for (const r of rows) {
    const n = normalizeComeviewRow(r);
    if (n) out.push(n);
  }
  // 最新 cap 件(末尾)だけ残す。
  return out.length > cap ? out.slice(out.length - cap) : out;
}

/**
 * 前回表示済みの id 集合に対して「新着(まだ表示してない)行」だけを返す純関数。
 * これにより全消し再構築せず、新着だけを append できる(軽さの心臓)。
 *
 * @param {ReturnType<typeof normalizeComeviewRow>[]} rows  buildComeviewRows の結果(昇順)
 * @param {Set<string>} seenIds  既に画面に出した id
 * @returns {ReturnType<typeof normalizeComeviewRow>[]}  新着だけ(昇順)
 */
export function pickNewComeviewRows(rows, seenIds) {
  if (!Array.isArray(rows)) return [];
  const seen = seenIds instanceof Set ? seenIds : new Set();
  const fresh = [];
  for (const r of rows) {
    if (r && !seen.has(r.id)) fresh.push(r);
  }
  return fresh;
}
