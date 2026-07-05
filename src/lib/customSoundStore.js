/**
 * customSoundStore.js
 * council/pachinko-ultimate-SYNTHESIS.md §1.2/§1.4/§1.5(Phase A)の実装。
 *
 * 「マイ効果音」= ユーザーが持ち込んだ音声ファイルを IndexedDB に保存し、既存の
 *   effectSoundPlayer.js の deps 注入(variantPaths/paths/getUrl/rng/volume)だけで
 *   差し替える機能。**effectSoundPlayer.js は無改変**(このファイルが deps を組み立てるだけ)。
 *
 * ローカル自動同梱(2026-07-05・「手動取込」を不要にする追加実装):
 *   scripts/install-local-sounds.mjs が `npm run copy:ext` の一環で、ユーザーのPC上の音源
 *   ソースディレクトリ(既定 D:\download)からプリセット該当分だけをローカル展開先
 *   (リポジトリ外・既定 C:\nicolive-ext)の sound/custom/ へコピーし、manifest.json を生成する。
 *   このファイルはその manifest.json を fetch して自動的に customVariantPaths へ組み込む
 *   (loadLocalBundledSoundManifest / buildLocalVariantPaths)。IDB取込UIによる手動割当は
 *   従来どおり最優先で温存(合成順: IDB割当 > ローカル同梱 > 呼び出し側の同梱合成音)。
 *
 * 純関数部(テスト可能)と副作用部(IndexedDB/fetch操作)を分離する:
 *   - 純関数: mergeVariantPaths / mergeSinglePaths / rotationRngFor / getUrlForCustomSound /
 *     gainForAssignment / buildCustomVariantPathsFromAssignments / buildLocalVariantPaths
 *   - 副作用: openCustomSoundDb / putSoundBlob / getSoundBlob / listSoundBlobs / countSoundBlobs /
 *     deleteSoundBlob / getAssignment / setAssignment / clearAssignment / listAssignments /
 *     countAssignments / bumpCustomSoundRev / loadLocalBundledSoundManifest
 *
 * ストア構成(設計書§1.2):
 *   DB名 tk-custom-sounds / version 1
 *   - blobs: { id, blob, name, bytes, importedAt }
 *   - assignments: { key, ids, gain }
 * 音声Blobはユーザーのブラウザ内IndexedDBにのみ存在し、chrome.storage.local には
 *   世代カウンタ(KEY_CUSTOM_SOUND_REV)だけを書く(Blobをstorageに載せない=サイズ地雷回避)。
 */

import { KEY_CUSTOM_SOUND_REV } from './storageKeys.js';
import { CUSTOM_SOUND_PRESET } from './customSoundPreset.js';

/** IndexedDB データベース名。 */
export const CUSTOM_SOUND_DB_NAME = 'tk-custom-sounds';
/** スキーマバージョン。 */
export const CUSTOM_SOUND_DB_VERSION = 1;
/** Blob本体を格納するオブジェクトストア名(keyPath=id)。 */
export const CUSTOM_SOUND_STORE_BLOBS = 'blobs';
/** キー→割当(ids配列+gain)を格納するオブジェクトストア名(keyPath=key)。 */
export const CUSTOM_SOUND_STORE_ASSIGNMENTS = 'assignments';

/** 割当が無いキーの既定gain。 */
export const CUSTOM_SOUND_DEFAULT_GAIN = 1.0;

/** @returns {boolean} */
export function isCustomSoundDbAvailable() {
  return typeof indexedDB !== 'undefined';
}

/**
 * @returns {Promise<IDBDatabase>}
 */
