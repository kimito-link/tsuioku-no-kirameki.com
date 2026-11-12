// ytLocalAssetUrls.js — YouTube の視聴ページの中の会場(content script)で、拡張の中の画像・音を
//   ネットワークを通さずに読む(blob: に置き換える)。
//
// 理由(2026-11-04 りんく実機「すべて削除を何回押しても無限に出てくる」):
//   YouTube の視聴ページは `connection-allowlist-report-only` という見張りを付けていて、許可した
//   Google/YouTube の置き場所以外へ「つなぎに行った」読み込みを全部報告する(止めはしない=画像は出る)。
//   会場のキャラは表情・口が変わるたびに chrome-extension:// の画像を読み直すので、そのたびに
//   エラー一覧へ「Unsafe attempt to load URL chrome-extension://…」が積もった。ニコ生のページにはこの見張りが無い。
//   blob: はページの中で完結する(どこにもつながない)ので報告されない。中身は同じファイル。
//
// 仕組み: chrome.runtime.getURL(rel) を、読み済みなら blob: を返すように包む(ニコ生版の venueBar.js は
//   画像を出す直前に毎回 getURL を呼ぶので、そのまま効く)。まだなら元の URL を返し、裏で読み込む。

/** blob: に読み替えられる拡張の中のファイル(画像・音)。 */
export const YT_LOCAL_ASSET_RE = /^(?:images|sound)\/[\w\-./]+\.(?:png|jpe?g|gif|webp|svg|mp3|ogg|wav)$/i;

/** @type {Map<string, string>} rel → blob: */
const ready = new Map();
/** @type {Map<string, Promise<string>>} */
const loading = new Map();

/** @param {string} rel */
function mimeOf(rel) {
  const ext = (rel.split('.').pop() || '').toLowerCase();
  return (
    { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' }[ext] ||
    'application/octet-stream'
  );
}

/** @param {string} b64 @param {string} mime */
function b64ToBlobUrl(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/**
 * @param {string} rel 拡張ルートからの相対パス
 * @returns {Promise<string>} blob: (失敗なら '')
 */
export function ytLoadLocalAsset(rel) {
  const key = String(rel || '').replace(/^\/+/, '');
  if (!YT_LOCAL_ASSET_RE.test(key) || key.includes('..')) return Promise.resolve('');
  const hit = ready.get(key);
  if (hit) return Promise.resolve(hit);
  const p = loading.get(key);
  if (p) return p;
  const job = (async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'YT_GET_EXT_ASSET', path: key });
      if (!res || !res.ok || typeof res.b64 !== 'string' || !res.b64) return '';
      const url = b64ToBlobUrl(res.b64, String(res.mime || mimeOf(key)));
      ready.set(key, url);
      return url;
    } catch {
      return '';
    } finally {
      loading.delete(key);
    }
  })();
  loading.set(key, job);
  return job;
}

/** @param {string} url @returns {string} 拡張の中の URL なら相対パス、違えば '' */
function relOfExtUrl(url) {
  try {
    const base = realGetURL ? realGetURL('') : '';
    const s = String(url || '');
    return base && s.startsWith(base) ? s.slice(base.length).split(/[?#]/)[0] : '';
  } catch {
    return '';
  }
}

/** @type {((p: string) => string) | null} */
let realGetURL = null;

/**
 * 拡張の中の URL を、読み済みなら blob: に置き換える(まだなら裏で読み始めて元のまま返す)。
 * @param {string} url
 * @returns {string}
 */
export function ytLocalAssetUrlFor(url) {
  const rel = relOfExtUrl(url);
  if (!rel) return url;
  const hit = ready.get(rel);
  if (hit) return hit;
  void ytLoadLocalAsset(rel);
  return url;
}

/** chrome.runtime.getURL を包む(一度だけ)。 */
export function ytInstallLocalAssetUrls() {
  try {
    const rt = /** @type {any} */ (globalThis).chrome?.runtime;
    if (!rt || typeof rt.getURL !== 'function' || rt.getURL.__ytLocalAsset) return;
    const orig = rt.getURL.bind(rt);
    realGetURL = orig;
    /** @param {string} p */
    const wrapped = (p) => {
      const url = orig(p);
      const key = String(p || '').replace(/^\/+/, '');
      if (!YT_LOCAL_ASSET_RE.test(key)) return url;
      const hit = ready.get(key);
      if (hit) return hit;
      void ytLoadLocalAsset(key);
      return url;
    };
    wrapped.__ytLocalAsset = true;
    try {
      rt.getURL = wrapped;
    } catch {
      Object.defineProperty(rt, 'getURL', { configurable: true, writable: true, value: wrapped });
    }
  } catch {
    /* 包めなければ元のまま(画像は出る・報告が残るだけ) */
  }
}

/**
 * 先に読んでおく(会場を出す前)。時間切れでも先へ進む(読み終わった分から blob: になる)。
 * @param {string[]} rels
 * @param {number} [timeoutMs]
 */
export function ytPrefetchLocalAssets(rels, timeoutMs = 2500) {
  const all = Promise.all(rels.map((r) => ytLoadLocalAsset(r)));
  return Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
}

/**
 * 音など、会場を出すのを待たせなくてよいものを裏で1本ずつ読む(遅い PC で一度に詰め込まない)。
 *   ギフト音は最初の1回目から blob: で鳴らすため(2026-11-12: YouTube の会場でギフト音が
 *   「Unsafe attempt to load URL chrome-extension://…/sound/tiers/gift-*.mp3」で6回弾かれていた)。
 * @param {string[]} rels
 * @param {{ load?: (rel: string) => Promise<string>, gapMs?: number }} [deps]
 * @returns {Promise<number>} blob: にできた本数
 */
export async function ytPrefetchLocalAssetsInOrder(rels, deps = {}) {
  const load = deps.load || ytLoadLocalAsset;
  const gapMs = typeof deps.gapMs === 'number' ? deps.gapMs : 50;
  let ok = 0;
  for (const rel of rels) {
    try {
      if (await load(rel)) ok++;
    } catch {
      /* 1本読めなくても残りは読む */
    }
    if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
  }
  return ok;
}
