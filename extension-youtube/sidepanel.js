// sidepanel.js — YouTube Live 3レーン・通貨別応援者ランキング・読み上げ設定の表示バンドル
/* eslint-disable */
(() => {
  // src/lib/htmlText.js
  function safeHttpUrl(v) {
    const s = String(v == null ? "" : v).trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }
  function formatNumberJa(n) {
    const v = Number(n);
    return (Number.isFinite(v) ? v : 0).toLocaleString("ja-JP");
  }

  // src/lib/anonymousIdenticon.js
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  var LINE = "#332a26";
  var SKIN_TONES = ["#ffeede", "#ffe6cf", "#fdf0e4", "#f8dfc8"];
  var HAIR_COLORS = [
    ["#f29b38", "#ffc97e"],
    ["#3a3534", "#6b6360"],
    ["#8a5a2b", "#c08c50"],
    ["#e88bb1", "#ffc3da"],
    ["#5b87c5", "#9cc0ea"],
    ["#7aa45a", "#b4d59a"],
    ["#e9c25a", "#ffe6a0"],
    ["#d4543a", "#f59679"],
    ["#8d6bb0", "#c4a8e0"],
    ["#8f8f8f", "#c9c9c9"],
    ["#4ba596", "#92d5c9"],
    ["#a4683f", "#d49a6e"]
  ];
  var EYES = [
    // ぱっちり（白目+2色虹彩+ハイライト2つ）
    (iris, irisDark) => `<ellipse cx="23.5" cy="37" rx="5" ry="6.6" fill="#fff" stroke="${LINE}" stroke-width="2.2"/><ellipse cx="40.5" cy="37" rx="5" ry="6.6" fill="#fff" stroke="${LINE}" stroke-width="2.2"/><ellipse cx="23.5" cy="38" rx="3.2" ry="4.4" fill="${irisDark}"/><ellipse cx="40.5" cy="38" rx="3.2" ry="4.4" fill="${irisDark}"/><ellipse cx="23.5" cy="39.2" rx="2" ry="2.6" fill="${iris}"/><ellipse cx="40.5" cy="39.2" rx="2" ry="2.6" fill="${iris}"/><circle cx="22" cy="35.4" r="1.6" fill="#fff"/><circle cx="39" cy="35.4" r="1.6" fill="#fff"/><circle cx="25.2" cy="40.2" r="0.8" fill="#fff" opacity="0.9"/><circle cx="42.2" cy="40.2" r="0.8" fill="#fff" opacity="0.9"/>`,
    // にこにこ閉じ目（∩・太線）
    () => `<path d="M18.5 38 q5 -6.5 10 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M35.5 38 q5 -6.5 10 0" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    // ジト目（まぶた直線+下半分の虹彩）
    (iris, irisDark) => `<path d="M18.5 35 l10 0" stroke="${LINE}" stroke-width="2.8" stroke-linecap="round"/><path d="M35.5 35 l10 0" stroke="${LINE}" stroke-width="2.8" stroke-linecap="round"/><path d="M20.5 35.8 a3.6 4 0 0 0 7.2 0 z" fill="${irisDark}"/><path d="M37.5 35.8 a3.6 4 0 0 0 7.2 0 z" fill="${irisDark}"/><path d="M22 35.8 a2 2.2 0 0 0 4 0 z" fill="${iris}"/><path d="M39 35.8 a2 2.2 0 0 0 4 0 z" fill="${iris}"/>`
  ];
  var MOUTHS = [
    () => `<path d="M27.5 46.5 q2.3 2.6 4.5 0 q2.2 2.6 4.5 0" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    () => `<path d="M27 46 a5 4.6 0 0 0 10 0 z" fill="#9e3a30" stroke="${LINE}" stroke-width="1.8"/><path d="M29.5 49.2 a2.6 1.8 0 0 1 5 0 z" fill="#e9756a"/>`,
    () => `<path d="M27 46 q5 4.4 10 0" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
  ];
  var HAIRS = [
    // ボブ+ぱっつんギザ（りんく系）
    (c, hi) => `<path d="M8 44 q-2 -26 24 -28 q26 2 24 28 l-5 3 q3 -8 1 -14 l-3 6 -3 -8 -4 6 -4 -8 -3 7 -4 -7 -4 8 -4 -6 -3 8 -3 -6 q-2 6 1 14 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 24 q8 -7 18 -7 q10 0 18 7 q-8 -3 -18 -3 q-10 0 -18 3 z" fill="${hi}" opacity="0.85"/>`,
    // 外はねショート（こんた系）
    (c, hi) => `<path d="M9 42 q-7 -4 -3 -10 q-6 -2 0 -8 q2 -12 26 -12 q24 0 26 12 q6 6 0 8 q4 6 -3 10 l-4 1 q2 -6 0 -10 l-4 5 -3 -9 -5 6 -5 -9 -4 8 -5 -7 -4 9 -4 -5 q-2 4 0 10 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M15 22 q8 -6 17 -6 q9 0 17 6 q-8 -2.5 -17 -2.5 q-9 0 -17 2.5 z" fill="${hi}" opacity="0.85"/>`,
    // ロング風（たぬ姉系・髪が顔の横を流れ落ちる）
    (c, hi) => `<path d="M10 58 q-4 -18 -2 -30 q4 -14 24 -14 q20 0 24 14 q2 12 -2 30 l-6 -2 q3 -12 2 -22 l-4 6 -3 -9 -5 6 -4 -9 -4 8 -5 -7 -4 8 -4 -5 q-1 10 2 22 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M15 23 q8 -6 17 -6 q9 0 17 6 q-8 -2.5 -17 -2.5 q-9 0 -17 2.5 z" fill="${hi}" opacity="0.85"/>`,
    // ふんわりマッシュ
    (c, hi) => `<path d="M8 40 q-2 -25 24 -25 q26 0 24 25 q-1 5 -5 6 q2 -5 1 -9 l-4 5 -3 -7 -5 5 -4 -7 -4 6 -4 -6 -4 7 -5 -5 -3 7 -4 -5 q-1 4 1 9 q-4 -1 -5 -6 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 24 q9 -6.5 18 -6.5 q9 0 18 6.5 q-9 -3 -18 -3 q-9 0 -18 3 z" fill="${hi}" opacity="0.85"/>`
  ];
  var ACCENTS = [
    (c) => `<path d="M32 16 q-2 -8 4 -11 q-1 5 1 7 q3 -3 7 -2 q-5 2 -6 7 z" fill="${c}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>`,
    (c) => `<path d="M13 26 q-3 -12 3 -16 q6 3 7 13 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M51 26 q3 -12 -3 -16 q-6 3 -7 13 z" fill="${c}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/><path d="M15.5 24 q-1.5 -7 1.5 -10 q3 2 4 8 z" fill="#fff" opacity="0.75"/><path d="M48.5 24 q1.5 -7 -1.5 -10 q-3 2 -4 8 z" fill="#fff" opacity="0.75"/>`,
    () => ""
  ];
  function shade(hex, f) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return "#5a4636";
    const c = (x) => Math.max(0, Math.min(255, Math.floor(parseInt(x, 16) * f)));
    return `rgb(${c(m[1])},${c(m[2])},${c(m[3])})`;
  }
  var IDENTICON_CACHE_MAX = 2e3;
  var identiconCache = /* @__PURE__ */ new Map();
  function anonymousIdenticonDataUrl(userId, sizePx = 64) {
    const s = String(userId || "").trim();
    if (!s) return "";
    const n = Math.max(16, Math.min(128, Number(sizePx) || 64));
    const cacheKey = `${n}|${s}`;
    const hit = identiconCache.get(cacheKey);
    if (hit !== void 0) {
      identiconCache.delete(cacheKey);
      identiconCache.set(cacheKey, hit);
      return hit;
    }
    const h = hashString(s);
    const hue = (h >>> 15) % 360;
    const bg = `hsl(${hue},55%,90%)`;
    const skin = SKIN_TONES[h % SKIN_TONES.length];
    const [hairC, hairHi] = HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length];
    const iris = shade(hairC, 0.9);
    const irisDark = shade(hairC, 0.45);
    const eyes = EYES[(h >>> 7) % EYES.length];
    const mouth = MOUTHS[(h >>> 10) % MOUTHS.length];
    const hairShape = HAIRS[(h >>> 12) % HAIRS.length];
    const accent = ACCENTS[(h >>> 21) % ACCENTS.length];
    const blushStrong = (h >>> 20 & 1) === 1;
    const blush = `<ellipse cx="17" cy="44" rx="4.4" ry="2.6" fill="#ff9d9d" opacity="${blushStrong ? 0.8 : 0.45}"/><ellipse cx="47" cy="44" rx="4.4" ry="2.6" fill="#ff9d9d" opacity="${blushStrong ? 0.8 : 0.45}"/>`;
    const k = n / 64;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"><rect width="100%" height="100%" fill="${bg}"/><g transform="scale(${k})">` + accent(hairC) + `<path d="M13 38 a19 19 0 1 0 38 0 a19 21 0 0 0 -38 0 z" fill="${skin}" stroke="${LINE}" stroke-width="2.2"/>` + hairShape(hairC, hairHi) + blush + eyes(iris, irisDark) + mouth() + `</g></svg>`;
    const out = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    identiconCache.set(cacheKey, out);
    while (identiconCache.size > IDENTICON_CACHE_MAX) {
      const oldest = identiconCache.keys().next().value;
      if (oldest === void 0) break;
      identiconCache.delete(oldest);
    }
    return out;
  }

  // src/lib/voiceStyleLevelTable.js
  var VOICE_STYLE_LEVEL_TABLE = Object.freeze({
    "0": [0.084, 0.456],
    "1": [0.064, 0.432],
    "2": [0.075, 0.447],
    "3": [0.063, 0.53],
    "4": [0.086, 0.558],
    "5": [0.066, 0.469],
    "6": [0.066, 0.411],
    "7": [0.067, 0.466],
    "8": [0.08, 0.419],
    "9": [0.085, 0.375],
    "10": [0.071, 0.405],
    "11": [0.07, 0.584],
    "12": [0.074, 0.469],
    "13": [0.078, 0.456],
    "14": [0.078, 0.258],
    "15": [0.069, 0.458],
    "16": [0.082, 0.364],
    "17": [0.073, 0.437],
    "18": [0.073, 0.46],
    "19": [0.039, 0.546],
    "20": [0.08, 0.514],
    "21": [0.075, 0.677],
    "22": [0.053, 0.457],
    "23": [0.086, 0.417],
    "24": [0.074, 0.408],
    "25": [0.097, 0.363],
    "26": [0.067, 0.465],
    "27": [0.085, 0.327],
    "28": [0.065, 0.367],
    "29": [0.098, 0.645],
    "30": [0.1, 0.598],
    "31": [0.101, 0.409],
    "32": [0.074, 0.437],
    "33": [0.076, 0.422],
    "34": [0.072, 0.472],
    "35": [0.056, 0.252],
    "36": [0.06, 0.551],
    "37": [0.087, 0.37],
    "38": [0.1, 0.364],
    "39": [0.08, 0.542],
    "40": [0.073, 0.641],
    "41": [0.09, 0.578],
    "42": [0.081, 0.783],
    "43": [0.091, 0.41],
    "44": [0.088, 0.441],
    "45": [0.081, 0.294],
    "46": [0.084, 0.393],
    "47": [0.073, 0.387],
    "48": [0.089, 0.374],
    "49": [0.089, 0.361],
    "50": [0.07, 0.641],
    "51": [0.082, 0.489],
    "52": [0.089, 0.538],
    "53": [0.091, 0.497],
    "54": [0.067, 0.438],
    "55": [0.098, 0.508],
    "56": [0.098, 0.443],
    "57": [0.099, 0.472],
    "58": [0.084, 0.531],
    "59": [0.101, 0.46],
    "60": [0.114, 0.423],
    "61": [0.072, 0.354],
    "62": [0.092, 0.377],
    "63": [0.096, 0.375],
    "64": [0.094, 0.323],
    "65": [0.084, 0.381],
    "66": [0.085, 0.56],
    "67": [0.097, 0.396],
    "68": [0.077, 0.446],
    "69": [0.081, 0.592],
    "70": [0.072, 0.429],
    "71": [0.055, 0.569],
    "72": [0.073, 0.388],
    "73": [0.091, 0.488],
    "74": [0.086, 0.521],
    "75": [0.059, 0.321],
    "76": [0.055, 0.358],
    "77": [0.083, 0.465],
    "78": [0.075, 0.406],
    "79": [0.08, 0.341],
    "80": [0.093, 0.4],
    "81": [0.082, 0.338],
    "82": [0.084, 0.353],
    "83": [0.082, 0.372],
    "84": [0.095, 0.353],
    "85": [0.083, 0.442],
    "86": [0.058, 0.489],
    "87": [0.074, 0.416],
    "88": [0.09, 0.381],
    "89": [0.101, 0.46],
    "90": [0.074, 0.492],
    "91": [0.08, 0.391],
    "92": [0.071, 0.505],
    "93": [0.074, 0.546],
    "94": [0.084, 0.408],
    "95": [0.072, 0.472],
    "96": [0.091, 0.345],
    "97": [0.062, 0.42],
    "98": [0.052, 0.391],
    "99": [0.1, 0.538],
    "100": [0.077, 0.5],
    "101": [0.093, 0.594],
    "102": [0.09, 0.323],
    "103": [0.076, 0.316],
    "104": [0.095, 0.369],
    "105": [0.106, 0.46],
    "106": [0.088, 0.355],
    "107": [0.081, 0.395],
    "108": [0.081, 0.383],
    "109": [0.075, 0.394],
    "110": [0.078, 0.52],
    "111": [0.079, 0.457],
    "112": [0.059, 0.41],
    "113": [0.079, 0.419],
    "114": [0.071, 0.443],
    "115": [0.081, 0.413],
    "116": [0.073, 0.357],
    "117": [0.054, 0.509],
    "118": [0.102, 0.337],
    "119": [0.098, 0.453],
    "120": [0.101, 0.372],
    "121": [0.106, 0.402],
    "122": [0.088, 0.327],
    "123": [0.082, 0.404],
    "124": [0.089, 0.377],
    "125": [0.077, 0.424],
    "126": [0.061, 0.314]
  });
  var VOICE_PITCH_OFFSET_GRID = Object.freeze([-0.06, -0.03, 0, 0.03, 0.06]);
  var VOICE_STYLE_PITCH_RMS_FACTOR = Object.freeze({
    "0": [0.95, 1, 1.13, 1.16],
    "1": [0.63, 0.82, 1.08, 1.03],
    "2": [0.82, 0.93, 1.09, 1.18],
    "3": [0.63, 0.83, 1.28, 1.32],
    "4": [0.98, 1.01, 0.97, 0.95],
    "5": [0.63, 0.83, 0.99, 0.97],
    "6": [0.74, 0.85, 1.01, 1.15],
    "7": [0.67, 0.87, 1.1, 0.93],
    "8": [0.74, 0.87, 0.95, 0.91],
    "9": [0.69, 0.82, 1.18, 1.27],
    "10": [0.71, 0.88, 1.01, 1.04],
    "11": [0.81, 0.93, 1.14, 1.33],
    "12": [0.81, 0.91, 1.09, 1.26],
    "13": [0.8, 0.89, 1.05, 1.09],
    "14": [0.83, 0.94, 0.97, 1.06],
    "15": [0.98, 1.08, 1, 1.08],
    "16": [0.75, 0.88, 1.12, 1.19],
    "17": [0.81, 0.9, 0.99, 0.93],
    "18": [0.77, 0.87, 1.03, 1],
    "19": [1, 1, 1, 1],
    "20": [0.84, 0.91, 1.01, 1.01],
    "21": [0.83, 0.86, 1.18, 1.32],
    "22": [1, 1, 1, 1],
    "23": [1.01, 1.01, 1.02, 1.12],
    "24": [0.72, 0.88, 1.03, 1.06],
    "25": [0.52, 0.77, 1.17, 1.4],
    "26": [0.82, 0.88, 1.1, 1.12],
    "27": [0.75, 0.85, 1.21, 1.33],
    "28": [0.85, 0.94, 1.03, 1.09],
    "29": [0.78, 0.92, 1.05, 1.12],
    "30": [0.72, 0.87, 1.04, 1.07],
    "31": [0.8, 0.92, 1.01, 0.99],
    "32": [0.85, 0.92, 1.19, 1.19],
    "33": [0.84, 0.84, 1.07, 1.16],
    "34": [0.74, 0.88, 1.1, 1.15],
    "35": [0.85, 0.97, 1.1, 0.74],
    "36": [1, 1, 1, 1],
    "37": [0.69, 0.88, 1.19, 1.23],
    "38": [0.72, 0.79, 0.97, 0.7],
    "39": [0.88, 0.93, 1.09, 1.26],
    "40": [0.8, 0.91, 1.09, 1.19],
    "41": [0.89, 0.92, 1.05, 1.05],
    "42": [1.01, 0.99, 1.15, 1.3],
    "43": [0.69, 0.82, 1, 0.98],
    "44": [0.59, 0.74, 1.28, 1.64],
    "45": [0.59, 0.77, 1.19, 1.19],
    "46": [0.86, 0.92, 0.99, 0.87],
    "47": [0.76, 0.91, 1.24, 1.38],
    "48": [0.95, 0.98, 1, 0.99],
    "49": [1.14, 0.98, 1.01, 0.9],
    "50": [1, 1, 1, 1],
    "51": [0.95, 1.01, 1.06, 1.07],
    "52": [0.72, 0.87, 1.09, 1.13],
    "53": [0.94, 0.98, 1.05, 1.08],
    "54": [0.69, 0.88, 1.08, 1.02],
    "55": [0.96, 1.02, 1.01, 1.04],
    "56": [0.78, 0.93, 1.07, 1.2],
    "57": [0.91, 0.98, 1.04, 0.94],
    "58": [0.79, 0.88, 1, 0.95],
    "59": [0.74, 0.85, 1.16, 0.92],
    "60": [0.69, 0.89, 0.94, 0.91],
    "61": [0.55, 0.7, 1.4, 1.6],
    "62": [0.58, 0.78, 1.02, 0.87],
    "63": [0.75, 1.03, 0.73, 0.84],
    "64": [0.57, 0.8, 0.88, 0.62],
    "65": [0.74, 0.9, 1.07, 1.07],
    "66": [0.74, 0.91, 1, 1.02],
    "67": [0.91, 0.96, 1.02, 1.02],
    "68": [0.77, 0.89, 1.05, 1.18],
    "69": [0.9, 0.95, 1.05, 1.13],
    "70": [0.73, 0.87, 1.04, 0.87],
    "71": [1.02, 1.02, 1, 0.98],
    "72": [0.73, 0.83, 1.14, 1.27],
    "73": [0.69, 0.88, 1.11, 1.25],
    "74": [0.8, 0.9, 0.98, 0.87],
    "75": [0.7, 0.85, 1.15, 1.27],
    "76": [1.02, 0.96, 0.88, 0.79],
    "77": [0.88, 0.93, 1.04, 1],
    "78": [0.88, 0.95, 1, 1],
    "79": [0.99, 0.96, 1.09, 1.1],
    "80": [0.78, 0.9, 1.01, 0.92],
    "81": [0.96, 1, 1.02, 1.04],
    "82": [0.85, 0.92, 1.04, 1.06],
    "83": [0.94, 0.96, 1.01, 1.01],
    "84": [0.93, 0.98, 1.01, 1.01],
    "85": [0.86, 0.93, 1.07, 1.12],
    "86": [1, 1, 1, 1],
    "87": [0.99, 1.03, 1.01, 1.07],
    "88": [0.86, 0.99, 0.8, 0.92],
    "89": [1.17, 1.2, 0.92, 0.88],
    "90": [0.72, 0.82, 1.15, 1.16],
    "91": [0.68, 0.85, 1.14, 1.17],
    "92": [0.69, 0.79, 1.1, 1.21],
    "93": [0.84, 0.9, 1.11, 1.19],
    "94": [0.63, 0.87, 1.11, 1.12],
    "95": [0.56, 0.8, 1.08, 1.01],
    "96": [0.54, 0.76, 1.16, 1.32],
    "97": [0.84, 0.93, 1.07, 1.2],
    "98": [0.8, 0.86, 1.22, 1.36],
    "99": [0.79, 0.89, 1.04, 1.09],
    "100": [0.97, 1, 1.05, 1.12],
    "101": [0.72, 0.85, 1.18, 1.31],
    "102": [0.98, 0.99, 0.99, 1.06],
    "103": [0.88, 1.01, 1, 1.08],
    "104": [0.88, 0.89, 0.96, 1.09],
    "105": [0.93, 0.94, 0.93, 0.79],
    "106": [0.74, 0.88, 1.06, 1.17],
    "107": [1.27, 1.09, 0.84, 0.78],
    "108": [0.82, 0.97, 1.07, 0.99],
    "109": [0.77, 0.91, 1.05, 0.99],
    "110": [0.88, 0.97, 0.92, 1.01],
    "111": [0.74, 0.93, 0.98, 0.87],
    "112": [0.77, 0.87, 1.05, 1.13],
    "113": [0.67, 0.85, 1.05, 1.04],
    "114": [0.8, 0.91, 1.04, 1.25],
    "115": [0.94, 0.96, 1.05, 1.08],
    "116": [0.59, 0.8, 1.16, 1.37],
    "117": [1, 1, 1, 1],
    "118": [0.69, 0.83, 1.05, 1.04],
    "119": [0.87, 0.97, 1.01, 0.94],
    "120": [0.77, 0.93, 1.01, 0.93],
    "121": [0.77, 0.88, 1.03, 0.97],
    "122": [0.55, 0.73, 1.22, 1.31],
    "123": [0.57, 0.77, 1.19, 1.36],
    "124": [0.63, 0.8, 1.18, 1.2],
    "125": [0.67, 0.81, 1.24, 1.38],
    "126": [0.5, 0.68, 1.08, 0.94]
  });

  // src/lib/voicevoxClient.js
  var VOICEVOX_BASE_URL = "http://127.0.0.1:50021";

  // src/lib/youtube/ytSupportRanking.js
  var ZERO_DECIMAL_CURRENCIES = /* @__PURE__ */ new Set(["JPY", "KRW", "TWD", "VND"]);
  function buildYtChannelUrl(channelId) {
    const id = String(channelId || "").trim();
    if (/^UC[A-Za-z0-9_-]{16,32}$/.test(id)) {
      return `https://www.youtube.com/channel/${id}`;
    }
    if (id.startsWith("handle:@")) {
      const handle = id.slice("handle:".length);
      if (/^@[A-Za-z0-9_.-]+$/.test(handle)) {
        return `https://www.youtube.com/${handle}`;
      }
    }
    if (/^@[A-Za-z0-9_.-]+$/.test(id)) {
      return `https://www.youtube.com/${id}`;
    }
    return "";
  }
  function formatYtCurrencyAmount(amount, currency) {
    const code = String(currency || "").trim().toUpperCase();
    const n = Number(amount);
    if (!Number.isFinite(n)) return "—";
    if (code === "JPY") {
      return `¥${formatNumberJa(Math.round(n))}`;
    }
    if (code === "KRW") {
      return `₩${formatNumberJa(Math.round(n))}`;
    }
    if (ZERO_DECIMAL_CURRENCIES.has(code)) {
      return `${code} ${formatNumberJa(Math.round(n))}`;
    }
    const fixed = (Math.round(n * 100) / 100).toFixed(2);
    return code ? `${code} ${fixed}` : fixed;
  }
  function createYtSupportRankingAccumulator() {
    const totalsByCurrency = {};
    const currencyItemCounts = {};
    const currencyUserMap = {};
    const supporterMap = /* @__PURE__ */ new Map();
    const commenterMap = /* @__PURE__ */ new Map();
    const supporterChannelIds = /* @__PURE__ */ new Set();
    const counts = {
      superchat: 0,
      sticker: 0,
      membership: 0,
      membershipGift: 0
    };
    const byCurrency = {};
    const supporters = [];
    let cachedCommenters = [];
    const snapshot = {
      totalsByCurrency,
      currencyItemCounts,
      byCurrency,
      counts,
      supporters,
      supporterChannelIds,
      get uniqueCommenterCount() {
        return commenterMap.size;
      },
      get primaryCurrencySummary() {
        const codes = Object.keys(totalsByCurrency);
        if (codes.length === 0) {
          return { currency: "", amount: 0, itemCount: 0, formatted: "—" };
        }
        codes.sort((a, b) => {
          const countDiff = (currencyItemCounts[b] || 0) - (currencyItemCounts[a] || 0);
          if (countDiff !== 0) return countDiff;
          const amountDiff = (totalsByCurrency[b] || 0) - (totalsByCurrency[a] || 0);
          if (amountDiff !== 0) return amountDiff;
          return a.localeCompare(b);
        });
        const best = codes[0];
        const amount = totalsByCurrency[best] || 0;
        return {
          currency: best,
          amount,
          itemCount: currencyItemCounts[best] || 0,
          formatted: formatYtCurrencyAmount(amount, best)
        };
      },
      get commenters() {
        if (cachedCommenters !== null) return cachedCommenters;
        const sorted = Array.from(commenterMap.values()).sort((a, b) => {
          if (b.commentCount !== a.commentCount) return b.commentCount - a.commentCount;
          if (b.superchatTotalAmount !== a.superchatTotalAmount) {
            return b.superchatTotalAmount - a.superchatTotalAmount;
          }
          const aMemGift = a.giftCount + a.membershipCount;
          const bMemGift = b.giftCount + b.membershipCount;
          if (bMemGift !== aMemGift) return bMemGift - aMemGift;
          if (b.lastTs !== a.lastTs) return b.lastTs - a.lastTs;
          return a.firstOrder - b.firstOrder;
        });
        cachedCommenters = sorted.map((entry, idx) => ({
          rank: idx + 1,
          ...entry
        }));
        return cachedCommenters;
      }
    };
    return {
      totalsByCurrency,
      currencyItemCounts,
      currencyUserMap,
      supporterMap,
      commenterMap,
      supporterChannelIds,
      counts,
      commenterSeq: 0,
      invalidateCommentersCache() {
        cachedCommenters = null;
      },
      snapshot
    };
  }
  function applyYtSupportRankingDelta(accumulator, newItems) {
    const acc = accumulator || createYtSupportRankingAccumulator();
    let rankingChanged = false;
    let supporterSetChanged = false;
    const touchedCurrencies = /* @__PURE__ */ new Set();
    if (!Array.isArray(newItems) || newItems.length === 0) {
      return {
        accumulator: acc,
        snapshot: acc.snapshot,
        rankingChanged: false,
        supporterSetChanged: false
      };
    }
    for (const item of newItems) {
      if (!item || typeof item !== "object") continue;
      const kind = String(item.kind || "");
      const isSupportKind = kind === "superchat" || kind === "sticker" || kind === "membership" || kind === "membership_gift";
      const badges = Array.isArray(item.badges) ? item.badges : [];
      const isMemberBadge = badges.includes("member");
      const channelId = String(item.channelId || item.name || "").trim();
      if (!channelId) continue;
      const name = String(item.name || channelId).trim();
      const iconUrl = safeHttpUrl(item.iconUrl || "");
      const channelUrl = buildYtChannelUrl(channelId);
      const ts = Number.isFinite(Number(item.ts)) ? Number(item.ts) : Number.isFinite(Number(item.recordedAt)) ? Number(item.recordedAt) : 0;
      const amount = Number(item.amount || 0);
      const currency = String(item.currency || "").trim().toUpperCase();
      const isPaid = (kind === "superchat" || kind === "sticker") && Number.isFinite(amount) && amount > 0 && Boolean(currency);
      let commenter = acc.commenterMap.get(channelId);
      if (!commenter) {
        acc.commenterSeq += 1;
        commenter = {
          channelId,
          name,
          iconUrl,
          channelUrl,
          commentCount: 0,
          superchatCount: 0,
          stickerCount: 0,
          superchatTotalAmount: 0,
          amountsByCurrency: {},
          primaryFormattedAmount: "",
          membershipCount: 0,
          giftCount: 0,
          isMember: false,
          lastTs: ts,
          firstOrder: acc.commenterSeq
        };
        acc.commenterMap.set(channelId, commenter);
      } else {
        if (name && (!commenter.name || commenter.name === commenter.channelId)) {
          commenter.name = name;
        }
        if (iconUrl && !commenter.iconUrl) {
          commenter.iconUrl = iconUrl;
        }
        if (ts > commenter.lastTs) {
          commenter.lastTs = ts;
        }
      }
      commenter.commentCount += 1;
      if (isMemberBadge || kind === "membership" || kind === "membership_gift") {
        commenter.isMember = true;
      }
      if (kind === "superchat") commenter.superchatCount += 1;
      else if (kind === "sticker") commenter.stickerCount += 1;
      else if (kind === "membership") commenter.membershipCount += 1;
      else if (kind === "membership_gift") commenter.giftCount += 1;
      if (isPaid) {
        commenter.superchatTotalAmount = Math.round((commenter.superchatTotalAmount + amount) * 100) / 100;
        commenter.amountsByCurrency[currency] = Math.round(((commenter.amountsByCurrency[currency] || 0) + amount) * 100) / 100;
        commenter.primaryFormattedAmount = formatYtCurrencyAmount(
          commenter.amountsByCurrency[currency],
          currency
        );
      }
      acc.invalidateCommentersCache();
      if (iconUrl) {
        const existingSup = acc.supporterMap.get(channelId);
        if (existingSup && !existingSup.iconUrl) {
          existingSup.iconUrl = iconUrl;
          rankingChanged = true;
        }
        for (const cKey of Object.keys(acc.currencyUserMap)) {
          const cEntry = acc.currencyUserMap[cKey]?.get(channelId);
          if (cEntry && !cEntry.iconUrl) {
            cEntry.iconUrl = iconUrl;
            touchedCurrencies.add(cKey);
            rankingChanged = true;
          }
        }
      }
      if (isSupportKind || isMemberBadge) {
        if (!acc.supporterChannelIds.has(channelId)) {
          acc.supporterChannelIds.add(channelId);
          supporterSetChanged = true;
        }
      }
      if (!isSupportKind) continue;
      rankingChanged = true;
      if (kind === "superchat") acc.counts.superchat += 1;
      else if (kind === "sticker") acc.counts.sticker += 1;
      else if (kind === "membership") acc.counts.membership += 1;
      else if (kind === "membership_gift") acc.counts.membershipGift += 1;
      let sup = acc.supporterMap.get(channelId);
      if (!sup) {
        sup = {
          channelId,
          name,
          iconUrl: iconUrl || commenter.iconUrl || "",
          channelUrl,
          amountsByCurrency: {},
          superchatCount: 0,
          stickerCount: 0,
          membershipCount: 0,
          giftCount: 0,
          lastTs: ts
        };
        acc.supporterMap.set(channelId, sup);
      } else {
        if (name && (!sup.name || sup.name === sup.channelId)) sup.name = name;
        if (iconUrl && !sup.iconUrl) sup.iconUrl = iconUrl;
        if (ts > sup.lastTs) sup.lastTs = ts;
      }
      if (kind === "superchat") sup.superchatCount += 1;
      else if (kind === "sticker") sup.stickerCount += 1;
      else if (kind === "membership") sup.membershipCount += 1;
      else if (kind === "membership_gift") sup.giftCount += 1;
      if (isPaid) {
        acc.totalsByCurrency[currency] = Math.round(((acc.totalsByCurrency[currency] || 0) + amount) * 100) / 100;
        acc.currencyItemCounts[currency] = (acc.currencyItemCounts[currency] || 0) + 1;
        sup.amountsByCurrency[currency] = Math.round(((sup.amountsByCurrency[currency] || 0) + amount) * 100) / 100;
        if (!acc.currencyUserMap[currency]) {
          acc.currencyUserMap[currency] = /* @__PURE__ */ new Map();
        }
        const cMap = acc.currencyUserMap[currency];
        let cEntry = cMap.get(channelId);
        if (!cEntry) {
          cEntry = {
            channelId,
            name,
            iconUrl: iconUrl || commenter.iconUrl || "",
            channelUrl,
            amount: 0,
            currency,
            count: 0,
            lastTs: ts
          };
          cMap.set(channelId, cEntry);
        }
        cEntry.amount = Math.round((cEntry.amount + amount) * 100) / 100;
        cEntry.count += 1;
        if (name && (!cEntry.name || cEntry.name === cEntry.channelId)) cEntry.name = name;
        if (iconUrl && !cEntry.iconUrl) cEntry.iconUrl = iconUrl;
        if (ts > cEntry.lastTs) cEntry.lastTs = ts;
        touchedCurrencies.add(currency);
      }
    }
    if (rankingChanged) {
      for (const currency of touchedCurrencies) {
        const cMap = acc.currencyUserMap[currency];
        if (!cMap) continue;
        const sorted = Array.from(cMap.values()).sort((a, b) => {
          if (b.amount !== a.amount) return b.amount - a.amount;
          if (b.count !== a.count) return b.count - a.count;
          return b.lastTs - a.lastTs;
        });
        acc.snapshot.byCurrency[currency] = sorted.map((entry, idx) => ({
          rank: idx + 1,
          ...entry,
          formattedAmount: formatYtCurrencyAmount(entry.amount, currency)
        }));
      }
      acc.snapshot.supporters = Array.from(acc.supporterMap.values()).sort((a, b) => {
        const aPaid = a.superchatCount + a.stickerCount;
        const bPaid = b.superchatCount + b.stickerCount;
        if (bPaid !== aPaid) return bPaid - aPaid;
        if (b.giftCount !== a.giftCount) return b.giftCount - a.giftCount;
        if (b.membershipCount !== a.membershipCount) return b.membershipCount - a.membershipCount;
        return b.lastTs - a.lastTs;
      });
    }
    return {
      accumulator: acc,
      snapshot: acc.snapshot,
      rankingChanged,
      supporterSetChanged
    };
  }

  // src/lib/voiceAssignment.js
  var DEFAULT_VOICE = Object.freeze({
    styleId: 3,
    pitchOffset: 0,
    speedOffset: 0
  });
  var PITCH_OFFSETS = Object.freeze([-0.06, -0.03, 0, 0.03, 0.06]);
  var SPEED_OFFSETS = Object.freeze([0, 0.05, 0.1]);

  // src/lib/voiceNarrowing.js
  var VOICE_NARROW_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14]);
  var VOICE_CAPPED_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14, 11, 21, 20, 46, 0, 4, 6, 1, 7, 5, 81, 82, 83, 84, 85, 66, 77, 78, 79, 80]);
  var VOICE_NARROW_MODES = Object.freeze(["off", "auto", "on"]);

  // src/lib/youtube/ytVoiceQueue.js
  var YT_VOICE_MODES = Object.freeze({
    ALL: "all",
    SELECT: "select"
  });
  var YT_DEFAULT_STYLE_IDS = VOICE_CAPPED_STYLE_IDS;

  // src/lib/youtube/ytLaneAssign.js
  var YT_LANES = Object.freeze({
    RINKU: "rinku",
    KONTA: "konta",
    TANUNEE: "tanunee"
  });
  var YT_LANE_RULES = Object.freeze([
    {
      lane: YT_LANES.RINKU,
      characterName: "りんく",
      roleLabel: "配信者視点",
      description: "配信者本人・モデレーター",
      badges: Object.freeze(["owner", "moderator"]),
      kinds: Object.freeze([]),
      includeSupporterChannels: false,
      isDefault: false
    },
    {
      lane: YT_LANES.KONTA,
      characterName: "こん太",
      roleLabel: "ファン視点",
      description: "スパチャ・ステッカー・メンバー・メンバーシップギフトの人",
      badges: Object.freeze(["member"]),
      kinds: Object.freeze(["superchat", "sticker", "membership", "membership_gift"]),
      includeSupporterChannels: true,
      isDefault: false
    },
    {
      lane: YT_LANES.TANUNEE,
      characterName: "たぬ姉",
      roleLabel: "案内役",
      description: "それ以外の一般コメント",
      badges: Object.freeze([]),
      kinds: Object.freeze([]),
      includeSupporterChannels: false,
      isDefault: true
    }
  ]);
  function assignYtCommentLane(item, opts = {}) {
    if (!item || typeof item !== "object") {
      return YT_LANES.TANUNEE;
    }
    const badges = Array.isArray(item.badges) ? item.badges.map((b) => String(b || "").toLowerCase()) : [];
    const kind = String(item.kind || "text").toLowerCase();
    const channelId = String(item.channelId || "");
    const broadcasterChannelId = String(opts.broadcasterChannelId || "");
    const supporterSet = opts.supporterChannelIds instanceof Set ? opts.supporterChannelIds : Array.isArray(opts.supporterChannelIds) ? new Set(opts.supporterChannelIds) : null;
    for (const rule of YT_LANE_RULES) {
      if (rule.isDefault) {
        return (
          /** @type {'rinku' | 'konta' | 'tanunee'} */
          rule.lane
        );
      }
      if (rule.lane === YT_LANES.RINKU && broadcasterChannelId && channelId && channelId === broadcasterChannelId) {
        return YT_LANES.RINKU;
      }
      if (rule.badges.some((b) => badges.includes(b))) {
        return (
          /** @type {'rinku' | 'konta' | 'tanunee'} */
          rule.lane
        );
      }
      if (rule.kinds.includes(kind)) {
        return (
          /** @type {'rinku' | 'konta' | 'tanunee'} */
          rule.lane
        );
      }
      if (rule.includeSupporterChannels && channelId && supporterSet && supporterSet.has(channelId)) {
        return (
          /** @type {'rinku' | 'konta' | 'tanunee'} */
          rule.lane
        );
      }
    }
    return YT_LANES.TANUNEE;
  }

  // src/lib/youtube/ytStreamStorePolicy.js
  var YT_SIDE_PANEL_DISPLAY_LIMIT = 150;
  function buildYtCommentPrimaryKey(videoId, commentId) {
    const v = String(videoId || "").trim();
    const c = String(commentId || "").trim();
    if (!v || !c) return "";
    return `${v}::${c}`;
  }
  function createYtStreamIncrementalState(videoId, opts = {}) {
    const displayLimit = typeof opts.displayLimit === "number" && opts.displayLimit > 0 ? Math.floor(opts.displayLimit) : YT_SIDE_PANEL_DISPLAY_LIMIT;
    return {
      videoId: String(videoId || "").trim(),
      broadcasterChannelId: String(opts.broadcasterChannelId || "").trim(),
      displayLimit,
      totalCount: 0,
      firstRecordedAt: 0,
      lastRecordedAt: 0,
      /** @type {Set<string>} */
      seenPks: /* @__PURE__ */ new Set(),
      laneCounts: {
        rinku: 0,
        konta: 0,
        tanunee: 0
      },
      /** @type {{ rinku: any[], konta: any[], tanunee: any[] }} */
      laneDisplay: {
        rinku: [],
        konta: [],
        tanunee: []
      },
      rankingAcc: createYtSupportRankingAccumulator()
    };
  }
  function applyYtStreamIncrementalItems(state, incomingItems, opts = {}) {
    if (opts.broadcasterChannelId) {
      state.broadcasterChannelId = String(opts.broadcasterChannelId).trim();
    }
    const addedByLane = {
      rinku: [],
      konta: [],
      tanunee: []
    };
    if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
      return {
        addedCount: 0,
        addedByLane,
        rankingChanged: false,
        supporterSetChanged: false,
        ranking: state.rankingAcc.snapshot,
        laneCounts: state.laneCounts,
        laneDisplay: state.laneDisplay,
        totalCount: state.totalCount
      };
    }
    const unseen = [];
    for (let i = 0; i < incomingItems.length; i += 1) {
      const item = incomingItems[i];
      if (!item || typeof item !== "object") continue;
      const pk = String(item.pk || "").trim() || buildYtCommentPrimaryKey(state.videoId || item.videoId, item.id);
      if (!pk || state.seenPks.has(pk)) continue;
      state.seenPks.add(pk);
      unseen.push(item);
      const recAt = Number(item.recordedAt || 0);
      if (Number.isFinite(recAt) && recAt > 0) {
        if (state.firstRecordedAt === 0 || recAt < state.firstRecordedAt) {
          state.firstRecordedAt = recAt;
        }
        if (recAt > state.lastRecordedAt) {
          state.lastRecordedAt = recAt;
        }
      }
    }
    if (unseen.length === 0) {
      return {
        addedCount: 0,
        addedByLane,
        rankingChanged: false,
        supporterSetChanged: false,
        ranking: state.rankingAcc.snapshot,
        laneCounts: state.laneCounts,
        laneDisplay: state.laneDisplay,
        totalCount: state.totalCount
      };
    }
    state.totalCount += unseen.length;
    const rankRes = applyYtSupportRankingDelta(state.rankingAcc, unseen);
    for (let i = 0; i < unseen.length; i += 1) {
      const item = unseen[i];
      const lane = assignYtCommentLane(item, {
        broadcasterChannelId: state.broadcasterChannelId,
        supporterChannelIds: state.rankingAcc.supporterChannelIds
      });
      state.laneCounts[lane] += 1;
      addedByLane[lane].push(item);
    }
    const limit = state.displayLimit || YT_SIDE_PANEL_DISPLAY_LIMIT;
    for (
      const lane of
      /** @type {const} */
      ["rinku", "konta", "tanunee"]
    ) {
      const added = addedByLane[lane];
      if (added.length === 0) continue;
      const addedNewestFirst = added.slice().reverse();
      if (addedNewestFirst.length >= limit) {
        state.laneDisplay[lane] = addedNewestFirst.slice(0, limit);
      } else {
        const merged = addedNewestFirst.concat(state.laneDisplay[lane]);
        if (merged.length > limit) {
          merged.length = limit;
        }
        state.laneDisplay[lane] = merged;
      }
    }
    return {
      addedCount: unseen.length,
      addedByLane,
      rankingChanged: rankRes.rankingChanged,
      supporterSetChanged: rankRes.supporterSetChanged,
      ranking: rankRes.snapshot,
      laneCounts: state.laneCounts,
      laneDisplay: state.laneDisplay,
      totalCount: state.totalCount
    };
  }

  // extension-youtube/src/ytIdbStore.js
  var DB_NAME = "yt_kirameki_db";
  var DB_VERSION = 2;
  var STORE_COMMENTS = "comments";
  var INDEX_BY_VIDEO_ID = "by_videoId";
  var INDEX_BY_VIDEO_ID_RECORDED_AT = "by_videoId_recordedAt";
  var dbPromise = null;
  function openYtCommentsDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          let store;
          if (!db.objectStoreNames.contains(STORE_COMMENTS)) {
            store = db.createObjectStore(STORE_COMMENTS, { keyPath: "pk" });
          } else {
            store = req.transaction.objectStore(STORE_COMMENTS);
          }
          if (store && !store.indexNames.contains(INDEX_BY_VIDEO_ID)) {
            store.createIndex(INDEX_BY_VIDEO_ID, "videoId", { unique: false });
          }
          if (store && !store.indexNames.contains(INDEX_BY_VIDEO_ID_RECORDED_AT)) {
            store.createIndex(INDEX_BY_VIDEO_ID_RECORDED_AT, ["videoId", "recordedAt"], {
              unique: false
            });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          dbPromise = null;
          reject(req.error || new Error("idb_open_failed"));
        };
      } catch (err) {
        dbPromise = null;
        reject(err);
      }
    });
    return dbPromise;
  }
  async function getYtStreamCommentsByVideoId(videoId) {
    const vid = String(videoId || "").trim();
    if (!vid) return [];
    const db = await openYtCommentsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_COMMENTS], "readonly");
      const store = tx.objectStore(STORE_COMMENTS);
      if (store.indexNames.contains(INDEX_BY_VIDEO_ID_RECORDED_AT)) {
        const index2 = store.index(INDEX_BY_VIDEO_ID_RECORDED_AT);
        const range = IDBKeyRange.bound([vid, 0], [vid, Number.MAX_SAFE_INTEGER]);
        const req2 = index2.getAll(range);
        req2.onsuccess = () => {
          resolve(Array.isArray(req2.result) ? req2.result : []);
        };
        req2.onerror = () => {
          reject(req2.error || new Error("idb_get_failed"));
        };
        return;
      }
      const index = store.index(INDEX_BY_VIDEO_ID);
      const req = index.getAll(IDBKeyRange.only(vid));
      req.onsuccess = () => {
        const list = Array.isArray(req.result) ? req.result : [];
        list.sort((a, b) => Number(a.recordedAt || 0) - Number(b.recordedAt || 0));
        resolve(list);
      };
      req.onerror = () => {
        reject(req.error || new Error("idb_get_failed"));
      };
    });
  }
  async function getYtStreamCommentsSince(videoId, afterRecordedAt = 0) {
    const vid = String(videoId || "").trim();
    if (!vid) return [];
    const lower = typeof afterRecordedAt === "number" && Number.isFinite(afterRecordedAt) && afterRecordedAt > 0 ? afterRecordedAt : 0;
    const db = await openYtCommentsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_COMMENTS], "readonly");
      const store = tx.objectStore(STORE_COMMENTS);
      const index = store.index(INDEX_BY_VIDEO_ID_RECORDED_AT);
      const range = IDBKeyRange.bound([vid, lower], [vid, Number.MAX_SAFE_INTEGER]);
      const req = index.getAll(range);
      req.onsuccess = () => {
        resolve(Array.isArray(req.result) ? req.result : []);
      };
      req.onerror = () => {
        reject(req.error || new Error("idb_get_since_failed"));
      };
    });
  }

  // extension-youtube/src/sidepanel-entry.js
  var STORAGE_KEYS = Object.freeze({
    STREAM_SUMMARIES: "yt_stream_summaries",
    ACTIVE_VIDEO_ID: "yt_active_video_id",
    VOICE_SETTINGS: "yt_voice_settings",
    VOICE_ASSIGNMENTS: "yt_voice_assignments",
    VOICE_QUEUE: "yt_voice_queue",
    VOICE_STATE: "yt_voice_state",
    UI_STATE: "yt_sidepanel_ui_state"
  });
  var LANE_CONFIG = Object.freeze({
    rinku: {
      listId: "lane-rinku-list",
      countId: "lane-rinku-count",
      emptyMessage: "配信者本人・モデレーターのコメントがここに表示されます",
      fallbackIcon: "images/yukkuri-charactore-english/link/link-yukkuri-normal-mouth-closed.thumb128.png"
    },
    konta: {
      listId: "lane-konta-list",
      countId: "lane-konta-count",
      emptyMessage: "スパチャ・ステッカー・メンバー・ギフトの応援がここに表示されます",
      fallbackIcon: "images/yukkuri-charactore-english/konta/kitsune-yukkuri-normal.thumb128.png"
    },
    tanunee: {
      listId: "lane-tanunee-list",
      countId: "lane-tanunee-count",
      emptyMessage: "一般リスナーのコメントがここに表示されます",
      fallbackIcon: "images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-normal-mouth-closed.thumb128.png"
    }
  });
  var BROADCASTER_FALLBACK_ICON = "images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png";
  var TOP_SUPPORT_STRIP_LIMIT = 10;
  var STORY_USERLANE_LIMIT = 36;
  var STORY_GROWTH_GRID_LIMIT = 240;
  var selectedVideoId = "";
  var currentIncrementalState = null;
  var renderJobChain = Promise.resolve();
  var visualDetailsNeedsRefresh = false;
  var identiconCache2 = /* @__PURE__ */ new Map();
  var metrics = {
    fullGetAllCount: 0,
    incrementalFetchCount: 0,
    lastIncrementalFetchedItems: 0,
    lastIncrementalAddedItems: 0,
    lastIncrementalDurationMs: 0,
    lastFullLoadDurationMs: 0,
    voiceOnlyUpdateCount: 0
  };
  if (typeof window !== "undefined") {
    window.__ytSidepanelMetrics = metrics;
  }
  function runRenderSerialized(fn) {
    const next = renderJobChain.then(fn, fn);
    renderJobChain = next.then(
      () => void 0,
      () => void 0
    );
    return next;
  }
  function clearChildren(el) {
    if (!el) return;
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }
  function getDeterministicIdenticonUrl(key) {
    const k = String(key || "anon").trim() || "anon";
    const cached = identiconCache2.get(k);
    if (cached) return cached;
    const url = anonymousIdenticonDataUrl(k, 64);
    if (identiconCache2.size > 2e3) {
      const first = identiconCache2.keys().next().value;
      if (first) identiconCache2.delete(first);
    }
    identiconCache2.set(k, url);
    return url;
  }
  function formatShortChannelId(channelId) {
    const raw = String(channelId || "").trim();
    if (!raw) return "";
    const cleaned = raw.startsWith("handle:") ? raw.slice("handle:".length) : raw;
    return cleaned.length > 14 ? `${cleaned.slice(0, 14)}…` : cleaned;
  }
  function formatElapsedDurationJa(elapsedMs) {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "—";
    const totalSec = Math.floor(elapsedMs / 1e3);
    if (totalSec < 60) return "1分未満";
    const totalMin = Math.floor(totalSec / 60);
    if (totalMin < 60) return `${totalMin}分`;
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return `${hours}時間${String(mins).padStart(2, "0")}分`;
  }
  function createAvatarImgWithFallback(iconUrl, name, channelKey, className, explicitFallbackSrc = "") {
    const safeUrl = safeHttpUrl(iconUrl || "");
    const fallbackSrc = explicitFallbackSrc || getDeterministicIdenticonUrl(channelKey || name || "anon");
    const img = document.createElement("img");
    img.className = className;
    img.src = safeUrl || fallbackSrc;
    img.alt = name || "icon";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    if (safeUrl) {
      img.addEventListener(
        "error",
        () => {
          if (img.src !== fallbackSrc) {
            img.src = fallbackSrc;
          }
        },
        { once: true }
      );
    }
    return img;
  }
  function createAuthorHeaderFragment(user) {
    const frag = document.createDocumentFragment();
    const displayName = String(user.name || user.channelId || "匿名リスナー").trim();
    const channelId = String(user.channelId || "").trim();
    const channelUrl = safeHttpUrl(buildYtChannelUrl(channelId));
    const shortId = formatShortChannelId(channelId);
    const cell = channelUrl ? document.createElement("a") : document.createElement("span");
    cell.className = channelUrl ? "nl-story-userlane-cell nl-story-userlane-cell--linkable author-link" : "nl-story-userlane-cell author-link";
    if (channelUrl) {
      cell.href = channelUrl;
      cell.target = "_blank";
      cell.rel = "noopener noreferrer";
    }
    cell.title = channelId ? `${displayName} (${channelId})` : displayName;
    cell.appendChild(
      createAvatarImgWithFallback(
        user.iconUrl || "",
        displayName,
        channelId || displayName,
        "nl-story-userlane-avatar avatar-img"
      )
    );
    const meta = document.createElement("span");
    meta.className = "nl-story-userlane-meta";
    const nameSpan = document.createElement("span");
    nameSpan.className = "nl-story-userlane-meta__name";
    nameSpan.textContent = displayName;
    meta.appendChild(nameSpan);
    if (shortId) {
      const idTag = document.createElement("span");
      idTag.className = "nl-story-userlane-meta__id channel-id-tag";
      idTag.textContent = `(${shortId})`;
      idTag.title = channelId;
      meta.appendChild(idTag);
    }
    cell.appendChild(meta);
    frag.appendChild(cell);
    if (Number.isFinite(Number(user.voiceStyleId))) {
      const voicePill = document.createElement("span");
      voicePill.className = "voice-pill";
      voicePill.dataset.voiceStyleId = String(user.voiceStyleId);
      voicePill.textContent = `声 #${user.voiceStyleId}`;
      frag.appendChild(voicePill);
    }
    return frag;
  }
  function createChatItemElement(item) {
    const card = document.createElement("div");
    const kind = String(item.kind || "text");
    const isGiftLike = kind === "superchat" || kind === "sticker" || kind === "membership" || kind === "membership_gift";
    card.className = `chat-item ${isGiftLike ? "nl-tl-gift" : "nl-tl-row"} kind-${kind}`;
    card.dataset.itemId = String(item.id || "");
    card.dataset.channelId = String(item.channelId || "");
    if (Number.isFinite(Number(item.voiceStyleId))) {
      card.dataset.voiceStyleId = String(item.voiceStyleId);
    }
    const head = document.createElement("div");
    head.className = "chat-item-head";
    head.appendChild(createAuthorHeaderFragment(item));
    if ((kind === "superchat" || kind === "sticker") && Number(item.amount) > 0) {
      const pill = document.createElement("span");
      pill.className = "amount-pill";
      pill.textContent = formatYtCurrencyAmount(item.amount, item.currency);
      head.appendChild(pill);
    } else if (kind === "membership") {
      const pill = document.createElement("span");
      pill.className = "member-pill";
      pill.textContent = "メンバー加入";
      head.appendChild(pill);
    } else if (kind === "membership_gift") {
      const pill = document.createElement("span");
      pill.className = "member-pill";
      pill.textContent = "ギフト";
      head.appendChild(pill);
    }
    if (item.ts) {
      const tsSpan = document.createElement("span");
      tsSpan.className = "channel-id-tag";
      tsSpan.style.marginLeft = "auto";
      tsSpan.textContent = String(item.ts);
      head.appendChild(tsSpan);
    }
    card.appendChild(head);
    if (item.text) {
      const body = document.createElement("div");
      body.className = "chat-text";
      body.textContent = String(item.text);
      card.appendChild(body);
    }
    return card;
  }
  function renderLaneFull(lane, displayItems, totalLaneCount) {
    const cfg = LANE_CONFIG[lane];
    const listEl = document.getElementById(cfg.listId);
    const countEl = document.getElementById(cfg.countId);
    if (countEl) {
      countEl.textContent = `${formatNumberJa(totalLaneCount)}件`;
    }
    if (!listEl) return;
    clearChildren(listEl);
    if (displayItems.length === 0) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = cfg.emptyMessage;
      listEl.appendChild(hint);
      return;
    }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < displayItems.length; i += 1) {
      frag.appendChild(createChatItemElement(displayItems[i]));
    }
    listEl.appendChild(frag);
  }
  function patchLaneIncremental(lane, newlyAddedChronological, totalLaneCount) {
    const cfg = LANE_CONFIG[lane];
    const countEl = document.getElementById(cfg.countId);
    if (countEl) {
      countEl.textContent = `${formatNumberJa(totalLaneCount)}件`;
    }
    if (!newlyAddedChronological || newlyAddedChronological.length === 0) return;
    const listEl = document.getElementById(cfg.listId);
    if (!listEl) return;
    const emptyHint = listEl.querySelector(".empty-hint");
    if (emptyHint) {
      emptyHint.remove();
    }
    if (newlyAddedChronological.length >= YT_SIDE_PANEL_DISPLAY_LIMIT) {
      clearChildren(listEl);
      const newest = newlyAddedChronological.slice(-YT_SIDE_PANEL_DISPLAY_LIMIT).reverse();
      const frag2 = document.createDocumentFragment();
      for (let i = 0; i < newest.length; i += 1) {
        frag2.appendChild(createChatItemElement(newest[i]));
      }
      listEl.appendChild(frag2);
      return;
    }
    const frag = document.createDocumentFragment();
    for (let i = newlyAddedChronological.length - 1; i >= 0; i -= 1) {
      frag.appendChild(createChatItemElement(newlyAddedChronological[i]));
    }
    listEl.insertBefore(frag, listEl.firstChild);
    while (listEl.children.length > YT_SIDE_PANEL_DISPLAY_LIMIT) {
      if (listEl.lastElementChild) {
        listEl.removeChild(listEl.lastElementChild);
      } else {
        break;
      }
    }
  }
  function renderLiveStatsAndOfficialRow(currentSummary, totalComments, ranking, incState) {
    const uniqueVisitors = Number(ranking?.uniqueCommenterCount || 0);
    const concurrent = typeof currentSummary?.concurrentViewers === "number" && Number.isFinite(currentSummary.concurrentViewers) && currentSummary.concurrentViewers >= 0 ? currentSummary.concurrentViewers : null;
    const commentsCardVal = document.getElementById("liveStatComments");
    if (commentsCardVal) {
      commentsCardVal.textContent = formatNumberJa(totalComments);
    }
    const concurrentEstEl = document.getElementById("watchConcurrentEst");
    if (concurrentEstEl) {
      concurrentEstEl.textContent = concurrent !== null ? formatNumberJa(concurrent) : "—";
    }
    const visitorsCardVal = document.getElementById("watchViewerDom");
    if (visitorsCardVal) {
      visitorsCardVal.textContent = formatNumberJa(uniqueVisitors);
    }
    const offVisitors = document.getElementById("officialStatVisitors");
    if (offVisitors) {
      offVisitors.textContent = formatNumberJa(uniqueVisitors);
    }
    const offComments = document.getElementById("officialStatComments");
    if (offComments) {
      offComments.textContent = formatNumberJa(totalComments);
    }
    const offElapsed = document.getElementById("officialStatElapsed");
    if (offElapsed) {
      const startMs = (incState && incState.firstRecordedAt > 0 ? incState.firstRecordedAt : 0) || Number(currentSummary?.createdAt || 0);
      const endMs = Math.max(
        incState && incState.lastRecordedAt > 0 ? incState.lastRecordedAt : 0,
        Number(currentSummary?.updatedAt || 0)
      ) || Date.now();
      if (startMs > 0 && endMs >= startMs && (totalComments > 0 || currentSummary)) {
        offElapsed.textContent = formatElapsedDurationJa(endMs - startMs);
      } else {
        offElapsed.textContent = "—";
      }
    }
    const offSuperchat = document.getElementById("officialStatSuperchat");
    if (offSuperchat) {
      const primary = ranking?.primaryCurrencySummary;
      offSuperchat.textContent = primary?.formatted || "—";
    }
    const offMemGift = document.getElementById("officialStatMemberGift");
    if (offMemGift) {
      const memGiftCount = Number(ranking?.counts?.membership || 0) + Number(ranking?.counts?.membershipGift || 0);
      offMemGift.textContent = `${formatNumberJa(memGiftCount)}件`;
    }
    const comeviewMeta = document.getElementById("yt-comeview-summary-meta");
    if (comeviewMeta) {
      comeviewMeta.textContent = `合計 ${formatNumberJa(totalComments)}件`;
    }
  }
  function createSupportRankLineCard(opts) {
    const channelUrl = safeHttpUrl(opts.channelUrl || buildYtChannelUrl(opts.channelId));
    const card = channelUrl ? document.createElement("a") : document.createElement("div");
    card.className = channelUrl ? "nl-top-support-rank__line nl-top-support-rank__line--linkable supporter-row" : "nl-top-support-rank__line supporter-row";
    card.setAttribute("role", "listitem");
    if (channelUrl) {
      card.href = channelUrl;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
    }
    const displayName = String(opts.name || opts.channelId || "リスナー").trim();
    const shortId = formatShortChannelId(opts.channelId);
    card.title = opts.channelId ? `${displayName} (${opts.channelId}) — ${opts.countText}` : `${displayName} — ${opts.countText}`;
    const placeSpan = document.createElement("span");
    placeSpan.className = "nl-top-support-rank__place";
    placeSpan.textContent = opts.placeText;
    card.appendChild(placeSpan);
    const countSpan = document.createElement("span");
    countSpan.className = "nl-top-support-rank__count";
    countSpan.textContent = opts.countText;
    card.appendChild(countSpan);
    const thumbWrap = document.createElement("span");
    thumbWrap.className = "nl-top-support-rank__thumb-wrap";
    thumbWrap.appendChild(
      createAvatarImgWithFallback(
        opts.iconUrl || "",
        displayName,
        opts.channelId || displayName,
        "nl-top-support-rank__thumb"
      )
    );
    card.appendChild(thumbWrap);
    if (shortId) {
      const idSpan = document.createElement("span");
      idSpan.className = "nl-top-support-rank__id";
      idSpan.textContent = shortId;
      idSpan.title = opts.channelId;
      card.appendChild(idSpan);
    }
    const nameSpan = document.createElement("span");
    nameSpan.className = "nl-top-support-rank__name";
    nameSpan.textContent = displayName;
    card.appendChild(nameSpan);
    return card;
  }
  function renderTopSupportRankStrip(currentSummary, ranking) {
    const listEl = document.getElementById("topSupportRankList");
    if (!listEl) return;
    clearChildren(listEl);
    const frag = document.createDocumentFragment();
    const casterTile = document.createElement("div");
    casterTile.className = "nl-top-support-rank__caster";
    casterTile.setAttribute("role", "listitem");
    const casterLabel = document.createElement("span");
    casterLabel.className = "nl-top-support-rank__caster-label";
    casterLabel.textContent = "配信者";
    casterTile.appendChild(casterLabel);
    const bName = String(
      currentSummary?.broadcasterName || currentSummary?.title || "YouTube 配信者"
    ).trim();
    const bChannelId = String(currentSummary?.broadcasterChannelId || "").trim();
    const bChannelUrl = safeHttpUrl(buildYtChannelUrl(bChannelId)) || (selectedVideoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(selectedVideoId)}` : "");
    const casterThumb = createAvatarImgWithFallback(
      currentSummary?.broadcasterIconUrl || "",
      bName,
      bChannelId || bName,
      "nl-top-support-rank__caster-thumb",
      BROADCASTER_FALLBACK_ICON
    );
    casterTile.appendChild(casterThumb);
    const casterNameSpan = document.createElement("span");
    casterNameSpan.className = "nl-top-support-rank__caster-name";
    casterNameSpan.textContent = bName;
    casterNameSpan.title = bChannelId ? `${bName} (${bChannelId})` : bName;
    casterTile.appendChild(casterNameSpan);
    if (bChannelUrl) {
      const followLink = document.createElement("a");
      followLink.className = "nl-top-support-rank__caster-follow";
      followLink.href = bChannelUrl;
      followLink.target = "_blank";
      followLink.rel = "noopener noreferrer";
      followLink.textContent = bChannelId ? "チャンネル" : "視聴ページ";
      casterTile.appendChild(followLink);
    }
    frag.appendChild(casterTile);
    const commenters = (Array.isArray(ranking?.commenters) ? ranking.commenters : []).filter(
      (c) => !bChannelId || c.channelId !== bChannelId
    );
    const topSlice = commenters.slice(0, TOP_SUPPORT_STRIP_LIMIT);
    for (let i = 0; i < topSlice.length; i += 1) {
      const c = topSlice[i];
      const countLabel = c.primaryFormattedAmount ? `${c.commentCount}件 · ${c.primaryFormattedAmount}` : `${c.commentCount}件`;
      frag.appendChild(
        createSupportRankLineCard({
          placeText: String(i + 1),
          countText: countLabel,
          name: c.name,
          channelId: c.channelId,
          iconUrl: c.iconUrl,
          channelUrl: c.channelUrl
        })
      );
    }
    listEl.appendChild(frag);
  }
  function renderNorthStarSupportLanes(ranking) {
    const summaryEl = document.getElementById("yt-support-summary");
    const currencyContainer = document.getElementById("yt-currency-ranking-container");
    const memberSummaryEl = document.getElementById("yt-member-gift-summary");
    const memberListEl = document.getElementById("yt-member-gift-list");
    const paidTotalCount = Number(ranking?.counts?.superchat || 0) + Number(ranking?.counts?.sticker || 0);
    if (summaryEl) {
      summaryEl.textContent = `スパチャ・ステッカー ${formatNumberJa(paidTotalCount)}件（通貨別集計・換算なし）`;
    }
    if (memberSummaryEl) {
      memberSummaryEl.textContent = `メンバー加入 ${formatNumberJa(ranking?.counts?.membership || 0)}件 / ギフト ${formatNumberJa(ranking?.counts?.membershipGift || 0)}件`;
    }
    if (currencyContainer) {
      clearChildren(currencyContainer);
      const currencies = Object.keys(ranking?.byCurrency || {});
      if (currencies.length === 0) {
        const hint = document.createElement("div");
        hint.className = "empty-hint";
        hint.textContent = "スーパーチャット・ステッカーが届くと通貨ごとに集計されます。";
        currencyContainer.appendChild(hint);
      } else {
        for (const currency of currencies) {
          const box = document.createElement("div");
          box.className = "currency-box";
          box.dataset.currency = currency;
          const header = document.createElement("div");
          header.className = "currency-header";
          const titleSpan = document.createElement("span");
          titleSpan.textContent = `${currency} ランキング`;
          const totalSpan = document.createElement("span");
          totalSpan.textContent = `合計 ${formatYtCurrencyAmount(
            ranking.totalsByCurrency[currency],
            currency
          )}`;
          header.appendChild(titleSpan);
          header.appendChild(totalSpan);
          box.appendChild(header);
          const listWrap = document.createElement("div");
          listWrap.className = "nl-top-support-rank__list";
          listWrap.setAttribute("role", "list");
          const rows = ranking.byCurrency[currency].slice(0, 12);
          for (const row of rows) {
            listWrap.appendChild(
              createSupportRankLineCard({
                placeText: `${row.rank}位`,
                countText: `${row.formattedAmount} (${row.count}回)`,
                name: row.name,
                channelId: row.channelId,
                iconUrl: row.iconUrl,
                channelUrl: row.channelUrl
              })
            );
          }
          box.appendChild(listWrap);
          currencyContainer.appendChild(box);
        }
      }
    }
    if (memberListEl) {
      clearChildren(memberListEl);
      const memberSupporters = (ranking?.supporters || []).filter(
        (s) => s.membershipCount > 0 || s.giftCount > 0
      );
      if (memberSupporters.length === 0) {
        const hint = document.createElement("div");
        hint.className = "empty-hint";
        hint.textContent = "メンバー加入・メンバーシップギフトが届くとここに表示されます。";
        memberListEl.appendChild(hint);
      } else {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < Math.min(memberSupporters.length, 16); i += 1) {
          const sup = memberSupporters[i];
          const badgeText = sup.giftCount > 0 ? `ギフト ${sup.giftCount}回` : `メンバー加入 ${sup.membershipCount}回`;
          frag.appendChild(
            createSupportRankLineCard({
              placeText: `${i + 1}`,
              countText: badgeText,
              name: sup.name,
              channelId: sup.channelId,
              iconUrl: sup.iconUrl,
              channelUrl: sup.channelUrl
            })
          );
        }
        memberListEl.appendChild(frag);
      }
    }
  }
  function createStoryUserlaneCell(opts) {
    const channelUrl = safeHttpUrl(opts.channelUrl || buildYtChannelUrl(opts.channelId));
    const cell = channelUrl ? document.createElement("a") : document.createElement("span");
    cell.className = channelUrl ? "nl-story-userlane-cell nl-story-userlane-cell--linkable" : "nl-story-userlane-cell";
    cell.setAttribute("role", "listitem");
    if (channelUrl) {
      cell.href = channelUrl;
      cell.target = "_blank";
      cell.rel = "noopener noreferrer";
    }
    if (opts.pulseBadge) {
      cell.setAttribute("data-pulse", opts.pulseBadge);
    }
    const displayName = String(opts.name || opts.channelId || "リスナー").trim();
    const shortId = formatShortChannelId(opts.channelId);
    cell.title = opts.channelId ? `${displayName} (${opts.channelId})` : displayName;
    cell.appendChild(
      createAvatarImgWithFallback(
        opts.iconUrl || "",
        displayName,
        opts.channelId || displayName,
        "nl-story-userlane-avatar"
      )
    );
    const meta = document.createElement("span");
    meta.className = "nl-story-userlane-meta";
    if (opts.statsBadge) {
      meta.setAttribute("data-stats", opts.statsBadge);
    }
    if (shortId) {
      const idSpan = document.createElement("span");
      idSpan.className = "nl-story-userlane-meta__id";
      idSpan.textContent = shortId;
      meta.appendChild(idSpan);
    }
    const nameSpan = document.createElement("span");
    nameSpan.className = "nl-story-userlane-meta__name";
    nameSpan.textContent = displayName;
    meta.appendChild(nameSpan);
    cell.appendChild(meta);
    return cell;
  }
  function renderSupportVisualDetails(ranking) {
    const commenters = Array.isArray(ranking?.commenters) ? ranking.commenters : [];
    const superchatLaneEl = document.getElementById("storyUserLaneSuperchat");
    const superchatCountEl = document.getElementById("storyLaneSuperchatCount");
    const superchatUsers = commenters.filter((c) => c.superchatCount + c.stickerCount > 0).sort((a, b) => {
      if (b.superchatTotalAmount !== a.superchatTotalAmount) {
        return b.superchatTotalAmount - a.superchatTotalAmount;
      }
      return b.commentCount - a.commentCount;
    });
    if (superchatCountEl) {
      superchatCountEl.textContent = `${formatNumberJa(superchatUsers.length)}人`;
    }
    if (superchatLaneEl) {
      clearChildren(superchatLaneEl);
      if (superchatUsers.length === 0) {
        const empty = document.createElement("p");
        empty.className = "nl-story-userlane__empty-note";
        empty.textContent = "Super Chat / Sticker の応援者が届くとここに丸アイコンが並びます。";
        superchatLaneEl.appendChild(empty);
      } else {
        const frag = document.createDocumentFragment();
        for (const u of superchatUsers.slice(0, STORY_USERLANE_LIMIT)) {
          const amtText = u.primaryFormattedAmount || `${u.superchatCount + u.stickerCount}回`;
          frag.appendChild(
            createStoryUserlaneCell({
              name: u.name,
              channelId: u.channelId,
              iconUrl: u.iconUrl,
              channelUrl: u.channelUrl,
              pulseBadge: amtText,
              statsBadge: `💬${u.commentCount}件 💰${amtText}`
            })
          );
        }
        superchatLaneEl.appendChild(frag);
      }
    }
    const memberLaneEl = document.getElementById("storyUserLaneMemberGift");
    const memberCountEl = document.getElementById("storyLaneMemberGiftCount");
    const memberUsers = commenters.filter((c) => c.giftCount > 0 || c.membershipCount > 0 || c.isMember).sort((a, b) => {
      if (b.giftCount !== a.giftCount) return b.giftCount - a.giftCount;
      if (b.membershipCount !== a.membershipCount) return b.membershipCount - a.membershipCount;
      return b.commentCount - a.commentCount;
    });
    if (memberCountEl) {
      memberCountEl.textContent = `${formatNumberJa(memberUsers.length)}人`;
    }
    if (memberLaneEl) {
      clearChildren(memberLaneEl);
      if (memberUsers.length === 0) {
        const empty = document.createElement("p");
        empty.className = "nl-story-userlane__empty-note";
        empty.textContent = "メンバー加入・ギフト・メンバー発言者が届くとここに丸アイコンが並びます。";
        memberLaneEl.appendChild(empty);
      } else {
        const frag = document.createDocumentFragment();
        for (const u of memberUsers.slice(0, STORY_USERLANE_LIMIT)) {
          const pulse = u.giftCount > 0 ? `🎁${u.giftCount}回` : u.membershipCount > 0 ? `加入${u.membershipCount}回` : "⭐メンバー";
          frag.appendChild(
            createStoryUserlaneCell({
              name: u.name,
              channelId: u.channelId,
              iconUrl: u.iconUrl,
              channelUrl: u.channelUrl,
              pulseBadge: pulse,
              statsBadge: `💬${u.commentCount}件 ${pulse}`
            })
          );
        }
        memberLaneEl.appendChild(frag);
      }
    }
    const commentersLaneEl = document.getElementById("storyUserLaneCommenters");
    const commentersCountEl = document.getElementById("storyLaneCommentersCount");
    if (commentersCountEl) {
      commentersCountEl.textContent = `${formatNumberJa(commenters.length)}人`;
    }
    if (commentersLaneEl) {
      clearChildren(commentersLaneEl);
      if (commenters.length === 0) {
        const empty = document.createElement("p");
        empty.className = "nl-story-userlane__empty-note";
        empty.textContent = "コメントした人が届くと件数順に丸アイコンが並びます。";
        commentersLaneEl.appendChild(empty);
      } else {
        const frag = document.createDocumentFragment();
        for (const u of commenters.slice(0, STORY_USERLANE_LIMIT)) {
          const stats = u.primaryFormattedAmount ? `💬${u.commentCount}件 · ${u.primaryFormattedAmount}` : `💬${u.commentCount}件`;
          frag.appendChild(
            createStoryUserlaneCell({
              name: u.name,
              channelId: u.channelId,
              iconUrl: u.iconUrl,
              channelUrl: u.channelUrl,
              pulseBadge: `${u.commentCount}件`,
              statsBadge: stats
            })
          );
        }
        commentersLaneEl.appendChild(frag);
      }
    }
    const growthGridEl = document.getElementById("sceneStoryGrowth");
    const gaugeLabelEl = document.getElementById("sceneStoryGaugeLabel");
    const gridSlice = commenters.slice(0, STORY_GROWTH_GRID_LIMIT);
    if (growthGridEl) {
      clearChildren(growthGridEl);
      const frag = document.createDocumentFragment();
      for (let i = 0; i < gridSlice.length; i += 1) {
        const u = gridSlice[i];
        const channelUrl = safeHttpUrl(u.channelUrl || buildYtChannelUrl(u.channelId));
        const cell = channelUrl ? document.createElement("a") : document.createElement("span");
        cell.className = "nl-story-growth-cell nl-story-growth-cell--repeat";
        cell.setAttribute("data-support-ordinal", String(u.commentCount));
        cell.title = `${u.name} (${u.commentCount}件)`;
        if (channelUrl) {
          cell.href = channelUrl;
          cell.target = "_blank";
          cell.rel = "noopener noreferrer";
        }
        const media = document.createElement("span");
        media.className = "nl-story-growth-cell__media";
        media.appendChild(
          createAvatarImgWithFallback(
            u.iconUrl || "",
            u.name,
            u.channelId || u.name,
            "nl-story-growth-icon nl-story-growth-icon--remote"
          )
        );
        cell.appendChild(media);
        frag.appendChild(cell);
      }
      growthGridEl.appendChild(frag);
    }
    if (gaugeLabelEl) {
      gaugeLabelEl.textContent = `いま ${formatNumberJa(commenters.length)} 人を表示中`;
    }
    visualDetailsNeedsRefresh = false;
  }
  async function renderVoiceUiFromStorage(prefetchedData) {
    const data = prefetchedData || await chrome.storage.local.get([
      STORAGE_KEYS.STREAM_SUMMARIES,
      STORAGE_KEYS.VOICE_SETTINGS,
      STORAGE_KEYS.VOICE_QUEUE,
      STORAGE_KEYS.VOICE_STATE
    ]);
    const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
    const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
    const settings = data[STORAGE_KEYS.VOICE_SETTINGS] || {
      enabled: true,
      mode: YT_VOICE_MODES.ALL,
      broadcasterNameOverride: ""
    };
    const voiceState = data[STORAGE_KEYS.VOICE_STATE] || {
      effectiveMode: settings.mode,
      autoSwitched: false
    };
    const voiceQueue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE]) ? data[STORAGE_KEYS.VOICE_QUEUE] : [];
    const enabledEl = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-voice-enabled")
    );
    if (enabledEl && document.activeElement !== enabledEl) {
      enabledEl.checked = Boolean(settings.enabled);
    }
    const modeEl = (
      /** @type {HTMLSelectElement | null} */
      document.getElementById("yt-voice-mode")
    );
    if (modeEl && document.activeElement !== modeEl) {
      modeEl.value = settings.mode === YT_VOICE_MODES.SELECT ? "select" : "all";
    }
    const bNameInput = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-broadcaster-name-input")
    );
    if (bNameInput && document.activeElement !== bNameInput) {
      bNameInput.value = settings.broadcasterNameOverride || currentSummary?.broadcasterName || "";
    }
    const queueInfoEl = document.getElementById("yt-voice-queue-info");
    if (queueInfoEl) {
      const modeLabel = voiceState.effectiveMode === YT_VOICE_MODES.SELECT ? "選んで読む" : "全部読む";
      queueInfoEl.textContent = `待機キュー: ${voiceQueue.length}件（実効モード: ${modeLabel}）`;
    }
    const autoSwitchBadge = document.getElementById("yt-voice-autoswitch-badge");
    if (autoSwitchBadge) {
      if (voiceState.autoSwitched) {
        autoSwitchBadge.classList.add("is-active");
      } else {
        autoSwitchBadge.classList.remove("is-active");
      }
    }
    const statusBox = document.getElementById("yt-voice-status-box");
    if (statusBox) {
      if (voiceState.voicevoxOnline === true) {
        const styleCount = Number(voiceState.availableStyleCount) || (Array.isArray(settings.availableStyleIds) ? settings.availableStyleIds.length : YT_DEFAULT_STYLE_IDS.length);
        statusBox.className = "voice-status-box is-online";
        statusBox.textContent = `VOICEVOX 接続中（${VOICEVOX_BASE_URL} / 利用可能スタイル: ${styleCount}種・サイドパネルを閉じていても再生継続）`;
      } else if (voiceState.voicevoxOnline === false) {
        const detail = voiceState.voicevoxReason === "timeout" ? "応答がタイムアウトしました" : "ローカルの VOICEVOX エンジンへ接続できませんでした";
        statusBox.className = "voice-status-box is-offline";
        statusBox.textContent = `VOICEVOX が起動していません（${VOICEVOX_BASE_URL} — ${detail}）。VOICEVOX を起動して「VOICEVOX 再確認」を押すと、チャンネルIDごとに決まった声で読み上げます。`;
      }
    }
    const lastSpokenEl = document.getElementById("yt-voice-last-spoken");
    if (lastSpokenEl && voiceState.lastSpokenSummary) {
      lastSpokenEl.textContent = String(voiceState.lastSpokenSummary);
    }
  }
  function updateStreamHeaderUi(summaries, activeId, totalItemsCount) {
    const videoIds = Object.keys(summaries).sort(
      (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0)
    );
    if (!selectedVideoId || !summaries[selectedVideoId]) {
      selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || "";
    }
    const selectEl = (
      /** @type {HTMLSelectElement | null} */
      document.getElementById("yt-stream-select")
    );
    if (selectEl && document.activeElement !== selectEl) {
      clearChildren(selectEl);
      if (videoIds.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "記録済みの配信はまだありません";
        selectEl.appendChild(opt);
      } else {
        for (const vid of videoIds) {
          const s = summaries[vid];
          const opt = document.createElement("option");
          opt.value = vid;
          const labelTitle = s.title || vid;
          opt.textContent = `${labelTitle} (${formatNumberJa(Number(s.itemCount || 0))}件)`;
          if (vid === selectedVideoId) opt.selected = true;
          selectEl.appendChild(opt);
        }
      }
    }
    const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
    const summaryEl = document.getElementById("yt-stream-summary");
    if (summaryEl) {
      if (currentSummary) {
        const bName = currentSummary.broadcasterName ? ` / 配信者: ${currentSummary.broadcasterName}` : "";
        summaryEl.textContent = `記録中: ${currentSummary.title || currentSummary.videoId}${bName}（合計 ${formatNumberJa(totalItemsCount)}件）`;
      } else {
        summaryEl.textContent = "YouTube Live の視聴ページを開くと自動でチャットを記録します";
      }
    }
    const filterBadge = document.getElementById("yt-detected-filter-badge");
    const noticeBanner = document.getElementById("yt-all-chat-notice");
    const filterLabel = String(currentSummary?.chatFilterLabel || "").trim();
    if (filterBadge && noticeBanner) {
      if (!filterLabel) {
        filterBadge.textContent = "チャット表示: 検出待ち";
        noticeBanner.classList.remove("is-warning");
      } else if (/トップチャット|top chat/i.test(filterLabel)) {
        filterBadge.textContent = `現在「${filterLabel}」— 「すべてのチャット」推奨`;
        noticeBanner.classList.add("is-warning");
      } else {
        filterBadge.textContent = `チャット表示: ${filterLabel}`;
        noticeBanner.classList.remove("is-warning");
      }
    }
  }
  async function renderStreamFullLoad() {
    const t0 = performance.now();
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.STREAM_SUMMARIES,
      STORAGE_KEYS.ACTIVE_VIDEO_ID,
      STORAGE_KEYS.VOICE_SETTINGS,
      STORAGE_KEYS.VOICE_QUEUE,
      STORAGE_KEYS.VOICE_STATE
    ]);
    const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
    const activeId = String(data[STORAGE_KEYS.ACTIVE_VIDEO_ID] || "");
    const videoIds = Object.keys(summaries).sort(
      (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0)
    );
    if (!selectedVideoId || !summaries[selectedVideoId]) {
      selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || "";
    }
    const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
    const items = selectedVideoId ? await getYtStreamCommentsByVideoId(selectedVideoId) : [];
    metrics.fullGetAllCount += 1;
    currentIncrementalState = createYtStreamIncrementalState(selectedVideoId, {
      broadcasterChannelId: currentSummary?.broadcasterChannelId || "",
      displayLimit: YT_SIDE_PANEL_DISPLAY_LIMIT
    });
    const applied = applyYtStreamIncrementalItems(currentIncrementalState, items, {
      broadcasterChannelId: currentSummary?.broadcasterChannelId || ""
    });
    updateStreamHeaderUi(summaries, activeId, applied.totalCount);
    renderLiveStatsAndOfficialRow(
      currentSummary,
      applied.totalCount,
      applied.ranking,
      currentIncrementalState
    );
    renderTopSupportRankStrip(currentSummary, applied.ranking);
    renderNorthStarSupportLanes(applied.ranking);
    renderSupportVisualDetails(applied.ranking);
    await renderVoiceUiFromStorage(data);
    renderLaneFull("rinku", applied.laneDisplay.rinku, applied.laneCounts.rinku);
    renderLaneFull("konta", applied.laneDisplay.konta, applied.laneCounts.konta);
    renderLaneFull("tanunee", applied.laneDisplay.tanunee, applied.laneCounts.tanunee);
    metrics.lastFullLoadDurationMs = Math.round((performance.now() - t0) * 100) / 100;
  }
  async function renderStreamIncrementalUpdate() {
    const t0 = performance.now();
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.STREAM_SUMMARIES,
      STORAGE_KEYS.ACTIVE_VIDEO_ID,
      STORAGE_KEYS.VOICE_SETTINGS,
      STORAGE_KEYS.VOICE_QUEUE,
      STORAGE_KEYS.VOICE_STATE
    ]);
    const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
    const activeId = String(data[STORAGE_KEYS.ACTIVE_VIDEO_ID] || "");
    const videoIds = Object.keys(summaries).sort(
      (a, b) => Number(summaries[b]?.updatedAt || 0) - Number(summaries[a]?.updatedAt || 0)
    );
    if (!selectedVideoId || !summaries[selectedVideoId]) {
      selectedVideoId = activeId && summaries[activeId] ? activeId : videoIds[0] || "";
    }
    if (!currentIncrementalState || currentIncrementalState.videoId !== selectedVideoId) {
      await renderStreamFullLoad();
      return;
    }
    const currentSummary = selectedVideoId ? summaries[selectedVideoId] : null;
    const newRecords = selectedVideoId ? await getYtStreamCommentsSince(selectedVideoId, currentIncrementalState.lastRecordedAt) : [];
    metrics.incrementalFetchCount += 1;
    metrics.lastIncrementalFetchedItems = newRecords.length;
    const applied = applyYtStreamIncrementalItems(currentIncrementalState, newRecords, {
      broadcasterChannelId: currentSummary?.broadcasterChannelId || ""
    });
    metrics.lastIncrementalAddedItems = applied.addedCount;
    updateStreamHeaderUi(summaries, activeId, applied.totalCount);
    renderLiveStatsAndOfficialRow(
      currentSummary,
      applied.totalCount,
      applied.ranking,
      currentIncrementalState
    );
    await renderVoiceUiFromStorage(data);
    if (applied.addedCount > 0) {
      patchLaneIncremental("rinku", applied.addedByLane.rinku, applied.laneCounts.rinku);
      patchLaneIncremental("konta", applied.addedByLane.konta, applied.laneCounts.konta);
      patchLaneIncremental("tanunee", applied.addedByLane.tanunee, applied.laneCounts.tanunee);
      renderTopSupportRankStrip(currentSummary, applied.ranking);
      const visualDetailsEl = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("supportVisualDetails")
      );
      if (visualDetailsEl?.open) {
        renderSupportVisualDetails(applied.ranking);
      } else {
        visualDetailsNeedsRefresh = true;
      }
    }
    if (applied.rankingChanged) {
      renderNorthStarSupportLanes(applied.ranking);
    }
    metrics.lastIncrementalDurationMs = Math.round((performance.now() - t0) * 100) / 100;
  }
  function requestVoicevoxRecheck() {
    chrome.runtime.sendMessage({ type: "YT_RECHECK_VOICEVOX" }, () => {
      void chrome.runtime.lastError;
      runRenderSerialized(() => renderVoiceUiFromStorage());
    });
  }
  async function restoreCollapsibleUiState() {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEYS.UI_STATE]);
      const uiState = data[STORAGE_KEYS.UI_STATE] || {};
      const settingsDetails = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("yt-settings-details")
      );
      const comeviewDetails = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("yt-comeview-details")
      );
      const supportVisualDetails = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("supportVisualDetails")
      );
      if (settingsDetails) {
        settingsDetails.open = uiState.settingsOpen === true;
      }
      if (comeviewDetails) {
        comeviewDetails.open = uiState.comeviewOpen === true;
      }
      if (supportVisualDetails) {
        supportVisualDetails.open = uiState.supportVisualOpen === true;
      }
    } catch {
    }
  }
  function saveCollapsibleUiState() {
    try {
      const settingsDetails = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("yt-settings-details")
      );
      const comeviewDetails = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("yt-comeview-details")
      );
      const supportVisualDetails = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("supportVisualDetails")
      );
      chrome.storage.local.set({
        [STORAGE_KEYS.UI_STATE]: {
          settingsOpen: Boolean(settingsDetails?.open),
          comeviewOpen: Boolean(comeviewDetails?.open),
          supportVisualOpen: Boolean(supportVisualDetails?.open)
        }
      });
    } catch {
    }
  }
  function bindUiEvents() {
    const reloadBtn = document.getElementById("reloadWatchTabBtn");
    reloadBtn?.addEventListener("click", () => {
      try {
        chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
          void chrome.runtime.lastError;
          const activeTab = tabs && tabs[0];
          if (activeTab?.id && activeTab.url && /youtube\.com\/watch/i.test(activeTab.url)) {
            chrome.tabs.reload(activeTab.id);
          }
        });
      } catch {
      }
      runRenderSerialized(() => renderStreamFullLoad());
    });
    const openComeviewBtn = document.getElementById("openComeviewBtn");
    openComeviewBtn?.addEventListener("click", () => {
      const comeviewDetails2 = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("yt-comeview-details")
      );
      if (!comeviewDetails2) return;
      comeviewDetails2.open = !comeviewDetails2.open;
      saveCollapsibleUiState();
      if (comeviewDetails2.open) {
        comeviewDetails2.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
    const openVoiceBtn = document.getElementById("openComeviewVoiceBtn");
    openVoiceBtn?.addEventListener("click", () => {
      const settingsDetails2 = (
        /** @type {HTMLDetailsElement | null} */
        document.getElementById("yt-settings-details")
      );
      if (!settingsDetails2) return;
      settingsDetails2.open = !settingsDetails2.open;
      saveCollapsibleUiState();
      if (settingsDetails2.open) {
        settingsDetails2.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
    const supportVisualDetails = (
      /** @type {HTMLDetailsElement | null} */
      document.getElementById("supportVisualDetails")
    );
    supportVisualDetails?.addEventListener("toggle", () => {
      if (supportVisualDetails.open && visualDetailsNeedsRefresh && currentIncrementalState?.rankingAcc?.snapshot) {
        renderSupportVisualDetails(currentIncrementalState.rankingAcc.snapshot);
      }
      saveCollapsibleUiState();
    });
    const comeviewDetails = document.getElementById("yt-comeview-details");
    comeviewDetails?.addEventListener("toggle", () => {
      saveCollapsibleUiState();
    });
    const settingsDetails = document.getElementById("yt-settings-details");
    settingsDetails?.addEventListener("toggle", () => {
      saveCollapsibleUiState();
    });
    const selectEl = (
      /** @type {HTMLSelectElement | null} */
      document.getElementById("yt-stream-select")
    );
    selectEl?.addEventListener("change", () => {
      selectedVideoId = selectEl.value;
      runRenderSerialized(() => renderStreamFullLoad());
    });
    const enabledEl = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-voice-enabled")
    );
    enabledEl?.addEventListener("change", () => {
      chrome.runtime.sendMessage(
        {
          type: "YT_UPDATE_VOICE_SETTINGS",
          payload: { enabled: enabledEl.checked }
        },
        () => {
          void chrome.runtime.lastError;
          runRenderSerialized(() => renderVoiceUiFromStorage());
        }
      );
    });
    const modeEl = (
      /** @type {HTMLSelectElement | null} */
      document.getElementById("yt-voice-mode")
    );
    modeEl?.addEventListener("change", () => {
      chrome.runtime.sendMessage(
        {
          type: "YT_UPDATE_VOICE_SETTINGS",
          payload: { mode: modeEl.value === "select" ? YT_VOICE_MODES.SELECT : YT_VOICE_MODES.ALL }
        },
        () => {
          void chrome.runtime.lastError;
          runRenderSerialized(() => renderVoiceUiFromStorage());
        }
      );
    });
    const bNameInput = (
      /** @type {HTMLInputElement | null} */
      document.getElementById("yt-broadcaster-name-input")
    );
    bNameInput?.addEventListener("change", () => {
      chrome.runtime.sendMessage(
        {
          type: "YT_UPDATE_VOICE_SETTINGS",
          payload: { broadcasterNameOverride: bNameInput.value.trim() }
        },
        () => {
          void chrome.runtime.lastError;
          runRenderSerialized(() => renderVoiceUiFromStorage());
        }
      );
    });
    const recheckBtn = document.getElementById("yt-voice-recheck-btn");
    recheckBtn?.addEventListener("click", () => {
      requestVoicevoxRecheck();
    });
    const clearBtn = document.getElementById("yt-voice-clear-btn");
    clearBtn?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "YT_CLEAR_VOICE_QUEUE" }, () => {
        void chrome.runtime.lastError;
        runRenderSerialized(() => renderVoiceUiFromStorage());
      });
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes[STORAGE_KEYS.UI_STATE] && Object.keys(changes).length === 1) {
        return;
      }
      const streamChanged = Boolean(
        changes[STORAGE_KEYS.STREAM_SUMMARIES] || changes[STORAGE_KEYS.ACTIVE_VIDEO_ID]
      );
      if (streamChanged) {
        runRenderSerialized(() => renderStreamIncrementalUpdate());
      } else {
        metrics.voiceOnlyUpdateCount += 1;
        runRenderSerialized(() => renderVoiceUiFromStorage());
      }
    });
  }
  async function initSidepanel() {
    await restoreCollapsibleUiState();
    bindUiEvents();
    await runRenderSerialized(() => renderStreamFullLoad());
    requestVoicevoxRecheck();
  }
  initSidepanel();
})();
