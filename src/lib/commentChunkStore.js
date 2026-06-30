/**
 * v0.1.509: コメント本体の「追記専用チャンク分割」純関数群＋ストレージ orchestration。
 *
 * 背景（HANDOFF 2026-05-31 §4-B）:
 *   従来は 1 放送=1 つの巨大配列 `nls_comments_<lv>` を、テール畳み込みのたびに
 *   全件 read→merge→**全件 write**（構造化クローン）していた。本体が大きいほど 1 回の
 *   クローン write が重く（実質 O(N) 〜 多タブで O(N^2) 的）、巨大放送のバックフィルが
 *   「いっきにガッとは取れない」主因だった。
 *
 *   本モジュールは本体を **追記専用チャンク** `nls_cchunk_<lv>_<seq>` に分割する。
 *   畳み込みは「dedupe 後に **新規分だけ** を新しいチャンクとして足す」だけになり、
 *   既存チャンクは二度と書き換えない＝ホットパスの write が新規件数に比例した一定の軽さに
 *   なる（巨大配列の全件クローンが消える）。
 *
 * 設計上の不変条件 / 安全方針:
 *   - 接頭辞 `nls_cchunk_` は `nls_comments_lv*` を列挙する clean migration / past-live 読みと
 *     衝突しない（接頭辞を分離）。
 *   - dedupe は呼び出し側が既存 `mergeNewComments`（commentRecord.js）を「全チャンク連結＝
 *     従来の本体配列と同一」に対して適用することで **従来と完全に同じ意味**を保つ。本モジュールは
 *     その結果の「新規追加分（added）」を新チャンクに足すだけ（dedupe ロジックには関与しない）。
 *   - 移行は冪等。既存 `nls_comments_<lv>`（正本）は **削除しない**（検証完了までバックアップとして
 *     温存。読み手は index があればチャンク、無ければ従来 main にフォールバック）。
 *
 * @module commentChunkStore
 */

/** 1 チャンクあたりの最大件数。 */
export const DEFAULT_COMMENT_CHUNK_SIZE = 1000;

/** チャンクインデックスのスキーマバージョン。 */
export const CHUNK_INDEX_VERSION = 1;

/** @param {string} liveId */
function normLid(liveId) {
  return String(liveId || '').trim().toLowerCase();
}

/**
 * 放送＋連番ごとのチャンク本体キー。
 * @param {string} liveId lv123
 * @param {number} seq 0 始まりの連番
 * @returns {string}
 */
export function chunkStorageKey(liveId, seq) {
  return `nls_cchunk_${normLid(liveId)}_${Math.max(0, Math.floor(Number(seq) || 0))}`;
}

/**
 * 放送ごとのチャンクインデックスキー（seq 一覧・総件数・chunk サイズを保持）。
 * @param {string} liveId
 * @returns {string}
 */
export function chunkIndexKey(liveId) {
  return `nls_cchunk_index_${normLid(liveId)}`;
}

/**
 * 放送ごとの「チャンク移行済み」フラグキー（再実行で上書きしないため）。
 * @param {string} liveId
 * @returns {string}
 */
export function chunkMigratedKey(liveId) {
  return `nls_cchunk_migrated_${normLid(liveId)}`;
}

/**
 * 配列を maxPerChunk 件ずつのチャンク（配列の配列）に分割する純関数。
 * @param {Array<unknown>|unknown} arr
 * @param {number} [maxPerChunk]
 * @returns {Array<Array<unknown>>}
 */
export function splitIntoChunks(arr, maxPerChunk = DEFAULT_COMMENT_CHUNK_SIZE) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const size =
    Number.isFinite(maxPerChunk) && maxPerChunk > 0
      ? Math.floor(maxPerChunk)
      : DEFAULT_COMMENT_CHUNK_SIZE;
  /** @type {Array<Array<unknown>>} */
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * インデックスオブジェクトを作る純関数。
 * @param {string} liveId
 * @param {{ seqs: number[], total: number, maxPerChunk?: number }} parts
 * @returns {{ v: number, liveId: string, seqs: number[], total: number, maxPerChunk: number }}
 */
export function buildChunkIndex(liveId, parts) {
  const seqs = Array.isArray(parts?.seqs)
    ? parts.seqs.map((n) => Math.max(0, Math.floor(Number(n) || 0)))
    : [];
  const total = Math.max(0, Math.floor(Number(parts?.total) || 0));
  const maxPerChunk =
    Number.isFinite(parts?.maxPerChunk) && Number(parts.maxPerChunk) > 0
      ? Math.floor(Number(parts.maxPerChunk))
      : DEFAULT_COMMENT_CHUNK_SIZE;
  return { v: CHUNK_INDEX_VERSION, liveId: normLid(liveId), seqs, total, maxPerChunk };
}

