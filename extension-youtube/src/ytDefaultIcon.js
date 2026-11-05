// ytDefaultIcon.js — YouTube の「最初からの文字アイコン」(色付きの丸に1文字)を画像から見分ける。
//
// りんく(2026-11-05)「自分でちゃんと設定している人は認知してほしい」= 自分でアイコンを設定した人はりんく欄、
//   最初からの文字アイコンのままの人はこん太欄。URL の形(/ytc/)だけでは写真の人も同じ形なので見分けられない。
// 見分け方(0.1.101・PC の実データ 2配信65人で試験・文字アイコン9人を全部当て、誤りなし):
//   URL に /ytc/ があり、真ん中の丸の中で「いちばん多い色(=背景)の割合」が 0.62 以上、かつその色が白に近くない
//   (白い背景の書道や絵を外す・0.1.105)。
//   0.1.99 の「割合0.80以上・色6以下」は、2文字や画数の多い字(ちゃ・メ・玄・Z)を取りこぼした(実機 4/9)。
//   画像は s64 で見る(試験と同じ大きさ)。
// ★件数が少ない試験で決めた値。迷うときは「自分で設定した人」(りんく欄)に倒す=間違えても認知が減らない側。

// v2: 見分け方を変えたので、v1 の結果(取りこぼしの 0)は使わない
// v3: 人の形(人影)の既定アイコンも見分けるようにしたので、v2 の結果(人影の 0)は使わない
// v4: 暗い背景の文字アイコン(緑の「は」)を取りこぼしたので見分け方を変えた
export const YT_DEFAULT_ICON_STORE_KEY = 'yt_default_icon_v4';

/**
 * 画素から見分けの数字を出す(純関数・試験用に分けてある)。
 * @param {Uint8ClampedArray|number[]} rgba 幅 w × 高さ h の RGBA
 * @param {number} w
 * @param {number} h
 * @returns {{ t1: number, c5: number, bgSat: number, bgKey: number }}
 */
export function ytIconColorStats(rgba, w, h) {
  /** @type {Map<number, number>} */
  const counts = new Map();
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const r = Math.min(w, h) * 0.45;
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (y * w + x) * 4;
      const k = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
      counts.set(k, (counts.get(k) || 0) + 1);
      total += 1;
    }
  }
  if (!total) return { t1: 0, c5: 0, bgSat: 0, bgKey: 0 };
  let max = 0;
  let maxKey = 0;
  let c5 = 0;
  for (const [k, n] of counts) {
    if (n > max) {
      max = n;
      maxKey = k;
    }
    if (n / total >= 0.005) c5 += 1;
  }
  const ch = [(maxKey >> 8) & 15, (maxKey >> 4) & 15, maxKey & 15];
  return { t1: max / total, c5, bgSat: Math.max(...ch) - Math.min(...ch), bgKey: maxKey };
}

/**
 * @param {string} url
 * @param {{ t1: number, bgSat?: number, bgKey: number }} stats
 */
export function ytLooksLikeDefaultLetterIcon(url, stats) {
  // 0.1.105: 「背景が色付き(bgSat≥5)」だと暗い背景(濃い緑の「は」・bgSat 4)を落とした。外したいのは白い背景の絵・書道
  //   なので「背景が白に近くない(3チャンネルとも16段で12以上、ではない)」にする(3配信73人で文字10/10・誤り0)。
  const k = Number(stats.bgKey) || 0;
  const nearWhite = ((k >> 8) & 15) >= 12 && ((k >> 4) & 15) >= 12 && (k & 15) >= 12;
  return /\/ytc\//.test(String(url || '')) && stats.t1 >= 0.62 && !nearWhite;
}

/**
 * 0.1.104 りんく画面(灰色の人の形 @森…・前の配信の紫の人影): YouTube の「人の形」の既定アイコン。
 *   一色の背景に明るい頭と肩。色では分からない(灰色は色付きでない)ので、形の重なり(IoU)で見る。
 *   PC 実データ 72人で 人影 2/2(IoU .92)・誤り0(人影以外の最大 .49・文字アイコンは .03〜.19)。
 * @param {Uint8ClampedArray|number[]} rgba
 * @param {number} w
 * @param {number} h
 * @param {number} bgKey ytIconColorStats の bgKey(いちばん多い色)
 */
export function ytIconSilhouetteIoU(rgba, w, h, bgKey) {
  const bg = [((bgKey >> 8) & 15) * 16 + 8, ((bgKey >> 4) & 15) * 16 + 8, (bgKey & 15) * 16 + 8];
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const r = Math.min(w, h) * 0.45;
  let inter = 0;
  let union = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (y * w + x) * 4;
      const fg = Math.abs(rgba[i] - bg[0]) + Math.abs(rgba[i + 1] - bg[1]) + Math.abs(rgba[i + 2] - bg[2]) > 60;
      const nx = (x - cx) / (w / 2);
      const ny = (y - cy) / (h / 2);
      const head = nx * nx + (ny + 0.25) ** 2 <= 0.33 * 0.33;
      const body = ny > 0.25 && (nx / 0.72) ** 2 + ((ny - 0.85) / 0.6) ** 2 <= 1;
      const tpl = head || body;
      if (fg && tpl) inter += 1;
      if (fg || tpl) union += 1;
    }
  }
  return union ? inter / union : 0;
}

