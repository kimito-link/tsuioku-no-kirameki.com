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
 * v0.1.671: 「匿名」「名無し」等の汎用プレースホルダ名。これは個人の名前ではないので、
 *   ユーザー識別キー(NG/名前付け)にも表示名の優先にも使わない(全匿名が1人扱いになる事故と、
 *   匿名番号が出ない事故の両方を防ぐ)。
 * @type {ReadonlySet<string>}
 */
export const GENERIC_ANON_NAMES = new Set(['匿名', '名無し', '名無しさん', '匿名さん']);

/**
 * 名前が汎用プレースホルダ(=個人を識別しない)かどうか。
 * @param {string|null|undefined} name
 * @returns {boolean}
 */
export function isGenericComeviewName(name) {
  return GENERIC_ANON_NAMES.has(String(name || '').trim());
}

/**
 * v0.1.671: 別ソース由来の二重表示を除く純関数。
 *   同じコメントが「commentNo 付き(NDGR 等の強いソース)」と「no 無し(DOM 拾い等の弱いソース)」の
 *   両方で入ってくると、id が異なるため dedupe をすり抜けて2行表示されていた(実機)。
 *   no 無し行は「同じ本文の no 付き行が ±15 秒以内(時刻不明なら同一視)に存在」したら
 *   同一コメントの重複とみなして捨てる。no 付き同士は本文が同じでも残す
 *   (エコーコメント=別人の同文は両方 no を持つので誤って消さない)。
 *
 * @param {ReturnType<typeof normalizeComeviewRow>[]} rows 正規化済み(昇順)
 * @returns {ReturnType<typeof normalizeComeviewRow>[]}
 */
export function dedupeWeakComeviewRows(rows) {
  if (!Array.isArray(rows)) return [];
  /** @type {(a: {capturedAt: number|null}, b: {capturedAt: number|null}) => boolean} */
  const nearInTime = (a, b) =>
    a.capturedAt == null ||
    b.capturedAt == null ||
    Math.abs(Number(a.capturedAt) - Number(b.capturedAt)) <= 15_000;
  /** @type {Map<string, Array<{ capturedAt: number|null }>>} */
  const strongByText = new Map();
  /** @type {Map<string, Array<{ capturedAt: number|null }>>} 名前か userId を持つ(=素性のある)行。本文ごとに集める。 */
  const informedByText = new Map();
  for (const r of rows) {
    if (!r) continue;
    if (r.no != null) {
      const list = strongByText.get(r.text);
      if (list) list.push(r);
      else strongByText.set(r.text, [r]);
    }
    if (String(r.name || '').trim() || String(r.userId || '').trim()) {
      const list = informedByText.get(r.text);
      if (list) list.push(r);
      else informedByText.set(r.text, [r]);
    }
  }
  return rows.filter((r) => {
    if (!r) return false;
    if (r.no != null) return true;
    // 弱い行(no 無し): 同文の no 付き行が近くにあれば別ソース重複として捨てる。
    const strong = strongByText.get(r.text);
    if (strong && strong.some((s) => nearInTime(r, s))) return false;
    // v0.1.672: 弱い行どうしの重複。名前も userId も無い「素性なし」行は、同文で素性のある行が
    //   近くにあれば劣化した重複とみなして捨てる(実機: 「ほねと」行と無名行の同文ペア)。
    //   素性あり同士(別人のエコー)は残す。
    const hasIdentity =
      String(r.name || '').trim() || String(r.userId || '').trim();
    if (!hasIdentity) {
      const informed = informedByText.get(r.text);
      if (informed && informed.some((s) => s !== r && nearInTime(r, s))) return false;
    }
    return true;
  });
}

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
  // 別ソース重複(no 付き vs no 無し)を除いてから、最新 cap 件(末尾)だけ残す。
  const deduped = dedupeWeakComeviewRows(out);
  return deduped.length > cap ? deduped.slice(deduped.length - cap) : deduped;
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