/**
 * 読み出したオブジェクトが想定 liveId の有効なチャンクインデックスか判定する型ガード。
 * @param {unknown} obj
 * @param {string} [liveId]
 * @returns {boolean}
 */
export function isChunkIndex(obj, liveId) {
  if (!obj || typeof obj !== 'object') return false;
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (Number(o.v) !== CHUNK_INDEX_VERSION) return false;
  if (!Array.isArray(o.seqs)) return false;
  if (!Number.isFinite(Number(o.total))) return false;
  if (liveId !== undefined && normLid(/** @type {string} */ (o.liveId)) !== normLid(liveId)) {
    return false;
  }
  return true;
}

/**
 * インデックスから全チャンク本体キーを seq 昇順で返す。
 * @param {string} liveId
 * @param {{ seqs?: number[] }} index
 * @returns {string[]}
 */
export function chunkKeysFromIndex(liveId, index) {
  const seqs = Array.isArray(index?.seqs) ? index.seqs.slice() : [];
  seqs.sort((a, b) => a - b);
  return seqs.map((seq) => chunkStorageKey(liveId, seq));
}

/**
 * 既存 main 巨大配列をチャンク群へ分割する移行計画（純関数）。
 * 既存 main キーは含めない（呼び出し側がバックアップとして温存する）。
 *
 * @param {string} liveId
 * @param {Array<unknown>|unknown} mainArray
 * @param {{ maxPerChunk?: number }} [opts]
 * @returns {{
 *   writes: Record<string, Array<unknown>>,
 *   index: { v: number, liveId: string, seqs: number[], total: number, maxPerChunk: number }
 * }}
 */
export function planMigrateMainToChunks(liveId, mainArray, opts = {}) {
  const maxPerChunk =
    Number.isFinite(opts.maxPerChunk) && Number(opts.maxPerChunk) > 0
      ? Math.floor(Number(opts.maxPerChunk))
      : DEFAULT_COMMENT_CHUNK_SIZE;
  const arr = Array.isArray(mainArray) ? mainArray : [];
  const chunks = splitIntoChunks(arr, maxPerChunk);
  /** @type {Record<string, Array<unknown>>} */
  const writes = {};
  /** @type {number[]} */
  const seqs = [];
  for (let i = 0; i < chunks.length; i += 1) {
    writes[chunkStorageKey(liveId, i)] = chunks[i];
    seqs.push(i);
  }
  return {
    writes,
    index: buildChunkIndex(liveId, { seqs, total: arr.length, maxPerChunk })
  };
}

/**
 * 新規追加分（added）を「既存チャンクを書き換えずに」新しいチャンクとして足す計画（純関数）。
 * 既存の最大 seq の次から連番を振る（追記専用＝既存チャンクは不変）。
 *
 * @param {string} liveId
 * @param {{ seqs?: number[], total?: number, maxPerChunk?: number }} index 現在のインデックス
 * @param {Array<unknown>|unknown} addedRows mergeNewComments が返した新規分
 * @param {{ maxPerChunk?: number }} [opts]
 * @returns {{
 *   writes: Record<string, Array<unknown>>,
 *   index: { v: number, liveId: string, seqs: number[], total: number, maxPerChunk: number }
 * }}
 */
export function planAppendRowsAsChunks(liveId, index, addedRows, opts = {}) {
  const curSeqs = Array.isArray(index?.seqs)
    ? index.seqs.map((n) => Math.max(0, Math.floor(Number(n) || 0)))
    : [];
  const curTotal = Math.max(0, Math.floor(Number(index?.total) || 0));
  const maxPerChunk =
    Number.isFinite(opts.maxPerChunk) && Number(opts.maxPerChunk) > 0
      ? Math.floor(Number(opts.maxPerChunk))
      : Number.isFinite(index?.maxPerChunk) && Number(index.maxPerChunk) > 0
      ? Math.floor(Number(index.maxPerChunk))
      : DEFAULT_COMMENT_CHUNK_SIZE;
  const rows = Array.isArray(addedRows) ? addedRows : [];
  if (rows.length === 0) {
    return {
      writes: {},
      index: buildChunkIndex(liveId, {
        seqs: curSeqs,
        total: curTotal,
        maxPerChunk
      })
    };
  }
  const nextSeqStart = curSeqs.length ? Math.max(...curSeqs) + 1 : 0;
  const chunks = splitIntoChunks(rows, maxPerChunk);
  /** @type {Record<string, Array<unknown>>} */
  const writes = {};
  const seqs = curSeqs.slice();
  for (let i = 0; i < chunks.length; i += 1) {
    const seq = nextSeqStart + i;
    writes[chunkStorageKey(liveId, seq)] = chunks[i];
    seqs.push(seq);
  }
  return {
    writes,
    index: buildChunkIndex(liveId, {
      seqs,
      total: curTotal + rows.length,
      maxPerChunk
    })
  };
}