/**
 * 最初からのアイコン(文字アイコン・人の形)か。
 * @param {string} url
 * @param {Uint8ClampedArray|number[]} rgba
 * @param {number} w
 * @param {number} h
 */
export function ytLooksLikeDefaultIcon(url, rgba, w, h) {
  if (!/\/ytc\//.test(String(url || ''))) return false;
  const stats = ytIconColorStats(rgba, w, h);
  if (ytLooksLikeDefaultLetterIcon(url, stats)) return true;
  return ytIconSilhouetteIoU(rgba, w, h, stats.bgKey) >= 0.7;
}

/** 同じ人の顔は大きさ違いの URL で来るので、大きさを外して鍵にする */
export function ytIconCacheKey(url) {
  return String(url || '').replace(/=s\d+[^/]*$/, '');
}

/** @param {string} url */
function s64Url(url) {
  const u = String(url || '');
  return /=s\d+/.test(u) ? u.replace(/=s\d+/, '=s64') : u;
}

/**
 * 見分けた結果を覚えておく入れ物(画面ごとに1つ)。結果は storage にも残して、次に開いたときは見直さない。
 * @param {any} chromeApi
 * @param {() => void} [onLearned] 新しく見分けがついたとき(描き直しのきっかけ)
 */
export function makeYtDefaultIconJudge(chromeApi, onLearned) {
  /** @type {Map<string, boolean>} */
  const known = new Map();
  /** @type {Set<string>} */
  const pending = new Set();
  /** @type {string[]} */
  const queue = [];
  let running = 0;
  let saveTimer = 0;
  let loaded = false;

  try {
    void Promise.resolve(chromeApi?.storage?.local?.get?.(YT_DEFAULT_ICON_STORE_KEY))
      .then((bag) => {
        const saved = bag?.[YT_DEFAULT_ICON_STORE_KEY];
        if (saved && typeof saved === 'object') {
          for (const [k, v] of Object.entries(saved)) if (!known.has(k)) known.set(k, v === 1 || v === true);
          if (known.size) onLearned?.();
        }
      })
      .catch(() => {})
      .finally(() => {
        loaded = true;
        pump();
      });
  } catch {
    loaded = true;
  }

  function save() {
    if (saveTimer) return;
    saveTimer = /** @type {any} */ (setTimeout(() => {
      saveTimer = 0;
      /** @type {Record<string, number>} */
      const obj = {};
      // 増えすぎないように新しい方から 3000 件
      const entries = [...known.entries()].slice(-3000);
      for (const [k, v] of entries) obj[k] = v ? 1 : 0;
      try {
        void Promise.resolve(chromeApi?.storage?.local?.set?.({ [YT_DEFAULT_ICON_STORE_KEY]: obj })).catch(() => {});
      } catch {
        /* 残せなくても今の画面では使える */
      }
    }, 2000));
  }

  /** @param {string} url */
  async function classify(url) {
    const res = await fetch(s64Url(url), { credentials: 'omit' });
    if (!res.ok) throw new Error(String(res.status));
    const bmp = await createImageBitmap(await res.blob());
    const w = 64;
    const h = 64;
    const cv = new OffscreenCanvas(w, h);
    const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (cv.getContext('2d'));
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return ytLooksLikeDefaultIcon(url, ctx.getImageData(0, 0, w, h).data, w, h);
  }

  function pump() {
    if (!loaded) return;
    while (running < 2 && queue.length) {
      const url = /** @type {string} */ (queue.shift());
      const key = ytIconCacheKey(url);
      if (known.has(key)) {
        pending.delete(key);
        continue;
      }
      running += 1;
      classify(url)
        .then((isDefault) => {
          known.set(key, isDefault);
          save();
          if (isDefault) onLearned?.();
        })
        .catch(() => {
          known.set(key, false); // 取れない顔は「自分で設定した人」扱い(りんく欄のまま)
        })
        .finally(() => {
          pending.delete(key);
          running -= 1;
          pump();
        });
    }
  }

  return {
    /**
     * 別の画面(会場など)が見分けて残した結果を取り込む。
     * @param {unknown} saved
     */
    merge(saved) {
      if (!saved || typeof saved !== 'object') return;
      for (const [k, v] of Object.entries(saved)) known.set(k, v === 1 || v === true);
    },
    /**
     * 最初からの文字アイコンか。まだ分からないときは false を返し、裏で見に行く。
     * @param {string} url
     */
    isDefault(url) {
      const u = String(url || '');
      if (!/^https:\/\/yt\d\.(ggpht|googleusercontent)\.com\//.test(u) || !/\/ytc\//.test(u)) return false;
      const key = ytIconCacheKey(u);
      const v = known.get(key);
      if (v !== undefined) return v;
      if (!pending.has(key) && typeof fetch === 'function' && typeof OffscreenCanvas === 'function') {
        pending.add(key);
        queue.push(u);
        pump();
      }
      return false;
    },
  };
}