export function openCustomSoundDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CUSTOM_SOUND_DB_NAME, CUSTOM_SOUND_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CUSTOM_SOUND_STORE_BLOBS)) {
        db.createObjectStore(CUSTOM_SOUND_STORE_BLOBS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CUSTOM_SOUND_STORE_ASSIGNMENTS)) {
        db.createObjectStore(CUSTOM_SOUND_STORE_ASSIGNMENTS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ============================================================================
 * 副作用部: blobs ストア
 * ========================================================================== */

/**
 * 1件のBlobを保存(既存idは上書き)。
 * @param {IDBDatabase} db
 * @param {{ id: string, blob: Blob, name: string, bytes?: number, importedAt?: number }} rec
 * @returns {Promise<void>}
 */
export function putSoundBlob(db, rec) {
  return new Promise((resolve, reject) => {
    if (!rec || !rec.id || !(rec.blob instanceof Blob)) {
      resolve();
      return;
    }
    const tx = db.transaction(CUSTOM_SOUND_STORE_BLOBS, 'readwrite');
    tx.objectStore(CUSTOM_SOUND_STORE_BLOBS).put({
      id: String(rec.id),
      blob: rec.blob,
      name: String(rec.name || ''),
      bytes: Number(rec.bytes) || rec.blob.size || 0,
      importedAt: Number(rec.importedAt) || Date.now()
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * idを指定して1件のBlobレコードを読む(無ければnull)。
 * @param {IDBDatabase} db
 * @param {string} id
 * @returns {Promise<{ id: string, blob: Blob, name: string, bytes: number, importedAt: number }|null>}
 */
export function getSoundBlob(db, id) {
  return new Promise((resolve, reject) => {
    if (!id) {
      resolve(null);
      return;
    }
    const tx = db.transaction(CUSTOM_SOUND_STORE_BLOBS, 'readonly');
    const req = tx.objectStore(CUSTOM_SOUND_STORE_BLOBS).get(String(id));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 保存済み全Blobレコードを列挙する(取込済み件数の計測・一覧表示に使う)。
 * @param {IDBDatabase} db
 * @returns {Promise<Array<{ id: string, blob: Blob, name: string, bytes: number, importedAt: number }>>}
 */
export function listSoundBlobs(db) {
  return new Promise((resolve, reject) => {
    /** @type {Array<{ id: string, blob: Blob, name: string, bytes: number, importedAt: number }>} */
    const out = [];
    const tx = db.transaction(CUSTOM_SOUND_STORE_BLOBS, 'readonly');
    const req = tx.objectStore(CUSTOM_SOUND_STORE_BLOBS).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(out);
        return;
      }
      out.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * 保存済みBlob件数だけをネイティブcount()で数える(診断計器用・Blob本体を読まない)。
 *   listSoundBlobsとの違い: カーソル走査でBlob本体まで全件読み出すlistSoundBlobsに対し、
 *   こちらはIDBObjectStore.count()に委譲し件数のみをO(1)相当で返す(件数比例で重くならない)。
 * @param {IDBDatabase} db
 * @returns {Promise<number>}
 */
export function countSoundBlobs(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOM_SOUND_STORE_BLOBS, 'readonly');
    const req = tx.objectStore(CUSTOM_SOUND_STORE_BLOBS).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * idを指定してBlobレコードを削除する。
 * @param {IDBDatabase} db
 * @param {string} id
 * @returns {Promise<void>}
 */
export function deleteSoundBlob(db, id) {
  return new Promise((resolve, reject) => {
    if (!id) {
      resolve();
      return;
    }
    const tx = db.transaction(CUSTOM_SOUND_STORE_BLOBS, 'readwrite');
    tx.objectStore(CUSTOM_SOUND_STORE_BLOBS).delete(String(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* ============================================================================
 * 副作用部: assignments ストア
 * ========================================================================== */

/**
 * キー1つぶんの割当(ids配列+gain)を読む(無ければnull=未割当=フォールバック)。
 * @param {IDBDatabase} db
 * @param {string} key
 * @returns {Promise<{ key: string, ids: string[], gain: number }|null>}
 */
export function getAssignment(db, key) {
  return new Promise((resolve, reject) => {
    if (!key) {
      resolve(null);
      return;
    }
    const tx = db.transaction(CUSTOM_SOUND_STORE_ASSIGNMENTS, 'readonly');
    const req = tx.objectStore(CUSTOM_SOUND_STORE_ASSIGNMENTS).get(String(key));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * キー1つぶんの割当を保存(既存は上書き)。gain省略時は既定値。
 * @param {IDBDatabase} db
 * @param {string} key
 * @param {string[]} ids 変奏順のBlob id配列
 * @param {number} [gain]
 * @returns {Promise<void>}
 */
export function setAssignment(db, key, ids, gain) {
  return new Promise((resolve, reject) => {
    if (!key) {
      resolve();
      return;
    }
    const tx = db.transaction(CUSTOM_SOUND_STORE_ASSIGNMENTS, 'readwrite');
    tx.objectStore(CUSTOM_SOUND_STORE_ASSIGNMENTS).put({
      key: String(key),
      ids: Array.isArray(ids) ? ids.map(String) : [],
      gain: typeof gain === 'number' && Number.isFinite(gain) ? Math.max(0, Math.min(1, gain)) : CUSTOM_SOUND_DEFAULT_GAIN
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * キーの割当を削除する(=「既定に戻す」。合成音フォールバックへ)。
 * @param {IDBDatabase} db
 * @param {string} key
 * @returns {Promise<void>}
 */
export function clearAssignment(db, key) {
  return new Promise((resolve, reject) => {
    if (!key) {
      resolve();
      return;
    }
    const tx = db.transaction(CUSTOM_SOUND_STORE_ASSIGNMENTS, 'readwrite');
    tx.objectStore(CUSTOM_SOUND_STORE_ASSIGNMENTS).delete(String(key));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * 全キーの割当を列挙する(再生deps構築・診断計器の「割当キー数」計測に使う)。
 * @param {IDBDatabase} db
 * @returns {Promise<Array<{ key: string, ids: string[], gain: number }>>}
 */
export function listAssignments(db) {
  return new Promise((resolve, reject) => {
    /** @type {Array<{ key: string, ids: string[], gain: number }>} */
    const out = [];
    const tx = db.transaction(CUSTOM_SOUND_STORE_ASSIGNMENTS, 'readonly');
    const req = tx.objectStore(CUSTOM_SOUND_STORE_ASSIGNMENTS).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(out);
        return;
      }
      out.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * 割当済みキー件数だけをネイティブcount()で数える(診断計器用)。
 * @param {IDBDatabase} db
 * @returns {Promise<number>}
 */
export function countAssignments(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOM_SOUND_STORE_ASSIGNMENTS, 'readonly');
    const req = tx.objectStore(CUSTOM_SOUND_STORE_ASSIGNMENTS).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ============================================================================
 * 副作用部: chrome.storage.local の世代カウンタ(他コンテキストへの通知)
 * ========================================================================== */

/**
 * 割当変更のたびに呼ぶ。KEY_CUSTOM_SOUND_REV を+1して venueBar/popup に
 *   storage.onChanged 経由で「割当が変わった」ことだけ伝える(Blob自体は載せない)。
 * @param {{ get(keys: string): Promise<Record<string, unknown>>, set(items: Record<string, unknown>): Promise<void> }} storageLocal chrome.storage.local
 * @returns {Promise<number>} 更新後のrev
 */
export async function bumpCustomSoundRev(storageLocal) {
  try {
    const bag = await storageLocal.get(KEY_CUSTOM_SOUND_REV);
    const next = (Number(bag?.[KEY_CUSTOM_SOUND_REV]) || 0) + 1;
    await storageLocal.set({ [KEY_CUSTOM_SOUND_REV]: next });
    return next;
  } catch {
    return 0;
  }
}

/* ============================================================================
 * 純関数部: variantPaths/paths マージ(カスタム優先・未割当キーはフォールバック)
 * ========================================================================== */

/**
 * カスタムの variantPaths(キー→blob URL配列)を、基底(EFFECT_SOUND_VARIANT_PATHS相当)へ
 *   カスタム優先で上書きマージする純関数。未割当キーは基底の値のまま(フォールバック)。
 *   カスタム側にキーがあっても配列が空なら基底を残す(空配列で無音化させない=安全側)。
 * @param {Readonly<Record<string, ReadonlyArray<string>>>} basePaths
 * @param {Readonly<Record<string, ReadonlyArray<string>>>} customPaths
 * @returns {Record<string, ReadonlyArray<string>>}
 */
export function mergeVariantPaths(basePaths, customPaths) {
  const base = basePaths && typeof basePaths === 'object' ? basePaths : {};
  const custom = customPaths && typeof customPaths === 'object' ? customPaths : {};
  /** @type {Record<string, ReadonlyArray<string>>} */
  const merged = { ...base };
  for (const [key, list] of Object.entries(custom)) {
    if (Array.isArray(list) && list.length > 0) merged[key] = list;
  }
  return merged;
}

/**
 * 単一パス版のマージ(paths用)。mergeVariantPathsの単一パス版。
 * @param {Readonly<Record<string, string>>} basePaths
 * @param {Readonly<Record<string, string>>} customPaths
 * @returns {Record<string, string>}
 */
export function mergeSinglePaths(basePaths, customPaths) {
  const base = basePaths && typeof basePaths === 'object' ? basePaths : {};
  const custom = customPaths && typeof customPaths === 'object' ? customPaths : {};
  /** @type {Record<string, string>} */
  const merged = { ...base };
  for (const [key, path] of Object.entries(custom)) {
    if (typeof path === 'string' && path) merged[key] = path;
  }
  return merged;
}

/**
 * getUrlヘルパ(純関数・テスト可能): blob: URLは素通し、それ以外は渡された getURL 関数に委譲する。
 * @param {string} path
 * @param {(p: string) => string} chromeGetUrl chrome.runtime.getURL相当
 * @returns {string}
 */
export function getUrlForCustomSound(path, chromeGetUrl) {
  const p = String(path || '');
  if (p.startsWith('blob:')) return p;
  return typeof chromeGetUrl === 'function' ? chromeGetUrl(p) : p;
}

/**
 * assignments配列からキー→gainの参照関数を作る純関数。未割当キーは既定gain。
 * @param {Array<{ key: string, gain?: number }>} assignments
 * @returns {(kind: string) => number}
 */
export function gainForAssignments(assignments) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const a of Array.isArray(assignments) ? assignments : []) {
    if (a && a.key) {
      const g = typeof a.gain === 'number' && Number.isFinite(a.gain) ? Math.max(0, Math.min(1, a.gain)) : CUSTOM_SOUND_DEFAULT_GAIN;
      map.set(String(a.key), g);
    }
  }
  return (kind) => (map.has(String(kind)) ? map.get(String(kind)) : CUSTOM_SOUND_DEFAULT_GAIN);
}

/**
 * assignments(key→ids)+ blobId→url の対応から customVariantPaths を組み立てる純関数
 *   (URL.createObjectURLの副作用そのものは呼び出し側=副作用境界で行い、ここには
 *   「id→url」の対応map(idToUrl)を渡してもらう=純関数のまま組み立てだけ行う)。
 * @param {Array<{ key: string, ids: string[] }>} assignments
 * @param {Map<string, string>} idToUrl Blob id → 生成済みURL(blob:またはその他)
 * @returns {Record<string, string[]>} 割当済みURLが1件も無いキーは含めない(=フォールバックに委ねる)
 */
export function buildCustomVariantPathsFromAssignments(assignments, idToUrl) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const a of Array.isArray(assignments) ? assignments : []) {
    if (!a || !a.key || !Array.isArray(a.ids)) continue;
    const urls = a.ids.map((id) => idToUrl.get(String(id))).filter((u) => typeof u === 'string' && u);
    if (urls.length > 0) out[a.key] = urls;
  }
  return out;
}

/* ============================================================================
 * 純関数部: 決定論の順繰りローテーション(§1.5)
 * ========================================================================== */

/** キーごとの発生通し番号(コンテキスト内メモリで十分・リロードで1に戻っても当否に無関係)。 */
const _rotationCounters = Object.create(null);

/**
 * キーごとの発生通し番号(counter)を保持し、`(counter mod N)/N` を返す注入rngを作る
 *   (council/pachinko-ultimate-SYNTHESIS.md §1.5)。
 *
 * effectSoundPlayer.js の `resolveEffectSoundPath` は候補配列長Nを見て
 *   `Math.floor(rng() * N) % N` でインデックスを選ぶ。ここで作る rng は呼び出しのたびに
 *   キーごとのcounterを1つ進め、`(counter mod N)/N` を返す。Nは resolveEffectSoundPath が
 *   実際に使う候補配列の長さそのものなので、この関数の引数として受け取っておく必要がある
 *   (呼び出し側=venueBar/popupがカスタム優先マージ後の実際の配列長を渡す)。
 *   結果、`Math.floor(((counter mod N)/N) * N)` は counter mod N に一致し、
 *   変奏は 1→2→3→…→1 の完全決定論順繰りになる(Math.random は一切不使用)。
 *
 * @param {string} kind
 * @param {number} variantsLength 現在有効な候補配列の長さN(呼び出し時点でカスタム優先マージ後)
 * @returns {() => number} resolveEffectSoundPath の deps.rng にそのまま渡せる関数
 */
export function rotationRngFor(kind, variantsLength) {
  const k = String(kind || '');
  const n = Math.max(1, Math.floor(Number(variantsLength) || 1));
  return () => {
    const counter = _rotationCounters[k] || 0;
    _rotationCounters[k] = counter + 1;
    const mod = counter % n;
    return mod / n;
  };
}

/** テスト用: 順繰りカウンタをリセットする。 */
export function _resetRotationCountersForTest() {
  for (const k of Object.keys(_rotationCounters)) delete _rotationCounters[k];
}

/* ============================================================================
 * ローカル自動同梱(scripts/install-local-sounds.mjs が展開した sound/custom/manifest.json)
 * ========================================================================== */

/**
 * `sound/custom/manifest.json` を fetch して id→ファイル名マップを返す(副作用部・注入可能)。
 *   scripts/install-local-sounds.mjs が `npm run copy:ext` の一環でローカル展開先
 *   (リポジトリ外・例 C:\nicolive-ext)にコピーした音源の一覧。未展開/取得失敗時は静かに null
 *   (絶対制約: エラーにしない・ノイズにしない)。
 * @param {{ getUrl?: (p: string) => string, fetchImpl?: typeof fetch }} [deps]
 * @returns {Promise<Record<string, string>|null>}
 */
export async function loadLocalBundledSoundManifest(deps = {}) {
  const getUrl = typeof deps.getUrl === 'function'
    ? deps.getUrl
    : (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function'
      ? /** @param {string} p */ (p) => chrome.runtime.getURL(p)
      : /** @param {string} p */ (p) => p);
  const fetchImpl = typeof deps.fetchImpl === 'function' ? deps.fetchImpl : (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) return null;
  try {
    const url = getUrl('sound/custom/manifest.json');
    const res = await fetchImpl(url);
    if (!res || !res.ok) return null;
    const json = await res.json();
    const files = json && typeof json === 'object' ? json.files : null;
    if (!files || typeof files !== 'object') return null;
    /** @type {Record<string, string>} */
    const out = {};
    for (const [id, filename] of Object.entries(files)) {
      if (typeof filename === 'string' && filename) out[String(id)] = filename;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * プリセット(customSoundPreset.js の CUSTOM_SOUND_PRESET)の各キーの id 列を、ローカル同梱
 *   manifest の id→ファイル名対応を使って `sound/custom/<ファイル名>` のパス列へ変換する純関数。
 *   manifest に無い id(未展開・未調達)は欠番のまま詰める(=配列に含めない)。
 *   manifest が null(未展開環境)なら空オブジェクトを返す(呼び出し側は基底/IDBへフォールバック)。
 * @param {Readonly<Record<string, ReadonlyArray<{ id: string }>>>} preset CUSTOM_SOUND_PRESET
 * @param {Record<string, string>|null} manifestFiles loadLocalBundledSoundManifest の戻り値
 * @returns {Record<string, ReadonlyArray<string>>} キーごとの変奏パス配列(1件も解決できないキーは含めない)
 */
export function buildLocalVariantPaths(preset, manifestFiles) {
  /** @type {Record<string, string[]>} */
  const out = {};
  if (!manifestFiles || typeof manifestFiles !== 'object') return out;
  const p = preset && typeof preset === 'object' ? preset : {};
  for (const [key, list] of Object.entries(p)) {
    if (!Array.isArray(list)) continue;
    const paths = [];
    for (const asset of list) {
      const filename = asset && asset.id ? manifestFiles[String(asset.id)] : undefined;
      if (typeof filename === 'string' && filename) paths.push(`sound/custom/${filename}`);
    }
    if (paths.length > 0) out[key] = paths;
  }
  return out;
}

/* ============================================================================
 * 副作用部: venueBar.js / popup-entry.js 共通の再生時ランタイム状態構築(§1.4)
 * ========================================================================== */

/**
 * 起動時+customSoundRev変化時に一度呼ぶ想定の統合ローダ。IDBの assignments を読み、
 *   割当済みBlobだけ URL.createObjectURL して customVariantPaths を組み立てる
 *   (割当済みBlobのみ=85本全量でも無条件に全部URL化しない・設計書§1.4)。
 *   旧URL集合を渡すと revokeObjectURL で解放する(呼び出し側が前回の戻り値の urlsById を渡す)。
 *
 * 合成順(優先度高→低): IDB割当(ユーザーが取込UIで明示指定) > ローカル同梱(install-local-sounds.mjs
 *   が展開したmanifest由来・「手動取込なしで自動で鳴る」本実装の主目的) > 呼び出し側が持つ基底の
 *   同梱合成音(EFFECT_SOUND_VARIANT_PATHS)。IDB割当キーのみ従来どおり assignments.gain を反映し、
 *   ローカル同梱キーは gain=1.0(CUSTOM_SOUND_DEFAULT_GAIN)。
 * @param {{ previousUrlsById?: Map<string, string>, getUrl?: (p: string) => string, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{
 *   customVariantPaths: Record<string, ReadonlyArray<string>>,
 *   gainFor: (kind: string) => number,
 *   urlsById: Map<string, string>,
 *   localBundledCount: number
 * }>}
 */
export async function loadCustomSoundRuntimeState(opts = {}) {
  /** @type {{ customVariantPaths: Record<string, ReadonlyArray<string>>, gainFor: () => number, urlsById: Map<string, string>, localBundledCount: number }} */
  const empty = { customVariantPaths: {}, gainFor: () => CUSTOM_SOUND_DEFAULT_GAIN, urlsById: new Map(), localBundledCount: 0 };

  // ローカル同梱は IndexedDB の有無に関係なく試す(manifest.jsonが無ければ静かに空)。
  /** @type {Record<string, ReadonlyArray<string>>} */
  let localVariantPaths = {};
  let localBundledCount = 0;
  try {
    const manifestFiles = await loadLocalBundledSoundManifest({ getUrl: opts.getUrl, fetchImpl: opts.fetchImpl });
    if (manifestFiles) {
      localBundledCount = Object.keys(manifestFiles).length;
      localVariantPaths = buildLocalVariantPaths(CUSTOM_SOUND_PRESET, manifestFiles);
    }
  } catch {
    localVariantPaths = {};
    localBundledCount = 0;
  }

  if (!isCustomSoundDbAvailable()) {
    return { ...empty, customVariantPaths: localVariantPaths, localBundledCount };
  }
  try {
    // 前回発行分のBlob URLは失効させる(§1.4「旧URLは割り当て変更時にrevokeObjectURL」)。
    if (opts.previousUrlsById instanceof Map) {
      for (const url of opts.previousUrlsById.values()) {
        try { URL.revokeObjectURL(url); } catch { /* no-op */ }
      }
    }
    const db = await openCustomSoundDb();
    const assignments = await listAssignments(db);
    /** @type {Map<string, string>} */
    const urlsById = new Map();
    for (const a of assignments) {
      for (const id of Array.isArray(a.ids) ? a.ids : []) {
        if (urlsById.has(id)) continue;
        const rec = await getSoundBlob(db, id);
        if (rec?.blob instanceof Blob) urlsById.set(id, URL.createObjectURL(rec.blob));
      }
    }
    const idbVariantPaths = buildCustomVariantPathsFromAssignments(assignments, urlsById);
    // IDB割当 > ローカル同梱 の優先度でマージ(mergeVariantPathsは第2引数=customを優先するため
    //   base=ローカル同梱, custom=IDB割当 の順で呼ぶ)。
    const customVariantPaths = mergeVariantPaths(localVariantPaths, idbVariantPaths);
    const idbGainFor = gainForAssignments(assignments);
    const assignedKeys = new Set(assignments.map((a) => String(a.key)));
    // ローカル同梱キーは gain=1.0固定。IDB割当済みキーのみ assignments.gain を反映する。
    /** @param {string} kind */
    const gainFor = (kind) => (assignedKeys.has(String(kind)) ? idbGainFor(kind) : CUSTOM_SOUND_DEFAULT_GAIN);
    return { customVariantPaths, gainFor, urlsById, localBundledCount };
  } catch {
    return { ...empty, customVariantPaths: localVariantPaths, localBundledCount };
  }
}