/**
 * 配列を全チャンクへ書き直す計画（正規化など稀なフルリライト用）。
 * 既存より seq が減ったぶんは removeKeys に挙げる（古いチャンクの取り残し防止）。
 *
 * @param {string} liveId
 * @param {Array<unknown>|unknown} array
 * @param {{ prevSeqs?: number[], maxPerChunk?: number }} [opts]
 * @returns {{
 *   writes: Record<string, Array<unknown>>,
 *   removeKeys: string[],
 *   index: { v: number, liveId: string, seqs: number[], total: number, maxPerChunk: number }
 * }}
 */
export function planRewriteAllChunks(liveId, array, opts = {}) {
  const maxPerChunk =
    Number.isFinite(opts.maxPerChunk) && Number(opts.maxPerChunk) > 0
      ? Math.floor(Number(opts.maxPerChunk))
      : DEFAULT_COMMENT_CHUNK_SIZE;
  const arr = Array.isArray(array) ? array : [];
  const chunks = splitIntoChunks(arr, maxPerChunk);
  /** @type {Record<string, Array<unknown>>} */
  const writes = {};
  /** @type {number[]} */
  const seqs = [];
  for (let i = 0; i < chunks.length; i += 1) {
    writes[chunkStorageKey(liveId, i)] = chunks[i];
    seqs.push(i);
  }
  const prevSeqs = Array.isArray(opts.prevSeqs)
    ? opts.prevSeqs.map((n) => Math.max(0, Math.floor(Number(n) || 0)))
    : [];
  const newSet = new Set(seqs);
  const removeKeys = prevSeqs
    .filter((seq) => !newSet.has(seq))
    .map((seq) => chunkStorageKey(liveId, seq));
  return {
    writes,
    removeKeys,
    index: buildChunkIndex(liveId, { seqs, total: arr.length, maxPerChunk })
  };
}

/**
 * チャンク（またはフォールバックで従来 main）から本体配列を読み出す async orchestration。
 * getMany(keys) は `{ [key]: value }` を返す関数（chrome.storage.local.get 相当・テスト可能）。
 *
 * ★v0.1.1012: 返り値に complete を追加。インデックスが指す全チャンクが配列として読めたら true。
 *   いずれかのチャンクが非配列(storage 競合で timeout/部分失敗・未 flush)なら false=部分読み。
 *   呼び出し側(dedup の seed)は complete=false のとき【不完全な keySet で照合せず requeue】する。
 *   これが無いと、競合下で読めなかったチャンクのコメントが keySet に入らず、再到来で二重記録される
 *   (実機 lv350854400・backfill 1505件/秒走行中に 本家+0/記録+189 の過剰増=本物の二重計上の真因)。
 *
 * @param {string} liveId
 * @param {string} mainKey 従来の `nls_comments_<lv>` キー（フォールバック用）
 * @param {(keys: string[]) => Promise<Record<string, unknown>>} getMany
 * @returns {Promise<{ rows: Array<unknown>, fromChunks: boolean, index: object|null, complete: boolean }>}
 */
export async function readChunkedComments(liveId, mainKey, getMany) {
  const idxKey = chunkIndexKey(liveId);
  const idxBag = await getMany([idxKey]);
  const index = idxBag ? idxBag[idxKey] : null;
  if (isChunkIndex(index, liveId) && Array.isArray(/** @type {any} */ (index).seqs)) {
    const keys = chunkKeysFromIndex(liveId, /** @type {any} */ (index));
    if (keys.length === 0) {
      return { rows: [], fromChunks: true, index: /** @type {object} */ (index), complete: true };
    }
    const bag = await getMany(keys);
    /** @type {Array<unknown>} */
    let rows = [];
    let complete = true;
    for (const key of keys) {
      const part = bag ? bag[key] : null;
      if (Array.isArray(part)) rows = rows.concat(part);
      else complete = false; // ★非配列(read失敗/未flush)=部分読み。seed を信用させない。
    }
    return { rows, fromChunks: true, index: /** @type {object} */ (index), complete };
  }
  const mainBag = await getMany([mainKey]);
  const main = mainBag ? mainBag[mainKey] : null;
  // フォールバック(従来 main): 配列なら complete、欠落なら不完全。
  return {
    rows: Array.isArray(main) ? main : [],
    fromChunks: false,
    index: null,
    complete: Array.isArray(main) || main == null
  };
}
