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
 * v0.1.675: コメビュの入力をタイムラインと同じ「確定保存された本体(チャンク)+テール」に
 *   揃えるための結合純関数。本体は persist 時に commentNo で dedupe 済みの正本。テールは
 *   本体へ畳み込み済みの行が残っていることがあるので、commentNo が本体に既にある行は捨てる
 *   (ユーザー指示「まずは(タイムラインと)同じにしろ」=速報リング独自ソースをやめる)。
 *
 * @param {Array<Record<string, unknown>>|unknown} baseRows 本体(直近チャンク連結・生行)
 * @param {Array<Record<string, unknown>>|unknown} tailRows テール(未畳み込み新着・生行)
 * @returns {Array<Record<string, unknown>>}
 */
export function combineCanonicalComeviewRows(baseRows, tailRows) {
  const base = Array.isArray(baseRows) ? baseRows : [];
  const tail = Array.isArray(tailRows) ? tailRows : [];
  const knownNos = new Set();
  for (const r of base) {
    if (!r || typeof r !== 'object') continue;
    const o = /** @type {Record<string, unknown>} */ (r);
    const no = o.commentNo ?? o.no;
    const key = no == null ? '' : String(no).trim();
    if (key) knownNos.add(key);
  }
  const extra = tail.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    const o = /** @type {Record<string, unknown>} */ (r);
    const no = o.commentNo ?? o.no;
    const key = no == null ? '' : String(no).trim();
    return !key || !knownNos.has(key);
  });
  return [...base, ...extra];
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
  /** @type {Map<string, Array<{ capturedAt: number|null }>>} 既に残した弱い行(同一人物+同文)。 */
  const keptWeakByIdentity = new Map();
  /** @type {ReturnType<typeof normalizeComeviewRow>[]} */
  const out = [];
  for (const r of rows) {
    if (!r) continue;
    if (r.no != null) {
      out.push(r);
      continue;
    }
    // 弱い行(no 無し): 同文の no 付き行が近くにあれば別ソース重複として捨てる。
    const strong = strongByText.get(r.text);
    if (strong && strong.some((s) => nearInTime(r, s))) continue;
    const uid = String(r.userId || '').trim();
    const name = String(r.name || '').trim();
    if (!uid && !name) {
      // v0.1.672: 素性なし行は、同文で素性のある行が近くにあれば劣化重複として捨てる。
      const informed = informedByText.get(r.text);
      if (informed && informed.some((s) => s !== r && nearInTime(r, s))) continue;
    } else {
      // v0.1.674: 同一人物(同uid/同名)の同文 weak 行は、recent と tail で capturedAt が
      //   ズレて id が変わる二重取り(実機: 匿名513「あなたくちばし出てるよ」×2)。
      //   ±15秒以内なら最初の1件だけ残す(同じ人が本当に連投したケースは通常 no 付きで来る)。
      const idKey = `${uid || `n:${name}`}|${r.text}`;
      const kept = keptWeakByIdentity.get(idKey);
      if (kept && kept.some((s) => nearInTime(r, s))) continue;
      if (kept) kept.push(r);
      else keptWeakByIdentity.set(idKey, [r]);
    }
    out.push(r);
  }
  return out;
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
